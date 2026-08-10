import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeCron } from "@/lib/cron-auth";
import { repararEventosOrfaos } from "@/lib/track/events";
import { parseTrackSettings } from "@/lib/track/settings";
import { classificarErroCapi, enviarEventosCapi, EVENTO_PADRAO } from "@/lib/meta-capi";
import { getStoredMetaToken } from "@/lib/meta-token";
import {
  classificarErroDeConversao,
  formatConversionDateTime,
  getValidGoogleToken,
  resolveConversionCustomerId,
  resolveLoginCustomerId,
  uploadClickConversions,
  type ClickConversion,
} from "@/lib/google-ads";

/**
 * Envia as conversões da fila para o Google Ads.
 *
 * Roda de 5 em 5 minutos pelo crontab da VPS. É o último passo do produto: é
 * aqui que a etiqueta "Pago" que o atendente colocou no celular vira um número
 * dentro da conta de anúncios do cliente.
 *
 * Regras que impedem os dois desastres possíveis (mandar conversão a mais ou
 * a menos):
 *
 * - Claim atômico com updateMany: dois ticks sobrepostos nunca enviam a mesma
 *   linha, porque só quem conseguiu mudar o status de pending para sending
 *   segue adiante.
 * - orderId determinístico (o id do despacho): se a resposta se perder na rede
 *   depois do Google já ter aceitado, o retry cai em DUPLICATE_ORDER_ID, que
 *   tratamos como sucesso.
 * - Janela de 90 dias conferida antes de gastar chamada: gclid mais velho que
 *   isso o Google recusa sempre, então vira expired em vez de ficar em retry
 *   eterno.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Teto por execução, para não estourar o tempo da requisição. */
const LOTE_MAX = 200;
/** O Google aceita até 2000 por chamada; 200 mantém o payload pequeno. */
const TAMANHO_LOTE_API = 200;
/** Um lock preso mais que isso é de um processo que morreu no meio. */
const LOCK_MORTO_MS = 10 * 60_000;
/** gclid vale 90 dias. Depois disso não adianta tentar. */
const JANELA_GCLID_DIAS = 90;
/**
 * O Meta recusa evento com mais de 7 dias na Conversions API. Insistir depois
 * disso só gasta chamada e enche a fila de retry que nunca vai passar.
 */
const JANELA_CTWA_DIAS = 7;
const MAX_TENTATIVAS = 8;

/** 5min, 15min, 1h, 6h, 24h, e daí em diante 24h. */
const BACKOFF_MS = [5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 3600_000, 24 * 3600_000];

function proximaTentativa(tentativas: number): Date {
  const espera = BACKOFF_MS[Math.min(tentativas, BACKOFF_MS.length - 1)];
  return new Date(Date.now() + espera);
}

