import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeCron } from "@/lib/cron-auth";
import { CONFIG_PADRAO, parseTrackSettings } from "@/lib/track/settings";

/**
 * Purga de conteúdo de conversa.
 *
 * O Track guarda mensagem de terceiro: não do nosso cliente, do consumidor
 * final dele. É o dado mais sensível do produto, e o painel promete um prazo
 * de retenção por workspace. Sem esta rotina o prazo seria só um número numa
 * tela, e o banco acumularia conversa alheia para sempre.
 *
 * O que é apagado é o TEXTO. A linha da mensagem fica, porque as contagens de
 * entrada e saída sustentam o funil histórico e não têm dado pessoal.
 *
 * Roda uma vez por dia, de madrugada.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Prazo para apagar conversa de workspace removido.
 *
 * O soft delete existe para permitir arrependimento, mas depois de um mês sem
 * restaurar a relação acabou e não há base para guardar conversa de terceiro.
 */
const DIAS_APOS_REMOVER_WORKSPACE = 30;

/** Teto por execução, para a rotina não segurar a requisição. */
const LOTE = 5000;

export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const resumo = {
    workspacesVarridos: 0,
    textosApagados: 0,
    conversasDeWorkspaceRemovido: 0,
    mensagensDeWorkspaceRemovido: 0,
  };

  // ── 1. retenção normal, por workspace ────────────────────────────
  const workspaces = await db.workspace.findMany({
    where: { deletedAt: null, trackConversations: { some: {} } },
    select: { id: true, trackSettings: true },
    take: 500,
  });

  for (const ws of workspaces) {
    const cfg = parseTrackSettings(ws.trackSettings);
    const corte = new Date(Date.now() - cfg.messageRetentionDays * 86400_000);
    resumo.workspacesVarridos++;

    // Só as que ainda têm texto: sem este filtro a query reescreveria as
    // mesmas linhas todo dia.
    const r = await db.trackMessage.updateMany({
      where: {
        conversation: { workspaceId: ws.id },
        sentAt: { lt: corte },
        text: { not: null },
      },
      data: { text: null },
    });
    resumo.textosApagados += r.count;
  }

  // ── 2. workspace removido: apaga de vez ──────────────────────────
  const corteRemovidos = new Date(Date.now() - DIAS_APOS_REMOVER_WORKSPACE * 86400_000);
  const removidos = await db.workspace.findMany({
    where: { deletedAt: { lt: corteRemovidos }, trackConversations: { some: {} } },
    select: { id: true, name: true },
    take: 50,
  });

  for (const ws of removidos) {
    const conversas = await db.trackConversation.findMany({
      where: { workspaceId: ws.id },
      select: { id: true },
      take: LOTE,
    });
    if (conversas.length === 0) continue;

    const ids = conversas.map((c) => c.id);
    const msgs = await db.trackMessage.deleteMany({ where: { conversationId: { in: ids } } });
    // As conversas saem por último: eventos e despachos vão junto por cascade.
    const convs = await db.trackConversation.deleteMany({ where: { id: { in: ids } } });

    resumo.mensagensDeWorkspaceRemovido += msgs.count;
    resumo.conversasDeWorkspaceRemovido += convs.count;
    console.warn(
      `[cron/track-retention] workspace "${ws.name}" removido há mais de ${DIAS_APOS_REMOVER_WORKSPACE} dias: ` +
        `apaguei ${convs.count} conversa(s) e ${msgs.count} mensagem(ns)`,
    );
  }

  return NextResponse.json({
    ok: true,
    ...resumo,
    retencaoPadraoDias: CONFIG_PADRAO.messageRetentionDays,
  });
}
