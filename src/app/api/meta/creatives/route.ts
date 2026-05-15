import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStoredMetaToken } from "@/lib/meta-token";
import { getAdCreatives } from "@/lib/meta-api";
import { requireMetricsAccess } from "@/lib/workspace-access";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") ?? "30");
  const adAccountIdParam = searchParams.get("adAccountId");
  const workspaceIdParam = searchParams.get("workspaceId");

  const access = await requireMetricsAccess(req, workspaceIdParam);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status ?? 401 });
  }

  const userId = access.resolvedUserId;
  if (!userId) return NextResponse.json({ ads: [] });

  const token = await getStoredMetaToken(userId);
  if (!token) return NextResponse.json({ ads: [] });

  let accountIds: string[] = [];

  if (adAccountIdParam) {
    accountIds = [adAccountIdParam];
  } else if (workspaceIdParam) {
    const wsIntegrations = await db.workspaceIntegration.findMany({
      where: { workspaceId: workspaceIdParam },
      include: { integration: { select: { adAccountId: true, platform: true } } },
    });
    accountIds = wsIntegrations
      .filter((wi) => wi.integration.platform === "meta")
      .map((wi) => wi.integration.adAccountId);
  } else {
    // Sem workspaceId: pega integrações de workspaces do próprio dono.
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

  if (accountIds.length === 0) return NextResponse.json({ ads: [] });

  const results = await Promise.allSettled(
    accountIds.map((id) => getAdCreatives(id, token, days))
  );

  const ads = results
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof getAdCreatives>>> => r.status === "fulfilled")
    .flatMap((r) => r.value)
    .sort((a, b) => b.impressions - a.impressions);

  return NextResponse.json({ ads });
}