export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const simular = req.nextUrl.searchParams.get("validateOnly") === "1";
  const agora = new Date();

  // Devolve à fila o que ficou preso num processo que morreu.
  const destravados = await db.trackDispatch.updateMany({
    where: { status: "sending", lockedAt: { lt: new Date(Date.now() - LOCK_MORTO_MS) } },
    data: { status: "pending", lockedAt: null },
  });

  // Venda registrada que nunca chegou a virar envio, porque o processo morreu
  // entre gravar o evento e enfileirar. Sem esta varredura ela ficaria visível
  // no painel e ausente na campanha, que é o pior erro possível aqui: parece
  // que deu certo.
  const reparo = await repararEventosOrfaos(db, async (workspaceId) =>
    parseTrackSettings(await db.trackSettings.findUnique({ where: { workspaceId } })),
  );
  if (reparo.enfileirados > 0) {
    console.warn(
      `[cron/track-dispatch] reparei ${reparo.enfileirados} conversão(ões) órfã(s) de ${reparo.reparados} evento(s)`,
    );
  }

  const candidatos = await db.trackDispatch.findMany({
    where: { status: "pending", nextAttemptAt: { lte: agora }, notBeforeAt: { lte: agora } },
    orderBy: { nextAttemptAt: "asc" },
    take: LOTE_MAX,
    select: { id: true },
  });

  if (candidatos.length === 0) {
    return NextResponse.json({ ok: true, enviados: 0, destravados: destravados.count });
  }

  // Claim atômico: só segue com as linhas que ESTE processo conseguiu marcar.
  const ids = candidatos.map((c) => c.id);
  const travados = await db.trackDispatch.updateMany({
    where: { id: { in: ids }, status: "pending" },
    data: { status: "sending", lockedAt: agora },
  });
  if (travados.count === 0) {
    return NextResponse.json({ ok: true, enviados: 0, nota: "outro tick pegou primeiro" });
  }

  const despachos = await db.trackDispatch.findMany({
    where: { id: { in: ids }, status: "sending", lockedAt: agora },
    select: {
      id: true, workspaceId: true, platform: true, attempts: true, targetId: true,
      event: {
        select: {
          stage: true, value: true, currency: true, occurredAt: true,
          conversation: {
            select: {
              gclid: true, wbraid: true, gbraid: true, ctwaClid: true,
              clickId: true, firstMessageAt: true,
            },
          },
        },
      },
    },
  });

  const porConta = new Map<string, typeof despachos>();
  const resumo = { enviados: 0, falhos: 0, expirados: 0, ignorados: 0, destravados: destravados.count };

  for (const d of despachos) {
    const c = d.event.conversation;

    if (d.platform === "meta") {
      // No Meta a atribuição vem dentro da própria mensagem, não da URL.
      if (!c.ctwaClid) {
        await marcar(d.id, "skipped", "conversa não veio de anúncio do Meta", d.attempts);
        resumo.ignorados++;
        continue;
      }
    } else if (d.platform === "google") {
      // wbraid e gbraid substituem o gclid quando o consentimento limita o
      // identificador: iOS, PMax e YouTube. Aceitar só gclid deixaria essas
      // campanhas sem nenhuma conversão reportada.
      if (!c.gclid && !c.wbraid && !c.gbraid) {
        await marcar(d.id, "skipped", "conversa sem identificador de clique do Google", d.attempts);
        resumo.ignorados++;
        continue;
      }
    } else {
      await marcar(d.id, "skipped", `plataforma ${d.platform} não suportada`, d.attempts);
      resumo.ignorados++;
      continue;
    }

    /*
     * Cada plataforma expira uma coisa diferente. No Google é o CLIQUE que
     * vence (gclid vale 90 dias), então a idade certa é a da primeira
     * mensagem. No Meta o limite duro da API é a idade do EVENTO
     * (event_time até 7 dias atrás): uma venda de ontem numa conversa de 6
     * dias é perfeitamente válida, e medir pelo clique a descartaria.
     */
    const referencia =
      d.platform === "meta" ? d.event.occurredAt : d.event.conversation.firstMessageAt;
    const idadeDias = (Date.now() - referencia.getTime()) / 86400_000;
    const janela = d.platform === "meta" ? JANELA_CTWA_DIAS : JANELA_GCLID_DIAS;
    if (idadeDias > janela) {
      await marcar(
        d.id,
        "expired",
        `clique tem ${Math.round(idadeDias)} dias, passou da janela de ${janela} da plataforma`,
        d.attempts,
      );
      resumo.expirados++;
      continue;
    }

    const chave = `${d.workspaceId}::${d.targetId}`;
    const lista = porConta.get(chave) ?? [];
    lista.push(d);
    porConta.set(chave, lista);
  }

  for (const [chave, grupo] of porConta) {
    const [workspaceId, targetId] = chave.split("::");
    try {
      const r = grupo[0]?.platform === "meta"
        ? await enviarGrupoMeta(workspaceId, targetId, grupo, simular)
        : await enviarGrupo(workspaceId, targetId, grupo, simular);
      resumo.enviados += r.ok;
      resumo.falhos += r.falhos;
    } catch (err) {
      const msg = (err as Error).message;
      console.error(`[cron/track-dispatch] grupo ${chave} falhou:`, msg);
      for (const d of grupo) {
        await falhar(d.id, d.attempts, `erro inesperado: ${msg}`);
        resumo.falhos++;
      }
    }
  }

  return NextResponse.json({ ok: true, ...resumo, simulacao: simular });
}

type Despacho = {
  id: string;
  attempts: number;
  platform: string;
  event: {
    stage: string;
    value: number | null;
    currency: string;
    occurredAt: Date;
    conversation: {
      gclid: string | null;
      wbraid: string | null;
      gbraid: string | null;
      ctwaClid: string | null;
    };
  };
};

