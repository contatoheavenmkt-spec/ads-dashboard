import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { getStoredMetaToken } from "@/lib/meta-token";
import {
  getAccountsInsights,
  aggregateInsights,
  getAccountCampaigns,
  getCampaignInsights,
} from "@/lib/meta-api";
import { getCachedMetrics, setCachedMetrics } from "@/lib/metrics-cache";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  const bmId = searchParams.get("bmId");
  const adAccountId = searchParams.get("adAccountId");
  const campaignId = searchParams.get("campaignId");
  const days = parseInt(searchParams.get("days") ?? "30");
  const force = searchParams.get("force") === "1";

  // Cache check — only when workspaceId is known
  const cacheWsId = workspaceId ?? adAccountId ?? null;
  if (cacheWsId && !force) {
    const cacheKey = `${days}:${adAccountId || "all"}:${campaignId || "none"}`;
    const cached = await getCachedMetrics(cacheWsId, "meta", cacheKey);
    if (cached) {
      console.log("[metrics/meta] cache hit");
      return NextResponse.json({ ...cached, fromCache: true });
    }
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({
      timeSeries: [],
      totals: { spend: 0, impressions: 0, reach: 0, clicks: 0, conversions: 0, revenue: 0, cpc: 0, cpa: 0, roas: 0, ctr: 0 },
      campaigns: [],
      accountIds: [],
    });
  }

  const token = await getStoredMetaToken(session.user.id);
  if (!token) {
    return NextResponse.json({
      timeSeries: [],
      totals: { spend: 0, impressions: 0, reach: 0, clicks: 0, conversions: 0, revenue: 0, cpc: 0, cpa: 0, roas: 0, ctr: 0 },
      campaigns: [],
      accountIds: [],
    });
  }

  if (campaignId) {
    const timeSeries = await getCampaignInsights(campaignId, token, days);
    const totals = aggregateInsights(timeSeries);
    return NextResponse.json({ timeSeries, totals, campaigns: [], accountIds: [] });
  }

  let accountIds: string[] = [];

  if (workspaceId) {
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      include: { integrations: { include: { integration: true } } },
    });
    if (!workspace) {
      return NextResponse.json({ error: "Workspace não encontrado" }, { status: 404 });
    }
    accountIds = workspace.integrations
      .filter((wi) => wi.integration.platform === "meta")
      .map((wi) => wi.integration.adAccountId);
    // If workspace has no Meta integrations, return empty — don't leak other clients' data
  } else if (adAccountId) {
    accountIds = [adAccountId];
  } else if (bmId) {
    const integrations = await db.integration.findMany({
      where: { platform: "meta", status: "active", bmId },
      select: { adAccountId: true },
    });
    accountIds = integrations.map((i) => i.adAccountId);
  } else {
    // Sem filtro explícito: busca contas que o token OAuth realmente tem acesso
    const { getMetaAdAccounts } = await import('@/lib/meta-api');
    try {
      const accounts = await getMetaAdAccounts(token);
      // Filtra apenas contas ativas que o token tem acesso
      accountIds = accounts
        .filter(a => a.account_status === 1)
        .map(a => a.id);
      console.log(`[metrics] Token OAuth tem acesso a ${accountIds.length} contas Meta`);
    } catch (err: any) {
      console.error('[metrics] Erro ao buscar contas via API Meta:', err.message);
      // Sem fallback para todas as contas — evita vazar dados de outros clientes
    }
  }

  if (accountIds.length === 0) {
    return NextResponse.json({
      timeSeries: [],
      totals: { spend: 0, impressions: 0, reach: 0, clicks: 0, conversions: 0, revenue: 0, cpc: 0, cpa: 0, roas: 0, ctr: 0 },
      campaigns: [],
      accountIds: [],
    });
  }

  let timeSeries: any[] = [];
  let campaigns: any[] = [];

  try {
    // Busca insights (tolerante a falhas parciais)
    timeSeries = await getAccountsInsights(accountIds, token, days);

    // Busca campanhas com Promise.allSettled para ignorar contas sem permissão
    const campaignResults = await Promise.allSettled(
      accountIds.map((id) => getAccountCampaigns(id, token))
    );
    campaigns = campaignResults
      .filter((r): r is PromiseFulfilledResult<any[]> => r.status === "fulfilled")
      .flatMap((r) => r.value);

    const failedCount = campaignResults.filter(r => r.status === "rejected").length;
    if (failedCount > 0) {
      console.log(`[metrics] ${failedCount} contas Meta falharam (sem permissão), ${campaignResults.length - failedCount} funcionaram`);
    }
  } catch (err: any) {
    console.error('[metrics] Erro ao buscar dados Meta:', err.message);
  }

  const totals = aggregateInsights(timeSeries);

  const result = { timeSeries, totals, campaigns, accountIds };

  if (cacheWsId) {
    const cacheKey = `${days}:${adAccountId || "all"}:${campaignId || "none"}`;
    await setCachedMetrics(cacheWsId, "meta", cacheKey, result);
  }

  return NextResponse.json(result);
}
