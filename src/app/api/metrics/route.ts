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

const EMPTY = {
  timeSeries: [],
  totals: { spend: 0, impressions: 0, reach: 0, clicks: 0, purchases: 0, leads: 0, messages: 0, conversions: 0, revenue: 0, cpc: 0, cpa: 0, roas: 0, ctr: 0 },
  campaigns: [],
  accountIds: [],
};

// Resolve qual userId usar para buscar tokens.
// Em acesso público (sem sessão), usa o ownerId do workspace.
async function resolveUserId(
  sessionUserId: string | undefined,
  workspaceId: string | null,
): Promise<string | null> {
  if (sessionUserId) return sessionUserId;
  if (!workspaceId) return null;

  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { ownerId: true },
  });
  return ws?.ownerId ?? null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  const bmId = searchParams.get("bmId");
  const adAccountId = searchParams.get("adAccountId");
  const campaignId = searchParams.get("campaignId");
  const days = parseInt(searchParams.get("days") ?? "30");
  const force = searchParams.get("force") === "1";

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
  const userId = await resolveUserId(session?.user?.id, workspaceId);

  if (!userId) return NextResponse.json(EMPTY);

  const token = await getStoredMetaToken(userId);
  if (!token) return NextResponse.json(EMPTY);

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
    if (!workspace) return NextResponse.json({ error: "Workspace não encontrado" }, { status: 404 });
    accountIds = workspace.integrations
      .filter((wi) => wi.integration.platform === "meta")
      .map((wi) => wi.integration.adAccountId);
  } else if (adAccountId) {
    accountIds = [adAccountId];
  } else if (bmId) {
    const integrations = await db.integration.findMany({
      where: { platform: "meta", status: "active", bmId },
      select: { adAccountId: true },
    });
    accountIds = integrations.map((i) => i.adAccountId);
  } else {
    // Sem filtro: busca contas que o token tem acesso
    const { getMetaAdAccounts } = await import('@/lib/meta-api');
    try {
      const accounts = await getMetaAdAccounts(token);
      accountIds = accounts.filter(a => a.account_status === 1).map(a => a.id);
    } catch (err: any) {
      console.error('[metrics] Erro ao buscar contas via API Meta:', err.message);
    }
  }

  if (accountIds.length === 0) return NextResponse.json(EMPTY);

  let timeSeries: any[] = [];
  let campaigns: any[] = [];

  try {
    timeSeries = await getAccountsInsights(accountIds, token, days);
    const campaignResults = await Promise.allSettled(
      accountIds.map((id) => getAccountCampaigns(id, token))
    );
    campaigns = campaignResults
      .filter((r): r is PromiseFulfilledResult<any[]> => r.status === "fulfilled")
      .flatMap((r) => r.value);

    const failedCount = campaignResults.filter(r => r.status === "rejected").length;
    if (failedCount > 0) {
      console.log(`[metrics] ${failedCount} contas Meta falharam, ${campaignResults.length - failedCount} funcionaram`);
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