async function enviarGrupo(
  workspaceId: string,
  targetId: string,
  grupo: Despacho[],
  simular: boolean,
): Promise<{ ok: number; falhos: number }> {
  const alvo = await db.trackConversionTarget.findUnique({ where: { id: targetId } });
  if (!alvo?.enabled || !alvo.conversionActionId || !alvo.customerId) {
    for (const d of grupo) {
      await marcar(d.id, "skipped", "destino de conversão incompleto ou desligado", d.attempts);
    }
    return { ok: 0, falhos: 0 };
  }

  // O token é do dono do workspace: é a conta Google que a agência conectou.
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { ownerId: true },
  });
  if (!ws?.ownerId) {
    for (const d of grupo) await falhar(d.id, d.attempts, "workspace sem dono");
    return { ok: 0, falhos: grupo.length };
  }

  const tokenInfo = await getValidGoogleToken(ws.ownerId);
  if (!tokenInfo) {
    // Token morto é transitório de propósito: a agência reconecta e a fila
    // drena sozinha, sem perder venda nenhuma.
    for (const d of grupo) await falhar(d.id, d.attempts, "conta Google desconectada, reconecte em Integrações");
    return { ok: 0, falhos: grupo.length };
  }

  const loginCustomerId = alvo.loginCustomerId || resolveLoginCustomerId(alvo.customerId);
  const contaDeConversao = await resolveConversionCustomerId(
    alvo.customerId,
    tokenInfo.accessToken,
    loginCustomerId,
  );

  const resourceAction = `customers/${contaDeConversao}/conversionActions/${alvo.conversionActionId}`;
  const conversoes: ClickConversion[] = grupo.map((d) => ({
    // Exatamente UM identificador por conversão: mandar dois faz a API recusar.
    ...(d.event.conversation.gclid
      ? { gclid: d.event.conversation.gclid }
      : d.event.conversation.wbraid
        ? { wbraid: d.event.conversation.wbraid }
        : { gbraid: d.event.conversation.gbraid! }),
    conversionAction: resourceAction,
    conversionDateTime: formatConversionDateTime(d.event.occurredAt),
    ...(alvo.sendValue && d.event.value != null
      ? { conversionValue: d.event.value, currencyCode: d.event.currency || "BRL" }
      : {}),
    // Deduplicação do lado do Google: se a resposta se perder na rede depois
    // do aceite, o retry volta como DUPLICATE_ORDER_ID e conta como sucesso.
    orderId: d.id,
  }));

  let ok = 0;
  let falhos = 0;

  for (let i = 0; i < conversoes.length; i += TAMANHO_LOTE_API) {
    const fatia = conversoes.slice(i, i + TAMANHO_LOTE_API);
    const despachosDaFatia = grupo.slice(i, i + TAMANHO_LOTE_API);

    const resultado = await uploadClickConversions({
      customerId: contaDeConversao,
      token: tokenInfo.accessToken,
      loginCustomerId,
      conversions: fatia,
      validateOnly: simular,
    });

    const payloadPedido = JSON.stringify({ conta: contaDeConversao, conversoes: fatia }).slice(0, 4000);
    const payloadResposta = JSON.stringify(resultado.respostaCrua).slice(0, 4000);

    if (!resultado.ok && resultado.erroGeral) {
      const tipo = classificarErroDeConversao(resultado.erroGeral.codigo);
      for (const d of despachosDaFatia) {
        if (tipo === "permanente") {
          await marcar(d.id, "failed", `${resultado.erroGeral.codigo}: ${resultado.erroGeral.mensagem}`, d.attempts, payloadPedido, payloadResposta);
        } else {
          await falhar(d.id, d.attempts, `${resultado.erroGeral.codigo}: ${resultado.erroGeral.mensagem}`, payloadPedido, payloadResposta);
        }
        falhos++;
      }
      continue;
    }

    for (let j = 0; j < despachosDaFatia.length; j++) {
      const d = despachosDaFatia[j];
      const erro = resultado.errosPorIndice.get(j);

      if (!erro) {
        // Numa simulação nada foi gravado no Google: a linha volta para a fila.
        if (simular) {
          await db.trackDispatch.update({
            where: { id: d.id },
            data: { status: "pending", lockedAt: null, lastError: null, responsePayload: payloadResposta },
          });
        } else {
          await marcar(d.id, "sent", null, d.attempts, payloadPedido, payloadResposta);
        }
        ok++;
        continue;
      }

      const tipo = classificarErroDeConversao(erro.codigo);
      if (tipo === "sucesso") {
        await marcar(d.id, "sent", `${erro.codigo} (o Google já tinha esta conversão)`, d.attempts, payloadPedido, payloadResposta);
        ok++;
      } else if (tipo === "permanente") {
        await marcar(d.id, "failed", `${erro.codigo}: ${erro.mensagem}`, d.attempts, payloadPedido, payloadResposta);
        falhos++;
      } else {
        await falhar(d.id, d.attempts, `${erro.codigo}: ${erro.mensagem}`, payloadPedido, payloadResposta);
        falhos++;
      }
    }
  }

  return { ok, falhos };
}

