import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStoredMetaToken } from "@/lib/meta-token";
import {
  getAccountsInsights,
  aggregateInsights,
  getAccountCampaigns,
  getCampaignInsights,
} from "@/lib/meta-api";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  const bmId = searchParams.get("bmId");
  const adAccountId = searchParams.get("adAccountId");
  const campaignId = searchParams.get("campaignId");
  const days = parseInt(searchParams.get("days") ?? "30");

  // Pega o token mais recente disponível
  const token = await getStoredMetaToken();
  if (!token) {
    return NextResponse.json({
      timeSeries: [],
      totals: { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, cpc: 0, cpa: 0, roas: 0, ctr: 0 },
      campaigns: [],
      accountIds: [],
    });
  }

  // Se tiver campaignId, pegamos dados só dela
  if (campaignId) {
    const timeSeries = await getCampaignInsights(campaignId, token, days);
    const totals = aggregateInsights(timeSeries);
    return NextResponse.json({ timeSeries, totals, campaigns: [], accountIds: [] });
  }

  let accountIds: string[];
  // ... resto da lógica de accountIds

  if (workspaceId) {
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      include: { integrations: { include: { integration: true } } },
    });
    if (!workspace) {
      return NextResponse.json({ error: "Workspace não encontrado" }, { status: 404 });
    }
    accountIds = workspace.integrations.map((wi) => wi.integration.adAccountId);
  } else if (adAccountId) {
    accountIds = [adAccountId];
  } else if (bmId) {
    const integrations = await db.integration.findMany({
      where: { platform: "meta", status: "active", bmId },
      select: { adAccountId: true },
    });
    accountIds = integrations.map((i) => i.adAccountId);
  } else {
    const integrations = await db.integration.findMany({
      where: { platform: "meta", status: "active" },
      select: { adAccountId: true },
    });
    accountIds = integrations.map((i) => i.adAccountId);
  }

  if (accountIds.length === 0) {
    return NextResponse.json({
      timeSeries: [],
      totals: { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, cpc: 0, cpa: 0, roas: 0, ctr: 0 },
      campaigns: [],
      accountIds: [],
    });
  }

  const [timeSeries, campaigns] = await Promise.all([
    getAccountsInsights(accountIds, token, days),
    Promise.all(accountIds.map((id) => getAccountCampaigns(id, token))).then((r) => r.flat()),
  ]);

  const totals = aggregateInsights(timeSeries);

  return NextResponse.json({ timeSeries, totals, campaigns, accountIds });
}
