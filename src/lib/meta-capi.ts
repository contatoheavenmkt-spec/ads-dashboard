/**
 * Conversions API do Meta, para conversão vinda de conversa no WhatsApp.
 *
 * É o espelho do que `google-ads.ts` faz do outro lado. A diferença é de onde
 * vem a atribuição: no Google ela chega pela URL do clique (gclid), no Meta
 * ela chega DENTRO da própria mensagem (`ctwa_clid`), então não existe link
 * rastreável nem nada para configurar no anúncio.
 */

const GRAPH = "https://graph.facebook.com/v22.0";

/** Nomes que o Meta já entende. Um customizado também funciona. */
export const EVENTOS_META = ["Purchase", "Lead", "Contact", "Schedule", "SubmitApplication"] as const;

/** Sugestão por estágio, para a tela não deixar o campo em branco. */
export const EVENTO_PADRAO: Record<string, string> = {
  lead: "Lead",
  respondeu: "Contact",
  qualificado: "Lead",
  venda: "Purchase",
};

export interface EventoCapi {
  /** Purchase, Lead, Contact, ou customizado. */
  eventName: string;
  /** Quando aconteceu de verdade, em segundos. */
  eventTime: number;
  /** Chave de deduplicação do lado do Meta. Usamos o id do despacho. */
  eventId: string;
  /** O identificador que veio na mensagem de quem clicou no anúncio. */
  ctwaClid: string;
  valor?: number | null;
  moeda?: string;
}

export interface ResultadoCapi {
  ok: boolean;
  recebidos: number;
  erro?: { codigo: string; mensagem: string; tipo?: string };
  fbtraceId?: string;
  respostaCrua: unknown;
}

/**
 * Envia eventos de conversa para o dataset.
 *
 * Três coisas que a API exige neste caso específico e que não são óbvias:
 *
 * - `action_source: "business_messaging"`, e não "website". Com o valor errado
 *   o Meta aceita o evento e não atribui a campanha nenhuma.
 * - `messaging_channel: "whatsapp"` dentro de `messaging_channel`.
 * - O `ctwa_clid` vai em `user_data`, sem hash. Ele não é dado pessoal, é um
 *   identificador de clique, então não passa por SHA-256 como e-mail e
 *   telefone passariam.
 */
export async function enviarEventosCapi(p: {
  datasetId: string;
  accessToken: string;
  eventos: EventoCapi[];
  /** Manda como teste: aparece no Gerenciador de Eventos e não conta. */
  testEventCode?: string | null;
}): Promise<ResultadoCapi> {
  const data = p.eventos.map((e) => ({
    event_name: e.eventName,
    event_time: e.eventTime,
    event_id: e.eventId,
    action_source: "business_messaging",
    messaging_channel: "whatsapp",
    user_data: {
      ctwa_clid: e.ctwaClid,
    },
    ...(e.valor != null
      ? { custom_data: { value: e.valor, currency: e.moeda || "BRL" } }
      : {}),
  }));

  const corpo: Record<string, unknown> = { data };
  if (p.testEventCode) corpo.test_event_code = p.testEventCode;

  const res = await fetch(`${GRAPH}/${p.datasetId}/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${p.accessToken}`,
    },
    body: JSON.stringify(corpo),
  });

  const resposta = await res.json().catch(() => ({}));
  const fbtraceId = resposta?.fbtrace_id;

  if (resposta?.error) {
    return {
      ok: false,
      recebidos: 0,
      erro: {
        codigo: String(resposta.error.code ?? resposta.error.type ?? "ERRO"),
        mensagem: resposta.error.message ?? "falha no envio",
        tipo: resposta.error.type,
      },
      fbtraceId,
      respostaCrua: resposta,
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      recebidos: 0,
      erro: { codigo: String(res.status), mensagem: `HTTP ${res.status}` },
      fbtraceId,
      respostaCrua: resposta,
    };
  }

  return {
    ok: true,
    recebidos: Number(resposta?.events_received ?? p.eventos.length),
    fbtraceId,
    respostaCrua: resposta,
  };
}

/**
 * Vale a pena tentar de novo?
 *
 * Mesma lógica do lado do Google: distinguir isso evita ficar batendo à toa
 * num erro que nunca vai passar, e evita desistir de uma venda boa por um
 * soluço de rede.
 */
export function classificarErroCapi(codigo: string, tipo?: string): "permanente" | "transitorio" {
  const permanentes = [
    "190", // token inválido ou expirado
    "200", // sem permissão no dataset
    "100", // parâmetro inválido (dataset errado, evento malformado)
    "803", // objeto não existe
  ];
  if (permanentes.includes(codigo)) return "permanente";
  if (tipo === "OAuthException") return "permanente";

  // 1 (desconhecido), 2 (temporário), 4 e 17 (limite de chamadas) valem retry.
  return "transitorio";
}

