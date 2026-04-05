import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { getStoredMetaToken } from "@/lib/meta-token";
import { getGenderBreakdown, getAgeBreakdown } from "@/lib/meta-api";

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

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ gender: [], age: [] });

  const token = await getStoredMetaToken(session.user.id);
  if (!token) return NextResponse.json({ gender: [], age: [] });

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
  } else {
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
