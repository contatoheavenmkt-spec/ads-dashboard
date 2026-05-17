import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStoredMetaToken } from "@/lib/meta-token";
import { getAccountBalance } from "@/lib/meta-api";
import { sendToWorkspace } from "@/lib/push";
import { authorizeCron, brToday } from "@/lib/cron-auth";

// Thresholds em reais — quando o saldo passa abaixo desses valores em ordem,
// dispara uma notificação por dia. Pós-pago é ignorado (Meta não expõe saldo).
const WARN_BELOW = 50;   // R$ 50 = "saldo acabando"
const CRITICAL_BELOW = 5; // R$ 5 = "praticamente acabou"

export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const today = brToday();
  let warnings = 0;
  let critical = 0;

  const workspaces = await db.workspace.findMany({
    where: {
      deletedAt: null,
      integrations: { some: { integration: { platform: "meta", status: "active" } } },
    },
    include: { integrations: { include: { integration: true } } },
    take: 200,
  });

  for (const ws of workspaces) {
    if (!ws.ownerId) continue;
    const token = await getStoredMetaToken(ws.ownerId);
    if (!token) continue;

    const accountIds = ws.integrations
      .filter((wi) => wi.integration.platform === "meta")
      .map((wi) => wi.integration.adAccountId);

    for (const accountId of accountIds) {
      try {
        const balance = await getAccountBalance(accountId, token);
        if (!balance.isPrepaid || balance.balance === null) continue;

        if (balance.balance <= CRITICAL_BELOW) {
          critical++;
          await sendToWorkspace(
            ws.id,
            {
              title: "⚠️ Saldo acabou",
              body: `${balance.name}: R$ ${balance.balance.toFixed(2)} restantes. Recarregue o quanto antes.`,
              url: "/",
            },
            {
              type: "balance_critical",
              dedupeKey: `balance_critical:${accountId}:${today}`,
            },
          );
        } else if (balance.balance <= WARN_BELOW) {
          warnings++;
          await sendToWorkspace(
            ws.id,
            {
              title: "Saldo acabando",
              body: `${balance.name}: restam apenas R$ ${balance.balance.toFixed(2)} de saldo.`,
              url: "/",
            },
            {
              type: "balance_low",
              dedupeKey: `balance_low:${accountId}:${today}`,
            },
          );
        }
      } catch (err: unknown) {
        console.warn(
          `[cron/check-balance] ${accountId}:`,
          (err as Error)?.message ?? "fetch failed",
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    workspacesChecked: workspaces.length,
    warnings,
    critical,
  });
}