/**
 * Envia um grupo de conversões para o Meta.
 *
 * A diferença de fundo em relação ao Google: não existe link rastreável nem
 * nada a configurar no anúncio. O `ctwa_clid` vem dentro da própria mensagem
 * de quem clicou, então o que precisa ser configurado é só o destino.
 */
async function enviarGrupoMeta(
  workspaceId: string,
  targetId: string,
  grupo: Despacho[],
  simular: boolean,
): Promise<{ ok: number; falhos: number }> {
  const alvo = await db.trackConversionTarget.findUnique({ where: { id: targetId } });
  if (!alvo?.enabled || !alvo.datasetId) {
    for (const d of grupo) {
      await marcar(d.id, "skipped", "destino do Meta incompleto ou desligado", d.attempts);
    }
    return { ok: 0, falhos: 0 };
  }

  /*
   * O token do próprio destino vem primeiro.
   *
   * O token de usuário da conexão OAuth costuma NÃO ter permissão no dataset
   * de mensagens: o caminho normal é um token de system user gerado por
   * cliente. Cair na conexão do dono é só uma conveniência para quem tiver a
   * permissão certa.
   */
  let token = alvo.apiToken;
  if (!token) {
    const ws = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true },
    });
    token = ws?.ownerId ? await getStoredMetaToken(ws.ownerId) : null;
  }
  if (!token) {
    for (const d of grupo) {
      await falhar(d.id, d.attempts, "sem token do Meta. Cole um token de system user na aba Envio.");
    }
    return { ok: 0, falhos: grupo.length };
  }

  const eventos = grupo.map((d) => {
    const eventName = alvo.eventName || EVENTO_PADRAO[d.event.stage] || "Lead";
    /*
     * Purchase é o único evento em que value e currency são OBRIGATÓRIOS na
     * Conversions API: sem eles o Meta recusa. E era exatamente o que a
     * configuração padrão produzia (sendValue desligado), com o agravante de
     * o teste de permissão usar Lead, então o teste passava e o envio real
     * falhava. Para Purchase o valor vai sempre: o da venda, ou o padrão do
     * destino, ou zero, que o Meta aceita.
     */
    const ehPurchase = eventName === "Purchase";
    const valor = alvo.sendValue || ehPurchase
      ? d.event.value ?? alvo.defaultValue ?? (ehPurchase ? 0 : null)
      : null;
    return {
      eventName,
      // Em segundos, e do momento em que o fato aconteceu.
      eventTime: Math.floor(d.event.occurredAt.getTime() / 1000),
      // Deduplicação do lado do Meta, igual ao orderId do Google.
      eventId: d.id,
      ctwaClid: d.event.conversation.ctwaClid!,
      valor,
      moeda: d.event.currency || "BRL",
    };
  });

  const resultado = await enviarEventosCapi({
    datasetId: alvo.datasetId,
    accessToken: token,
    eventos,
    // Em simulação o evento vai marcado como teste: aparece no Gerenciador
    // de Eventos para conferência e não entra na otimização da campanha.
    testEventCode: simular ? "TEST_DASHFYS" : null,
  });

  const pedido = JSON.stringify({ dataset: alvo.datasetId, eventos }).slice(0, 4000);
  const resposta = JSON.stringify(resultado.respostaCrua).slice(0, 4000);

  if (!resultado.ok && resultado.erro) {
    const tipo = classificarErroCapi(resultado.erro.codigo, resultado.erro.tipo);

    /*
     * A CAPI não tem falha parcial como o Google: o lote é tudo ou nada. Um
     * único evento malformado derrubaria os outros de forma PERMANENTE, e
     * vendas boas morreriam por culpa de uma vizinha de lote. Com erro
     * permanente num lote de vários, reenvia um a um: o podre falha sozinho
     * e os bons passam.
     */
    if (tipo === "permanente" && grupo.length > 1) {
      let ok = 0;
      let falhos = 0;
      for (let i = 0; i < grupo.length; i++) {
        const d = grupo[i];
        const solo = await enviarEventosCapi({
          datasetId: alvo.datasetId,
          accessToken: token,
          eventos: [eventos[i]],
          testEventCode: simular ? "TEST_DASHFYS" : null,
        });
        const pedidoSolo = JSON.stringify({ dataset: alvo.datasetId, eventos: [eventos[i]] }).slice(0, 4000);
        const respostaSolo = JSON.stringify(solo.respostaCrua).slice(0, 4000);
        if (solo.ok) {
          if (simular) {
            await db.trackDispatch.update({
              where: { id: d.id },
              data: { status: "pending", lockedAt: null, lastError: null, responsePayload: respostaSolo },
            });
          } else {
            await marcar(d.id, "sent", null, d.attempts, pedidoSolo, respostaSolo);
          }
          ok++;
        } else {
          const msgSolo = `${solo.erro?.codigo}: ${solo.erro?.mensagem}`;
          const tipoSolo = classificarErroCapi(solo.erro?.codigo ?? "", solo.erro?.tipo);
          if (tipoSolo === "permanente") await marcar(d.id, "failed", msgSolo, d.attempts, pedidoSolo, respostaSolo);
          else await falhar(d.id, d.attempts, msgSolo, pedidoSolo, respostaSolo);
          falhos++;
        }
      }
      return { ok, falhos };
    }

    for (const d of grupo) {
      const msg = `${resultado.erro.codigo}: ${resultado.erro.mensagem}`;
      if (tipo === "permanente") await marcar(d.id, "failed", msg, d.attempts, pedido, resposta);
      else await falhar(d.id, d.attempts, msg, pedido, resposta);
    }
    return { ok: 0, falhos: grupo.length };
  }

  for (const d of grupo) {
    if (simular) {
      // Nada foi contabilizado de verdade: a linha volta para a fila.
      await db.trackDispatch.update({
        where: { id: d.id },
        data: { status: "pending", lockedAt: null, lastError: null, responsePayload: resposta },
      });
    } else {
      await marcar(d.id, "sent", null, d.attempts, pedido, resposta);
    }
  }
  return { ok: grupo.length, falhos: 0 };
}

