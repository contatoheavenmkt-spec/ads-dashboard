import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStoredMetaToken } from "@/lib/meta-token";
import { getAccountsInsights, aggregateInsights } from "@/lib/meta-api";
import { sendToWorkspaceClients } from "@/lib/push";
import { authorizeCron, brToday } from "@/lib/cron-auth";

/**
 * Resumo diário — rodado às 18h BRT pelo crontab. Manda pra cada workspace
 * com integração Meta um "como foi seu dia até agora": vendas, mensagens
 * iniciadas e investimento. Só dispara se houve alguma atividade hoje
 * (evita notificar "0 vendas, 0 mensagens" em conta sem rodar).
 */
export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const today = brToday();
  let sent = 0;
  let skipped = 0;

  const workspaces = await db.workspace.findMany({
    where: {
      deletedAt: null,
      integrations: { some: { integration: { platform: "meta", status: "active" } } },
    },
    include: { integrations: { include: { integration: true } } },
    take: 200,
  });

  for (const ws of workspaces) {
    if (!ws.ownerId) {
      skipped++;
      continue;
    }
    const token = await getStoredMetaToken(ws.ownerId);
    if (!token) {
      skipped++;
      continue;
    }

    const accountIds = ws.integrations
      .filter((wi) => wi.integration.platform === "meta")
      .map((wi) => wi.integration.adAccountId);
    if (accountIds.length === 0) {
      skipped++;
      continue;
    }

    try {
      const series = await getAccountsInsights(accountIds, token, 1);
      const totals = aggregateInsights(series);

      // Sem nada hoje? Pula — não enche caixa de "0 vendas".
      if (totals.spend === 0 && totals.purchases === 0 && totals.messages === 0 && totals.leads === 0) {
        skipped++;
        continue;
      }

      const parts: string[] = [];
      if (totals.purchases > 0) parts.push(`${totals.purchases} ${totals.purchases === 1 ? "venda" : "vendas"}`);
      if (totals.messages > 0) parts.push(`${totals.messages} ${totals.messages === 1 ? "conversa" : "conversas"} iniciadas`);
      if (totals.leads > 0) parts.push(`${totals.leads} ${totals.leads === 1 ? "lead" : "leads"}`);
      if (parts.length === 0 && totals.clicks > 0) {
        parts.push(`${totals.clicks} ${totals.clicks === 1 ? "clique" : "cliques"}`);
      }

      const body =
        parts.length > 0
          ? `Hoje: ${parts.join(", ")}. Investimento: R$ ${totals.spend.toFixed(2)}.`
          : `Investimento de hoje: R$ ${totals.spend.toFixed(2)}.`;

      await sendToWorkspaceClients(
        ws.id,
        {
          title: "Resumo do dia",
          body,
          url: "/",
        },
        {
          type: "daily_digest",
          dedupeKey: `daily_digest:${ws.id}:${today}`,
        },
      );
      sent++;
    } catch (err: unknown) {
      console.warn(
        `[cron/daily-digest] ws=${ws.id}:`,
        (err as Error)?.message ?? "failed",
      );
      skipped++;
    }
  }

  return NextResponse.json({ ok: true, sent, skipped });
}
