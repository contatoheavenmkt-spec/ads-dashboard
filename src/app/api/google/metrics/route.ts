import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { getCachedMetrics, setCachedMetrics } from "@/lib/metrics-cache";

const GADS_API = "https://googleads.googleapis.com/v22";
const REQUIRED_SCOPE = "https://www.googleapis.com/auth/adwords";

// ─── Token management ──────────────────────────────────────────────

async function getValidToken(userId: string): Promise<{ accessToken: string; scopes: string[] } | null> {
  const conn = await db.googleConnection.findFirst({ where: { userId }, orderBy: { connectedAt: "desc" } });
  if (!conn) return null;

  const connScopes = (conn.scopes ?? "").split(" ");
  if (!connScopes.includes(REQUIRED_SCOPE)) return null;

  let token = conn.accessToken;

  const expiresAt = conn.expiresAt instanceof Date ? conn.expiresAt : null;
  if (!expiresAt || isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: conn.refreshToken,
      }),
    });
    const data = await res.json();
    if (data.error) return null;

    await db.googleConnection.update({
      where: { id: conn.id },
      data: {
        accessToken: data.access_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
      },
    });
    token = data.access_token;
  }

  return { accessToken: token, scopes: connScopes };
}

// ─── GAQL helper ──────────────────────────────────────────────────

function gaqlHeaders(token: string, loginCustomerId: string) {
  return {
    Authorization: `Bearer ${token}`,
    "developer-token": process.env.GOOGLE_DEVELOPER_TOKEN!,
    "Content-Type": "application/json",
    "login-customer-id": loginCustomerId,
  };
}

async function gaqlSearch(customerId: string, token: string, loginCustomerId: string, query: string): Promise<any[]> {
  const body = JSON.stringify({ query });

  const attempt = async (lci: string) => {
    console.log(`[google/metrics] GAQL → customerId=${customerId} login-customer-id=${lci}`);
    const res = await fetch(`${GADS_API}/customers/${customerId}/googleAds:search`, {
      method: "POST",
      headers: {
        ...gaqlHeaders(token, lci),
        "Content-Length": String(Buffer.byteLength(body)),
      },
      body,
    });
    return res.json();
  };

  let data = await attempt(loginCustomerId);

  // Se deu permission error com o MCC, retenta usando o próprio customerId (conta direta)
  if (data.error) {
    const code = data.error.details?.[0]?.errors?.[0]?.errorCode?.authorizationError;
    const isPermissionError = code === "USER_PERMISSION_DENIED" || data.error.status === "PERMISSION_DENIED";
    if (isPermissionError && loginCustomerId !== customerId) {
      console.warn(`[google/metrics] login-customer-id=${loginCustomerId} negado, retentando com customerId=${customerId}`);
      data = await attempt(customerId);
    }
  }

  if (data.error) {
    console.error("[google/metrics] GAQL error:", JSON.stringify(data.error));
    throw new Error(data.error.message);
  }

  console.log(`[google/metrics] GAQL rows: ${data.results?.length ?? 0}`);
  return data.results?.map((r: any) => flattenFields(r)) ?? [];
}

function camelToSnake(s: string): string {
  return s.replace(/([A-Z])/g, (c) => `_${c.toLowerCase()}`);
}

function flattenFields(obj: any, prefix = ""): Record<string, any> {
  let result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = camelToSnake(key);
    const fullKey = prefix ? `${prefix}.${snakeKey}` : snakeKey;
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      result = { ...result, ...flattenFields(value as any, fullKey) };
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

// ─── Resolve customerId ───────────────────────────────────────────

async function resolveCustomerId(req: NextRequest): Promise<string | null> {
  const adAccountId = req.nextUrl.searchParams.get("adAccountId");
  if (adAccountId) return adAccountId;

  // workspaceId pode ser passado diretamente (ex: dash pública do cliente, sem sessão)
  const workspaceIdParam = req.nextUrl.searchParams.get("workspaceId");
  if (workspaceIdParam) {
    const wsIntegrations = await db.workspaceIntegration.findMany({
      where: { workspaceId: workspaceIdParam },
      include: { integration: true },
    });
    const googleIntegration = wsIntegrations.find((wi) => wi.integration.platform === "google" && wi.integration.status === "active");
    if (googleIntegration) return googleIntegration.integration.adAccountId;
    return null; // workspace existe mas não tem conta Google
  }

  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { workspaceId: true },
  });
  const workspaceId = user?.workspaceId ?? (session.user as { workspaceId?: string }).workspaceId ?? null;

  if (workspaceId) {
    const wsIntegrations = await db.workspaceIntegration.findMany({
      where: { workspaceId },
      include: { integration: true },
    });
    const googleIntegration = wsIntegrations.find((wi) => wi.integration.platform === "google" && wi.integration.status === "active");
    if (googleIntegration) return googleIntegration.integration.adAccountId;
  }

  return null;
}

