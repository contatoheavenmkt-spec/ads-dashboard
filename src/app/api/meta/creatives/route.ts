import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { getStoredMetaToken } from "@/lib/meta-token";
import { getAdCreatives } from "@/lib/meta-api";

async function resolveMetaToken(sessionUserId: string | undefined, workspaceId: string | null) {
  let userId = sessionUserId;
  if (!userId && workspaceId) {
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } });
    userId = ws?.ownerId ?? undefined;
  }
  if (!userId) return null;
  return getStoredMetaToken(userId);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") ?? "30");
  const adAccountIdParam = searchParams.get("adAccountId");
  const workspaceIdParam = searchParams.get("workspaceId");

  const session = await auth();
  const token = await resolveMetaToken(session?.user?.id, workspaceIdParam);
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
    if (accountIds.length === 0) return NextResponse.json({ ads: [] });
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
    if (accountIds.length === 0) return NextResponse.json({ ads: [] });
  } else {
    return NextResponse.json({ ads: [] });
  }

  const results = await Promise.allSettled(
    accountIds.map((id) => getAdCreatives(id, token, days))
  );

  const ads = results
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof getAdCreatives>>> => r.status === "fulfilled")
    .flatMap((r) => r.value)
    .sort((a, b) => b.impressions - a.impressions);

  return NextResponse.json({ ads });
}