async function marcar(
  id: string,
  status: string,
  erro: string | null,
  tentativas: number,
  pedido?: string,
  resposta?: string,
): Promise<void> {
  await db.trackDispatch.update({
    where: { id },
    data: {
      status,
      lockedAt: null,
      attempts: tentativas + 1,
      lastError: erro,
      ...(status === "sent" ? { sentAt: new Date() } : {}),
      ...(pedido ? { requestPayload: pedido } : {}),
      ...(resposta ? { responsePayload: resposta } : {}),
    },
  });
}

/** Volta para a fila com backoff, ou desiste se já tentou demais. */
async function falhar(
  id: string,
  tentativas: number,
  erro: string,
  pedido?: string,
  resposta?: string,
): Promise<void> {
  const proximas = tentativas + 1;
  const desistiu = proximas >= MAX_TENTATIVAS;
  await db.trackDispatch.update({
    where: { id },
    data: {
      status: desistiu ? "failed" : "pending",
      lockedAt: null,
      attempts: proximas,
      nextAttemptAt: proximaTentativa(proximas),
      lastError: desistiu ? `desisti após ${proximas} tentativas. Último erro: ${erro}` : erro,
      ...(pedido ? { requestPayload: pedido } : {}),
      ...(resposta ? { responsePayload: resposta } : {}),
    },
  });
}
