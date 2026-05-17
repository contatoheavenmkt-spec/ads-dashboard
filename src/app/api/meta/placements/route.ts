import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStoredMetaToken } from "@/lib/meta-token";
import { getPlacementBreakdown, type PlacementBreakdown } from "@/lib/meta-api";
import { requireMetricsAccess, isAdAccountAuthorized } from "@/lib/workspace-access";
import { parseCustomRange } from "@/lib/date-range";

function mergePlacements(results: PlacementBreakdown[][]): PlacementBreakdown[] {
  const map = new Map<string, PlacementBreakdown>();
  for (const rows of results) {
    for (const row of rows) {
      const existing = map.get(row.label);
      if (existing) {
        existing.impressions += row.impressions;
        existing.clicks += row.clicks;
        existing.spend += row.spend;
      } else {
        map.set(row.label, { ...row });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.impressions - a.impressions);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") ?? "30");
  const adAccountIdParam = searchParams.get("adAccountId");
  const workspaceId = searchParams.get("workspaceId");

  const rangeResult = parseCustomRange(searchParams.get("since"), searchParams.get("until"));
  if (rangeResult.error) {
    return NextResponse.json({ error: rangeResult.error }, { status: 400 });
  }
  const customRange = rangeResult.range ?? undefined;

  const access = await requireMetricsAccess(req, workspaceId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status ?? 401 });
  }

  const userId = access.resolvedUserId;
  if (!userId) return NextResponse.json({ placements: [] });

  const token = await getStoredMetaToken(userId);
  if (!token) return NextResponse.json({ placements: [] });

  let accountIds: string[] = [];

  if (adAccountIdParam) {
    const ok = await isAdAccountAuthorized(adAccountIdParam, userId, workspaceId);
    if (!ok) {
      return NextResponse.json({ error: "Conta de anúncios não autorizada" }, { status: 403 });
    }
    accountIds = [adAccountIdParam];
  } else if (workspaceId) {
    const wsIntegrations = await db.workspaceIntegration.findMany({
      where: { workspaceId },
      include: { integration: { select: { adAccountId: true, platform: true } } },
    });
    accountIds = wsIntegrations
      .filter((wi) => wi.integration.platform === "meta")
      .map((wi) => wi.integration.adAccountId);
  } else {
    const userWs = await db.workspace.findMany({
      where: { ownerId: userId },
      include: { integrations: { include: { integration: true } } },
    });
    accountIds = userWs.flatMap((w) =>
      w.integrations
        .filter((wi) => wi.integration.platform === "meta")
        .map((wi) => wi.integration.adAccountId),
    );
  }

  if (accountIds.length === 0) return NextResponse.json({ placements: [] });

  const results = await Promise.all(
    accountIds.map((id) =>
      getPlacementBreakdown(id, token, days, customRange).catch((err) => {
        console.error(`[placements] ${id}:`, err?.message ?? err);
        return [] as PlacementBreakdown[];
      }),
    ),
  );

  return NextResponse.json({ placements: mergePlacements(results) });
}
