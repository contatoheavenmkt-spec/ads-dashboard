import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStoredMetaToken } from "@/lib/meta-token";
import { getAdCreatives } from "@/lib/meta-api";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") ?? "30");
  const adAccountIdParam = searchParams.get("adAccountId");

  const token = await getStoredMetaToken();
  if (!token) return NextResponse.json({ ads: [] });

  let accountIds: string[];

  if (adAccountIdParam) {
    accountIds = [adAccountIdParam];
  } else {
    const integrations = await db.integration.findMany({
      where: { platform: "meta", status: "active" },
      select: { adAccountId: true },
    });
    if (integrations.length === 0) return NextResponse.json({ ads: [] });
    accountIds = integrations.map(i => i.adAccountId);
  }

  const results = await Promise.allSettled(
    accountIds.map(id => getAdCreatives(id, token, days))
  );

  const ads = results
    .filter((r): r is PromiseFulfilledResult<any[]> => r.status === "fulfilled")
    .flatMap(r => r.value)
    .sort((a, b) => b.impressions - a.impressions);

  return NextResponse.json({ ads });
}
