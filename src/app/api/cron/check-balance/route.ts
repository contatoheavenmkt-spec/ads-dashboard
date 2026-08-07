import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStoredMetaToken } from "@/lib/meta-token";
import { getAccountBalance } from "@/lib/meta-api";
import { sendToWorkspace } from "@/lib/push";
import { authorizeCron, brToday } from "@/lib/cron-auth";
import { reconcileAllOwners } from "@/lib/integration-health";
import { expirarTrialsVencidos } from "@/lib/subscription-sweep";

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

  // Antes de olhar saldo, reconcilia quais contas o token ainda enxerga.
  // Contas que saíram do portfólio de BMs viram status "error" e caem fora
  // do findMany abaixo — o cron para de martelar a Meta com elas.
  let reconciliacao: Awaited<ReturnType<typeof reconcileAllOwners>> = [];
  try {
    reconciliacao = await reconcileAllOwners();
  } catch (err) {
    console.warn("[cron/check-balance] reconciliação falhou:", (err as Error)?.message ?? err);
  }

  // Higiene de dado: a expiração do Dashfy é preguiçosa (só acontece quando o
  // usuário faz uma requisição), então quem termina o trial e nunca volta fica
  // "trialing" para sempre. Isto NÃO muda acesso — `isPlanActive` já decide
  // pela data —, só faz a coluna `status` contar a verdade. Ver o cabeçalho de
  // lib/subscription-sweep.ts, inclusive para por que `active` fica de fora.
  //
  // Isolado em try/catch pelo mesmo motivo da reconciliação acima: é tarefa
  // acessória, não pode derrubar o aviso de saldo, que é o trabalho principal
  // desta rota.
  let trialsExpirados = 0;
  try {
    ({ trialsExpirados } = await expirarTrialsVencidos());
    if (trialsExpirados > 0) {
      console.log(`[cron/check-balance] ${trialsExpirados} trial(s) vencido(s) marcado(s) como expired`);
    }
  } catch (err) {
    console.warn("[cron/check-balance] varredura de assinaturas falhou:", (err as Error)?.message ?? err);
  }

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

    // Idem check-campaigns: o status precisa ser checado aqui também, não só
    // no where do findMany.
    const accountIds = ws.integrations
      .filter((wi) => wi.integration.platform === "meta" && wi.integration.status === "active")
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
    reconciliacao: {
      donos: reconciliacao.length,
      marcadasErro: reconciliacao.reduce((s, r) => s + r.marcadasErro, 0),
      reativadas: reconciliacao.reduce((s, r) => s + r.reativadas, 0),
      pulados: reconciliacao.filter((r) => r.pulado).map((r) => r.pulado),
    },
    assinaturas: { trialsExpirados },
  });
}