/**
 * Confere se o token enxerga o dataset, antes de ligar o envio.
 *
 * Sem esta checagem o cliente só descobriria o problema horas depois, na fila,
 * quando a venda já tivesse acontecido e o evento falhado em silêncio.
 */
export async function validarDataset(
  datasetId: string,
  accessToken: string,
): Promise<{ ok: boolean; nome?: string; erro?: string }> {
  try {
    // Token no header, nunca na query string: URL vai parar em log de proxy
    // e de servidor, e um token de BM vazado dá acesso às contas do cliente.
    const res = await fetch(`${GRAPH}/${datasetId}?fields=id,name`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json().catch(() => ({}));
    if (data?.error) {
      return { ok: false, erro: data.error.message ?? "sem acesso ao dataset" };
    }
    return { ok: true, nome: data?.name };
  } catch (err) {
    return { ok: false, erro: (err as Error).message };
  }
}

/* ─────────────────── descoberta automática ─────────────────── */

export interface DatasetMeta {
  id: string;
  nome: string;
  /** De onde veio: a BM ligada ao cliente ou a conta de anúncio. */
  origem: string;
  /** O token que temos consegue escrever nele? */
  usavel: boolean;
  motivo?: string;
}

/**
 * Descobre os datasets que o cliente já tem, usando a conexão que a agência
 * fez no login.
 *
 * O OAuth do produto já pede `business_management` e `ads_management`, então
 * na maior parte dos casos dá para listar tudo sozinho e o usuário só escolhe
 * numa lista, em vez de caçar um ID no Gerenciador de Eventos e colar na mão.
 *
 * Quando o token não alcança algum dataset, ele aparece marcado como não
 * usável com o motivo, em vez de sumir da lista: assim a pessoa entende que
 * o problema é permissão, não ausência.
 */
export async function descobrirDatasets(p: {
  accessToken: string;
  /** BMs já ligadas ao cliente. */
  businessIds: string[];
  /** Contas de anúncio do cliente, para achar dataset ligado a elas. */
  adAccountIds?: string[];
}): Promise<{ datasets: DatasetMeta[]; avisos: string[] }> {
  const achados = new Map<string, DatasetMeta>();
  const avisos: string[] = [];

  async function buscar(url: string, origem: string) {
    try {
      // Token no header, nunca na query string: URL vai parar em log de
      // proxy, e um token de BM vazado dá acesso às contas do cliente.
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${p.accessToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (data?.error) {
        avisos.push(`${origem}: ${data.error.message ?? "sem acesso"}`);
        return;
      }
      for (const item of data?.data ?? []) {
        if (!item?.id) continue;
        if (achados.has(item.id)) continue;
        achados.set(item.id, {
          id: String(item.id),
          nome: item.name ?? `Dataset ${item.id}`,
          origem,
          // A permissão real só se confirma na escrita; aqui é otimista e a
          // validação faz a prova antes de ligar.
          usavel: true,
        });
      }
    } catch (err) {
      avisos.push(`${origem}: ${(err as Error).message}`);
    }
  }

  // Datasets da BM: é onde ficam os de mensagem (CTWA).
  for (const bm of p.businessIds) {
    await buscar(`${GRAPH}/${bm}/owned_pixels?fields=id,name&limit=100`, "BM (próprios)");
    await buscar(`${GRAPH}/${bm}/client_pixels?fields=id,name&limit=100`, "BM (compartilhados)");
  }

  // Alguns datasets aparecem só pela conta de anúncio.
  for (const conta of p.adAccountIds ?? []) {
    const id = conta.startsWith("act_") ? conta : `act_${conta}`;
    await buscar(`${GRAPH}/${id}/adspixels?fields=id,name&limit=100`, "Conta de anúncio");
  }

  return { datasets: [...achados.values()], avisos };
}

/**
 * Prova de fogo antes de ligar: manda um evento de TESTE de verdade.
 *
 * Listar o dataset não garante permissão de escrita, que é o que importa.
 * Este envio usa `test_event_code`, então aparece no Gerenciador de Eventos
 * para conferência e não conta para a campanha. É a diferença entre descobrir
 * o problema agora ou daqui a três dias, quando a venda já aconteceu.
 */
export async function testarEscrita(
  datasetId: string,
  accessToken: string,
): Promise<{ ok: boolean; erro?: string }> {
  const r = await enviarEventosCapi({
    datasetId,
    accessToken,
    testEventCode: "TEST_DASHFYS",
    eventos: [
      {
        eventName: "Lead",
        eventTime: Math.floor(Date.now() / 1000),
        eventId: `teste-dashfys-${Date.now()}`,
        // Valor sintético só para a chamada ter forma válida.
        ctwaClid: "teste_de_permissao_dashfys",
      },
    ],
  });
  if (r.ok) return { ok: true };
  return { ok: false, erro: `${r.erro?.codigo}: ${r.erro?.mensagem}` };
}