// ─── Aggregation ──────────────────────────────────────────────────

interface DayMetrics {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

function aggregateTotals(days: DayMetrics[]) {
  const spend = days.reduce((s, d) => s + d.spend, 0);
  const impressions = days.reduce((s, d) => s + d.impressions, 0);
  const clicks = days.reduce((s, d) => s + d.clicks, 0);
  const conversions = days.reduce((s, d) => s + d.conversions, 0);
  const revenue = days.reduce((s, d) => s + d.revenue, 0);

  return {
    spend, impressions, clicks, conversions, revenue,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpa: conversions > 0 ? spend / conversions : 0,
    roas: spend > 0 ? revenue / spend : 0,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    searchImpressionShare: 0,
    qualityScoreAvg: 0,
  };
}

// ─── GET handler ──────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const workspaceIdParam = req.nextUrl.searchParams.get("workspaceId");
  const force = req.nextUrl.searchParams.get("force") === "1";

  const session = await auth();
  if (!workspaceIdParam && !session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const customerId = await resolveCustomerId(req);
  if (!customerId) {
    return NextResponse.json({
      timeSeries: [], totals: { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, cpc: 0, cpa: 0, roas: 0, ctr: 0, searchImpressionShare: 0, qualityScoreAvg: 0 },
      campaigns: [], keywords: [], demographics: { gender: [], age: [] }, regions: [],
    });
  }

  // Cache check
  const cacheWsId = workspaceIdParam ?? customerId ?? null;
  if (cacheWsId && !force) {
    const days0 = parseInt(req.nextUrl.searchParams.get("days") ?? "30");
    const camp0 = req.nextUrl.searchParams.get("campaignId");
    const cacheKey = `${days0}:${customerId}:${camp0 || "none"}`;
    const cached = await getCachedMetrics(cacheWsId, "google", cacheKey);
    if (cached) {
      console.log("[google/metrics] cache hit");
      return NextResponse.json({ ...cached, fromCache: true });
    }
  }

  const tokenInfo = await getValidToken(session?.user?.id ?? "");
  if (!tokenInfo) {
    return NextResponse.json({ error: "NO_TOKEN" }, { status: 401 });
  }

  // login-customer-id deve ser o MCC (manager) que tem acesso à conta.
  // Para contas diretas, usamos a própria conta. Para contas gerenciadas por MCC,
  // usamos o GOOGLE_ADS_LOGIN_CUSTOMER_ID do env.
  const envLoginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, "");
  const loginCustomerId = envLoginCustomerId || customerId.replace(/-/g, "");
  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "30");
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - days);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const dateFrom = fmt(startDate);
  const dateTo = fmt(today);
  const campaignId = req.nextUrl.searchParams.get("campaignId");

  // ── 1. Time Series ────────────────────────────────────────────

  const tsQuery = `
    SELECT metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, segments.date
    FROM campaign
    WHERE segments.date >= "${dateFrom}" AND segments.date <= "${dateTo}"
    ${campaignId ? `AND campaign.id = ${campaignId}` : ""}
    AND campaign.status != "REMOVED"
  `;

  let timeSeriesRows: Record<string, any>[] = [];
  try {
    timeSeriesRows = await gaqlSearch(customerId, tokenInfo.accessToken, loginCustomerId, tsQuery);
  } catch (err: any) {
    console.error("[google/metrics] timeSeries error:", err.message);
  }

  const dayMap = new Map<string, DayMetrics>();
  for (const row of timeSeriesRows) {
    const date = row["segments.date"];
    if (!date) continue;
    const cost = (Number(row["metrics.cost_micros"] ?? 0)) / 1_000_000;
    const impressions = Number(row["metrics.impressions"] ?? 0);
    const clicks = Number(row["metrics.clicks"] ?? 0);
    const conversions = Number(row["metrics.conversions"] ?? 0);
    const revenue = Number(row["metrics.conversions_value"] ?? 0);

    const existing = dayMap.get(date);
    if (existing) {
      existing.spend += cost;
      existing.impressions += impressions;
      existing.clicks += clicks;
      existing.conversions += conversions;
      existing.revenue += revenue;
    } else {
      dayMap.set(date, { date, spend: cost, impressions, clicks, conversions, revenue });
    }
  }
  const timeSeries = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  const totals = aggregateTotals(timeSeries);

  // ── 2. Campaigns ──────────────────────────────────────────────

  const campQuery = `
    SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
           metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions,
           metrics.conversions_value, metrics.search_impression_share
    FROM campaign
    WHERE segments.date >= "${dateFrom}" AND segments.date <= "${dateTo}"
    AND campaign.status != "REMOVED"
    ${campaignId ? `AND campaign.id = ${campaignId}` : ""}
  `;

  let campRows: Record<string, any>[] = [];
  try {
    campRows = await gaqlSearch(customerId, tokenInfo.accessToken, loginCustomerId, campQuery);
  } catch (err: any) {
    console.error("[google/metrics] campaigns error:", err.message);
  }

  const campaigns = campRows.map((r) => {
    const spend = Number(r["metrics.cost_micros"] ?? 0) / 1_000_000;
    const clicks = Number(r["metrics.clicks"] ?? 0);
    const conversions = Number(r["metrics.conversions"] ?? 0);
    const revenue = Number(r["metrics.conversions_value"] ?? 0);
    return {
      id: String(r["campaign.id"] ?? ""),
      name: String(r["campaign.name"] ?? ""),
      accountId: customerId,
      objective: String(r["campaign.advertising_channel_type"] ?? "SEARCH"),
      status: String(r["campaign.status"] ?? "UNKNOWN"),
      spend,
      impressions: Number(r["metrics.impressions"] ?? 0),
      clicks,
      conversions,
      cpc: clicks > 0 ? spend / clicks : 0,
      cpa: conversions > 0 ? spend / conversions : 0,
      roas: spend > 0 ? revenue / spend : 0,
      ctr: Number(r["metrics.impressions"] ?? 0) > 0 ? (clicks / Number(r["metrics.impressions"] ?? 1)) * 100 : 0,
    };
  });

  // ── 3. Keywords ───────────────────────────────────────────────

  const kwQuery = `
    SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
           metrics.clicks, metrics.conversions, metrics.impressions
    FROM keyword_view
    WHERE segments.date >= "${dateFrom}" AND segments.date <= "${dateTo}"
    AND metrics.impressions > 0
    ${campaignId ? `AND campaign.id = ${campaignId}` : ""}
    ORDER BY metrics.clicks DESC
    LIMIT 50
  `;

  let kwRows: Record<string, any>[] = [];
  try {
    kwRows = await gaqlSearch(customerId, tokenInfo.accessToken, loginCustomerId, kwQuery);
  } catch (err: any) {
    console.error("[google/metrics] keywords error:", err.message);
  }

  const kwMap = new Map<string, { kw: string; matchType: string; clicks: number; conversions: number; impressions: number }>();
  for (const r of kwRows) {
    const text = String(r["ad_group_criterion.keyword.text"] ?? "");
    const match = String(r["ad_group_criterion.keyword.match_type"] ?? "");
    const clicks = Number(r["metrics.clicks"] ?? 0);
    const conversions = Number(r["metrics.conversions"] ?? 0);
    const impressions = Number(r["metrics.impressions"] ?? 0);
    const key = `${text}|${match}`;
    const existing = kwMap.get(key);
    if (existing) {
      existing.clicks += clicks;
      existing.conversions += conversions;
      existing.impressions += impressions;
    } else {
      kwMap.set(key, { kw: text, matchType: match, clicks, conversions, impressions });
    }
  }
  const keywords = Array.from(kwMap.values())
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 30)
    .map((k) => ({
      kw: k.kw,
      matchType: k.matchType,
      ctr: k.impressions > 0 ? ((k.clicks / k.impressions) * 100).toFixed(2) + "%" : "0.00%",
      clicks: k.clicks,
      conversions: k.conversions,
    }));

  // ── 4. Demographics ───────────────────────────────────────────

  const genderLabels: Record<string, string> = { MALE: "Masculino", FEMALE: "Feminino", UNKNOWN: "Não informado" };
  const ageLabels: Record<string, string> = {
    "AGE_RANGE_18_24": "18-24", "AGE_RANGE_25_34": "25-34", "AGE_RANGE_35_44": "35-44",
    "AGE_RANGE_45_54": "45-54", "AGE_RANGE_55_64": "55-64", "AGE_RANGE_65_PLUS": "65+",
  };

  // Gender
  const gQuery = `SELECT ad_group_criterion.gender.type, metrics.impressions, metrics.clicks FROM gender_view
    WHERE segments.date >= "${dateFrom}" AND segments.date <= "${dateTo}"
    ${campaignId ? `AND campaign.id = ${campaignId}` : ""}`;

  let gRows: Record<string, any>[] = [];
  try {
    gRows = await gaqlSearch(customerId, tokenInfo.accessToken, loginCustomerId, gQuery);
  } catch { /* fallback */ }

  const finalGenderMap = new Map<string, { label: string; impressions: number; clicks: number }>();
  for (const r of gRows) {
    const raw = String(r["ad_group_criterion.gender.type"] ?? "UNKNOWN");
    const label = genderLabels[raw] ?? raw;
    const existing = finalGenderMap.get(label);
    if (existing) {
      existing.impressions += Number(r["metrics.impressions"] ?? 0);
      existing.clicks += Number(r["metrics.clicks"] ?? 0);
    } else {
      finalGenderMap.set(label, { label, impressions: Number(r["metrics.impressions"] ?? 0), clicks: Number(r["metrics.clicks"] ?? 0) });
    }
  }
  const finalGender = Array.from(finalGenderMap.values()).sort((a, b) => b.impressions - a.impressions);

  // Age
  const arQuery = `SELECT ad_group_criterion.age_range.type, metrics.impressions, metrics.clicks
    FROM age_range_view
    WHERE segments.date >= "${dateFrom}" AND segments.date <= "${dateTo}"
    AND ad_group_criterion.age_range.type NOT IN ("UNKNOWN", "UNSPECIFIED")
    ${campaignId ? `AND campaign.id = ${campaignId}` : ""}`;

  let arRows: Record<string, any>[] = [];
  try {
    arRows = await gaqlSearch(customerId, tokenInfo.accessToken, loginCustomerId, arQuery);
  } catch { /* fallback */ }

  const finalAgeMap = new Map<string, { label: string; impressions: number; clicks: number }>();
  for (const r of arRows) {
    const raw = String(r["ad_group_criterion.age_range.type"] ?? "UNKNOWN");
    const label = ageLabels[raw] ?? raw;
    const existing = finalAgeMap.get(label);
    if (existing) {
      existing.impressions += Number(r["metrics.impressions"] ?? 0);
      existing.clicks += Number(r["metrics.clicks"] ?? 0);
    } else {
      finalAgeMap.set(label, { label, impressions: Number(r["metrics.impressions"] ?? 0), clicks: Number(r["metrics.clicks"] ?? 0) });
    }
  }
  const finalAge = Array.from(finalAgeMap.values()).sort((a, b) => b.impressions - a.impressions);

  // ── 5. Search Impression Share & Quality Score ────────────────

  let sis = 0;
  let qs = 0;
  if (campRows.length > 0) {
    sis = campRows.reduce((s, r) => s + (Number(r["metrics.search_impression_share"] ?? 0) * 100), 0) / campRows.length;
  }
  totals.searchImpressionShare = Math.round(sis * 10) / 10;
  totals.qualityScoreAvg = Math.round(qs * 10) / 10;

  const result = {
    timeSeries, totals, campaigns, keywords,
    demographics: { gender: finalGender, age: finalAge },
  };

  if (cacheWsId) {
    const cacheKey = `${days}:${customerId}:${campaignId || "none"}`;
    await setCachedMetrics(cacheWsId, "google", cacheKey, result);
  }

  return NextResponse.json(result);
}
