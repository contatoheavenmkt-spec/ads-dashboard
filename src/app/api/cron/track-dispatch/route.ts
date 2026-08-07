import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeCron } from "@/lib/cron-auth";
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
          conversation: { select: { gclid: true, clickId: true, firstMessageAt: true } },
        },
      },
    },
  });

  const porConta = new Map<string, typeof despachos>();
  const resumo = { enviados: 0, falhos: 0, expirados: 0, ignorados: 0, destravados: destravados.count };

  for (const d of despachos) {
    if (d.platform !== "google") {
      // Meta entra numa fase seguinte; por ora sai da fila sem tentar.
      await marcar(d.id, "skipped", "plataforma ainda não suportada", d.attempts);
      resumo.ignorados++;
      continue;
    }

    const gclid = d.event.conversation.gclid;
    if (!gclid) {
      await marcar(d.id, "skipped", "conversa sem gclid", d.attempts);
      resumo.ignorados++;
      continue;
    }

    // Idade do CLIQUE, não do evento: é o gclid que expira.
    const nascimento = d.event.conversation.firstMessageAt;
    const idadeDias = (Date.now() - nascimento.getTime()) / 86400_000;
    if (idadeDias > JANELA_GCLID_DIAS) {
      await marcar(
        d.id,
        "expired",
        `clique tem ${Math.round(idadeDias)} dias, passou da janela de ${JANELA_GCLID_DIAS} do gclid`,
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
      const r = await enviarGrupo(workspaceId, targetId, grupo, simular);
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
  event: {
    stage: string;
    value: number | null;
    currency: string;
    occurredAt: Date;
    conversation: { gclid: string | null };
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
    gclid: d.event.conversation.gclid!,
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
