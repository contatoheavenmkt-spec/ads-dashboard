import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { getStoredMetaToken } from "@/lib/meta-token";

const GRAPH_API = "https://graph.facebook.com/v21.0";

async function getRegionBreakdown(
  adAccountId: string,
  accessToken: string,
  days: number
): Promise<{ name: string; value: number }[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split("T")[0];
  const untilStr = new Date().toISOString().split("T")[0];

  async function fetchBreakdown(breakdown: string) {
    const url =
      `${GRAPH_API}/${adAccountId}/insights` +
      `?fields=reach,impressions&breakdowns=${breakdown}` +
      `&time_range={"since":"${sinceStr}","until":"${untilStr}"}` +
      `&limit=200` +
      `&access_token=${accessToken}`;
    const res = await fetch(url, { cache: "no-store" });
    return res.json();
  }

  let data = await fetchBreakdown("zip");
  if (data.error) {
    data = await fetchBreakdown("region");
  }
  if (data.error) throw new Error(`Meta Regions [${adAccountId}]: ${data.error.message}`);

  const rows = (data.data ?? []) as Array<{ zip: string; region: string; reach: string; impressions: string }>;
  console.log(`[regions] ${adAccountId} sample:`, JSON.stringify(rows.slice(0, 5)));
  return rows
    .map((row) => ({ name: row.region ?? row.zip, value: Number(row.reach ?? row.impressions ?? 0) }))
    .filter((r) => r.value > 0);
}

function mergeRegions(results: { name: string; value: number }[][]): { name: string; value: number }[] {
  const map = new Map<string, number>();
  for (const rows of results) {
    for (const row of rows) {
      map.set(row.name, (map.get(row.name) ?? 0) + row.value);
    }
  }
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

async function resolveMetaToken(sessionUserId: string | undefined, workspaceId: string | null) {
  if (workspaceId) {
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } });
    if (ws?.ownerId) return getStoredMetaToken(ws.ownerId);
  }
  if (!sessionUserId) return null;
  return getStoredMetaToken(sessionUserId);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") ?? "30");
  const adAccountIdParam = searchParams.get("adAccountId");
  const workspaceId = searchParams.get("workspaceId");

  const session = await auth();
  const token = await resolveMetaToken(session?.user?.id, workspaceId);
  if (!token) return NextResponse.json({ regions: [] });

  let accountIds: string[] = [];

  if (adAccountIdParam) {
    accountIds = [adAccountIdParam];
  } else if (workspaceId) {
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      include: { integrations: { include: { integration: true } } },
    });
    if (workspace) {
      accountIds = workspace.integrations
        .filter((wi) => wi.integration.platform === "meta")
        .map((wi) => wi.integration.adAccountId);
    }
  } else if (session?.user?.id) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { workspaceId: true },
    });
    const userWorkspaceId = user?.workspaceId ?? (session.user as { workspaceId?: string }).workspaceId;
    if (userWorkspaceId) {
      const wsIntegrations = await db.workspaceIntegration.findMany({
        where: { workspaceId: userWorkspaceId },
        include: { integration: { select: { adAccountId: true, platform: true } } },
      });
      accountIds = wsIntegrations
        .filter((wi) => wi.integration.platform === "meta")
        .map((wi) => wi.integration.adAccountId);
    }
  }

  if (accountIds.length === 0) return NextResponse.json({ regions: [] });

  const results = await Promise.all(
    accountIds.map((id) =>
      getRegionBreakdown(id, token, days).catch((err) => {
        console.error(`[regions] Fetch failed for ${id}:`, err?.message ?? err);
        return [] as { name: string; value: number }[];
      })
    )
  );

  return NextResponse.json({ regions: mergeRegions(results) });
}
