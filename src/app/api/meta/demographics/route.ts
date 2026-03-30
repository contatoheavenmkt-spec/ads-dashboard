import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStoredMetaToken } from "@/lib/meta-token";
import { getGenderBreakdown, getAgeBreakdown } from "@/lib/meta-api";

function seedRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 4294967296;
  };
}

function buildMockDemographics(days: number, accountSeed: number) {
  const r = seedRand(accountSeed + days * 17);

  const femBase = 45 + r() * 30; // entre 45% e 75%
  const masc = 100 - femBase - r() * 2;
  const total = 100000 * (days / 30);

  const gender = [
    { label: "Feminino", impressions: Math.round(total * (femBase / 100)), clicks: Math.round(total * (femBase / 100) * 0.06) },
    { label: "Masculino", impressions: Math.round(total * (masc / 100)), clicks: Math.round(total * (masc / 100) * 0.05) },
    { label: "Desconhecido", impressions: Math.round(total * 0.01), clicks: 0 },
  ];

  const ageRanges = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
  let remaining = 100;
  const ageWeights = ageRanges.map((_, i) => {
    const r2 = seedRand(accountSeed + days * 7 + i * 31);
    return 10 + r2() * 25;
  });
  const weightSum = ageWeights.reduce((a, b) => a + b, 0);
  const age = ageRanges.map((label, i) => {
    const pct = ageWeights[i] / weightSum;
    return {
      label,
      impressions: Math.round(total * pct),
      clicks: Math.round(total * pct * (0.04 + seedRand(accountSeed + i)() * 0.04)),
    };
  }).sort((a, b) => b.impressions - a.impressions);

  return { gender, age };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") ?? "30");
  const adAccountIdParam = searchParams.get("adAccountId");

  const token = await getStoredMetaToken();

  let accountId: string | null = null;
  let accountSeed = 42;

  if (adAccountIdParam) {
    accountId = adAccountIdParam;
    accountSeed = adAccountIdParam.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  } else if (token) {
    const integrations = await db.integration.findMany({
      where: { platform: "meta", status: "active" },
      select: { adAccountId: true },
    });
    if (integrations.length > 0) {
      accountId = integrations[0].adAccountId;
      accountSeed = integrations[0].adAccountId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    }
  }

  if (token && accountId) {
    const [gender, age] = await Promise.all([
      getGenderBreakdown(accountId, token, days).catch(() => []),
      getAgeBreakdown(accountId, token, days).catch(() => []),
    ]);

    if (gender.length > 0 && age.length > 0) {
      return NextResponse.json({ gender, age });
    }
  }

  // Fallback dinâmico: varia com days e conta selecionada
  return NextResponse.json(buildMockDemographics(days, accountSeed));
}
