import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getStoredMetaToken } from "@/lib/meta-token";
import { getAccountsInsights, aggregateInsights } from "@/lib/meta-api";
import { rateLimit } from "@/lib/rate-limit-mem";

/**
 * Comparativo de todos os workspaces do AGENCY logado. Para cada workspace,
 * agrega os totals Meta no período `days` (default 30). Retorna lista
 * ordenada pra UI mostrar em tabela e identificar quem precisa de atenção.
 *
 * Limitações conscientes (esforço x valor):
 * - Só Meta nesta primeira versão (Google ficaria 2x mais lento e a maioria
 *   dos clientes da agência usa Meta como canal principal)
 * - Sem cache dedicado — a request demora proporcional a N workspaces.
 *   Aceitável até ~20 workspaces (uns 5-8s); acima disso vale paginação.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "AGENCY") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  // Rate limit: endpoint é caro (N fetches Meta por workspace). 5 req/min
  // por user é mais que suficiente — UI dispara só ao trocar filtro de período.
  const rl = rateLimit(`agency-comparativo:${session.user.id}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Muitas requisições. Tente novamente em ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const days = Math.max(1, Math.min(90, parseInt(req.nextUrl.searchParams.get("days") ?? "30")));

  const token = await getStoredMetaToken(session.user.id);
  if (!token) return NextResponse.json({ rows: [], days });

  // Workspaces do owner com integrações Meta vinculadas (exclui soft-deleted).
  const workspaces = await db.workspace.findMany({
    where: { ownerId: session.user.id, deletedAt: null },
    include: {
      integrations: { include: { integration: true } },
    },
    orderBy: { name: "asc" },
    take: 50, // hard cap por segurança
  });

  const rows = await Promise.all(
    workspaces.map(async (ws) => {
      const accountIds = ws.integrations
        .filter((wi) => wi.integration.platform === "meta")
        .map((wi) => wi.integration.adAccountId);

      if (accountIds.length === 0) {
        return {
          workspaceId: ws.id,
          workspaceName: ws.name,
          workspaceSlug: ws.slug,
          hasMeta: false,
          spend: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          purchases: 0,
          messages: 0,
          revenue: 0,
          cpa: 0,
          roas: 0,
        };
      }

      try {
        const series = await getAccountsInsights(accountIds, token, days);
        const t = aggregateInsights(series);
        return {
          workspaceId: ws.id,
          workspaceName: ws.name,
          workspaceSlug: ws.slug,
          hasMeta: true,
          spend: t.spend,
          impressions: t.impressions,
          clicks: t.clicks,
          conversions: t.conversions,
          purchases: t.purchases,
          messages: t.messages,
          revenue: t.revenue,
          cpa: t.cpa,
          roas: t.roas,
        };
      } catch (err: unknown) {
        console.warn(`[comparativo] ws=${ws.id}:`, (err as Error)?.message ?? "fetch failed");
        return {
          workspaceId: ws.id,
          workspaceName: ws.name,
          workspaceSlug: ws.slug,
          hasMeta: true,
          spend: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          purchases: 0,
          messages: 0,
          revenue: 0,
          cpa: 0,
          roas: 0,
          error: true,
        };
      }
    }),
  );

  return NextResponse.json({ rows, days });
}
