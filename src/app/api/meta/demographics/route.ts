import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStoredMetaToken } from "@/lib/meta-token";
import { getGenderBreakdown, getAgeBreakdown } from "@/lib/meta-api";
import { requireMetricsAccess, isAdAccountAuthorized } from "@/lib/workspace-access";

function mergeBreakdown(results: { label: string; impressions: number; clicks: number }[][]) {
  const map = new Map<string, { impressions: number; clicks: number }>();
  for (const rows of results) {
    for (const row of rows) {
      const existing = map.get(row.label);
      if (existing) {
        existing.impressions += row.impressions;
        existing.clicks += row.clicks;
      } else {
        map.set(row.label, { impressions: row.impressions, clicks: row.clicks });
      }
    }
  }
  return Array.from(map.entries())
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.impressions - a.impressions);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") ?? "30");
  const adAccountIdParam = searchParams.get("adAccountId");
  const workspaceId = searchParams.get("workspaceId");

  const access = await requireMetricsAccess(req, workspaceId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status ?? 401 });
  }

  const userId = access.resolvedUserId;
  if (!userId) return NextResponse.json({ gender: [], age: [] });

  const token = await getStoredMetaToken(userId);
  if (!token) return NextResponse.json({ gender: [], age: [] });

  let accountIds: string[] = [];

  if (adAccountIdParam) {
    // ⚠️ Valida que o adAccount pertence a algum workspace do owner.
    const ok = await isAdAccountAuthorized(adAccountIdParam, userId, workspaceId);
    if (!ok) {
      return NextResponse.json({ error: "Conta de anúncios não autorizada" }, { status: 403 });
    }
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

  if (accountIds.length === 0) return NextResponse.json({ gender: [], age: [] });

  const [genderResults, ageResults] = await Promise.all([
    Promise.all(accountIds.map((id) =>
      getGenderBreakdown(id, token, days).catch((err) => {
        console.error(`[demographics] Gender fetch failed for ${id}:`, err?.message ?? err);
        return [] as Awaited<ReturnType<typeof getGenderBreakdown>>;
      })
    )),
    Promise.all(accountIds.map((id) =>
      getAgeBreakdown(id, token, days).catch((err) => {
        console.error(`[demographics] Age fetch failed for ${id}:`, err?.message ?? err);
        return [] as Awaited<ReturnType<typeof getAgeBreakdown>>;
      })
    )),
  ]);

  return NextResponse.json({
    gender: mergeBreakdown(genderResults),
    age: mergeBreakdown(ageResults),
  });
}
