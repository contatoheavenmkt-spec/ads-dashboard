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
    const res = await fetch(
      `${GRAPH}/${datasetId}?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
    );
    const data = await res.json().catch(() => ({}));
    if (data?.error) {
      return { ok: false, erro: data.error.message ?? "sem acesso ao dataset" };
    }
    return { ok: true, nome: data?.name };
  } catch (err) {
    return { ok: false, erro: (err as Error).message };
  }
}
