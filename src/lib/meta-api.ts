// Meta Graph API client
// Todas as funções recebem o accessToken como parâmetro (vem do DB via OAuth)

const GRAPH_API = "https://graph.facebook.com/v21.0";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface MetaAdAccount {
  id: string; // formato "act_XXXXXXXXX"
  name: string;
  business?: { id: string; name: string };
  account_status: number; // 1=ativo, 2=desabilitado, 3=inadimplente, etc.
}

export interface MetaBM {
  id: string;
  name: string;
  platform: "meta";
  accounts: MetaAdAccount[];
}

export interface MetaInsightDay {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  leads: number;
  messages: number;
  conversions: number;
  revenue: number;
}

export interface MetaCampaign {
  id: string;
  name: string;
  accountId: string;
  status: "ACTIVE" | "PAUSED" | "ARCHIVED" | "DELETED";
  objective: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  leads: number;
  messages: number;
  conversions: number;
  revenue: number;
  cpc: number;
  cpa: number;
  roas: number;
  ctr: number;
  isMessaging: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseActions(
  actions: Array<{ action_type: string; value: string }> | undefined,
  types: string | string[]
): number {
  if (!actions) return 0;
  const filterTypes = Array.isArray(types) ? types : [types];
  return actions
    .filter((a) => filterTypes.includes(a.action_type))
    .reduce((acc, a) => acc + Number(a.value ?? 0), 0);
}

// ─── Ad Accounts ──────────────────────────────────────────────────────────────

export async function getMetaAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const fields = "id,name,account_status";
  const url = `${GRAPH_API}/me/adaccounts?fields=${fields}&limit=200&access_token=${accessToken}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  return (data.data ?? []) as MetaAdAccount[];
}

export async function getMetaBMs(accessToken: string): Promise<MetaBM[]> {
  const accounts = await getMetaAdAccounts(accessToken);

  const bmMap = new Map<string, MetaBM>();
  for (const account of accounts) {
    const bmId = account.business?.id ?? "todas-contas";
    const bmName = account.business?.name ?? "Minhas Contas de Anúncios";
    if (!bmMap.has(bmId)) {
      bmMap.set(bmId, { id: bmId, name: bmName, platform: "meta", accounts: [] });
    }
    bmMap.get(bmId)!.accounts.push(account);
  }

  return Array.from(bmMap.values());
}

// ─── Insights diários ─────────────────────────────────────────────────────────

export async function getAccountInsights(
  adAccountId: string,
  accessToken: string,
  days: number = 30
): Promise<MetaInsightDay[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split("T")[0];
  const untilStr = new Date().toISOString().split("T")[0];

  const fields = "spend,impressions,clicks,actions,action_values";
  const url =
    `${GRAPH_API}/${adAccountId}/insights` +
    `?fields=${fields}` +
    `&time_increment=1` +
    `&time_range={"since":"${sinceStr}","until":"${untilStr}"}` +
    `&limit=90` +
    `&access_token=${accessToken}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();

  if (data.error) throw new Error(`Meta Insights [${adAccountId}]: ${data.error.message}`);

  return ((data.data ?? []) as Array<{
    spend: string;
    impressions: string;
    clicks: string;
    actions?: Array<{ action_type: string; value: string }>;
    action_values?: Array<{ action_type: string; value: string }>;
    date_start: string;
  }>).map((row) => {
    const purchases = parseActions(row.actions, ["purchase", "offsite_conversion.fb_pixel_purchase", "onsite_conversion.purchase"]);
    const leads = parseActions(row.actions, ["lead", "on-site_conversion.lead", "onsite_conversion.lead"]);
    const messages = parseActions(row.actions, [
      "messaging_conversation_started_7d",
      "onsite_conversion.messaging_conversation_started_7d",
      "on-site_conversion.messaging_conversation_started_7d",
      "onsite_conversion.messaging_welcome_message_viewed_7d",
      "messaging_first_reply_7d"
    ]);

    return {
      date: row.date_start,
      spend: Number(row.spend ?? 0),
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
      purchases,
      leads,
      messages,
      conversions: purchases + leads + messages,
      revenue: parseActions(row.action_values, ["purchase", "offsite_conversion.fb_pixel_purchase", "onsite_conversion.purchase"]),
    };
  });
}

export async function getCampaignInsights(
  campaignId: string,
  accessToken: string,
  days: number = 30
): Promise<MetaInsightDay[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split("T")[0];
  const untilStr = new Date().toISOString().split("T")[0];

  const fields = "spend,impressions,clicks,actions,action_values";
  const url =
    `${GRAPH_API}/${campaignId}/insights` +
    `?fields=${fields}` +
    `&time_increment=1` +
    `&time_range={"since":"${sinceStr}","until":"${untilStr}"}` +
    `&limit=90` +
    `&access_token=${accessToken}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();

  if (data.error) throw new Error(`Meta Campaign Insights [${campaignId}]: ${data.error.message}`);

  return ((data.data ?? []) as Array<{
    spend: string;
    impressions: string;
    clicks: string;
    actions?: Array<{ action_type: string; value: string }>;
    action_values?: Array<{ action_type: string; value: string }>;
    date_start: string;
  }>).map((row) => {
    const purchases = parseActions(row.actions, ["purchase", "offsite_conversion.fb_pixel_purchase", "onsite_conversion.purchase"]);
    const leads = parseActions(row.actions, ["lead", "on-site_conversion.lead", "onsite_conversion.lead"]);
    const messages = parseActions(row.actions, [
      "messaging_conversation_started_7d",
      "onsite_conversion.messaging_conversation_started_7d",
      "on-site_conversion.messaging_conversation_started_7d",
      "onsite_conversion.messaging_welcome_message_viewed_7d",
      "messaging_first_reply_7d"
    ]);

    return {
      date: row.date_start,
      spend: Number(row.spend ?? 0),
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
      purchases,
      leads,
      messages,
      conversions: purchases + leads + messages,
      revenue: parseActions(row.action_values, ["purchase", "offsite_conversion.fb_pixel_purchase", "onsite_conversion.purchase", "purchase_value"]),
    };
  });
}

// ─── Campanhas ────────────────────────────────────────────────────────────────

export async function getAccountCampaigns(
  adAccountId: string,
  accessToken: string
): Promise<MetaCampaign[]> {
  const insightFields = "spend,impressions,clicks,actions,action_values";
  const fields = `id,name,status,objective,insights.date_preset(last_30d){${insightFields}}`;
  const url =
    `${GRAPH_API}/${adAccountId}/campaigns` +
    `?fields=${fields}&limit=50&access_token=${accessToken}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();

  if (data.error) throw new Error(`Meta Campaigns [${adAccountId}]: ${data.error.message}`);

  return ((data.data ?? []) as Array<{
    id: string;
    name: string;
    status: string;
    objective: string;
    insights?: { data: Array<{ spend: string; impressions: string; clicks: string; actions?: Array<{ action_type: string; value: string }>; action_values?: Array<{ action_type: string; value: string }> }> };
  }>).map((c) => {
    const ins = c.insights?.data?.[0];
    const spend = Number(ins?.spend ?? 0);
    const impressions = Number(ins?.impressions ?? 0);
    const clicks = Number(ins?.clicks ?? 0);
    const purchases = parseActions(ins?.actions, ["purchase", "offsite_conversion.fb_pixel_purchase", "onsite_conversion.purchase"]);
    const leads = parseActions(ins?.actions, ["lead", "on-site_conversion.lead", "onsite_conversion.lead"]);
    const messages = parseActions(ins?.actions, [
      "messaging_conversation_started_7d",
      "onsite_conversion.messaging_conversation_started_7d",
      "on-site_conversion.messaging_conversation_started_7d",
      "onsite_conversion.messaging_welcome_message_viewed_7d",
      "messaging_first_reply_7d"
    ]);
    
    // Se tiver mensagens, ou se o objetivo for MESSAGES/ENGAGEMENT
    const isMessaging = messages > 0 || c.objective === "MESSAGES" || c.objective === "OUTCOME_MESSAGING" || c.objective === "OUTCOME_ENGAGEMENT";
    const conversions = purchases + leads + messages;
    const revenue = parseActions(ins?.action_values, ["purchase", "offsite_conversion.fb_pixel_purchase", "onsite_conversion.purchase"]);

    return {
      id: c.id,
      name: c.name,
      accountId: adAccountId,
      status: c.status as MetaCampaign["status"],
      objective: c.objective ?? "",
      spend, impressions, clicks, purchases, leads, messages, conversions, revenue,
      cpc: clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0,
      cpa: conversions > 0 ? Math.round((spend / conversions) * 100) / 100 : 0,
      roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0,
      ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
      isMessaging,
    };
  });
}

// ─── Agrega insights de múltiplas contas ─────────────────────────────────────

export async function getAccountsInsights(
  adAccountIds: string[],
  accessToken: string,
  days: number = 30
): Promise<MetaInsightDay[]> {
  const results = await Promise.allSettled(
    adAccountIds.map((id) => getAccountInsights(id, accessToken, days))
  );

  const allDays: MetaInsightDay[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") allDays.push(...r.value);
  }

  const byDate = new Map<string, MetaInsightDay>();
  for (const d of allDays) {
    const existing = byDate.get(d.date);
    if (existing) {
      existing.spend += d.spend;
      existing.impressions += d.impressions;
      existing.clicks += d.clicks;
      existing.purchases += d.purchases;
      existing.leads += d.leads;
      existing.messages += d.messages;
      existing.conversions += d.conversions;
      existing.revenue += d.revenue;
    } else {
      byDate.set(d.date, { ...d });
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Criativos (Anúncios com thumbnail) ──────────────────────────────────────

export interface MetaAdCreative {
  id: string;
  name: string;
  thumbnail: string | null;
  impressions: number;
  clicks: number;
  purchases: number;
  leads: number;
  messages: number;
  conversions: number;
  spend: number;
  status: string;
  isMessaging: boolean;
}

export async function getAdCreatives(
  adAccountId: string,
  accessToken: string,
  days: number = 30
): Promise<MetaAdCreative[]> {
  const insightFields = "impressions,clicks,spend,actions";
  const fields = `id,name,status,creative{thumbnail_url,image_url},insights.date_preset(last_${days}d){${insightFields}}`;
  const url =
    `${GRAPH_API}/${adAccountId}/ads` +
    `?fields=${encodeURIComponent(fields)}&limit=30&access_token=${accessToken}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  if (data.error) throw new Error(`Meta Ads [${adAccountId}]: ${data.error.message}`);

  return ((data.data ?? []) as Array<{
    id: string;
    name: string;
    status: string;
    creative?: { thumbnail_url?: string; image_url?: string };
    insights?: { data: Array<{ impressions: string; clicks: string; spend: string; actions?: Array<{ action_type: string; value: string }> }> };
  }>).map((ad) => {
    const ins = ad.insights?.data?.[0];
    const purchases = parseActions(ins?.actions, ["purchase", "offsite_conversion.fb_pixel_purchase", "onsite_conversion.purchase"]);
    const leads = parseActions(ins?.actions, ["lead", "on-site_conversion.lead", "onsite_conversion.lead"]);
    const messages = parseActions(ins?.actions, [
      "messaging_conversation_started_7d",
      "onsite_conversion.messaging_conversation_started_7d",
      "on-site_conversion.messaging_conversation_started_7d",
      "onsite_conversion.messaging_welcome_message_viewed_7d",
      "messaging_first_reply_7d"
    ]);

    const isMessaging = messages > 0;
    const conversions = purchases + leads + messages;

    return {
      id: ad.id,
      name: ad.name,
      thumbnail: ad.creative?.thumbnail_url ?? ad.creative?.image_url ?? null,
      impressions: Number(ins?.impressions ?? 0),
      clicks: Number(ins?.clicks ?? 0),
      spend: Number(ins?.spend ?? 0),
      purchases,
      leads,
      messages,
      conversions,
      status: ad.status,
      isMessaging,
    };
  });
}

// ─── Demographics ─────────────────────────────────────────────────────────────

export interface DemographicBreakdown {
  label: string;
  impressions: number;
  clicks: number;
}

export async function getGenderBreakdown(
  adAccountId: string,
  accessToken: string,
  days: number = 30
): Promise<DemographicBreakdown[]> {
  const since = new Date(); since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split("T")[0];
  const untilStr = new Date().toISOString().split("T")[0];
  const url =
    `${GRAPH_API}/${adAccountId}/insights` +
    `?fields=impressions,clicks&breakdowns=gender` +
    `&time_range={"since":"${sinceStr}","until":"${untilStr}"}` +
    `&access_token=${accessToken}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  if (data.error) throw new Error(`Meta Gender [${adAccountId}]: ${data.error.message}`);

  return ((data.data ?? []) as Array<{ gender: string; impressions: string; clicks: string }>).map(row => ({
    label: row.gender === "female" ? "Feminino" : row.gender === "male" ? "Masculino" : "Desconhecido",
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
  }));
}

export async function getAgeBreakdown(
  adAccountId: string,
  accessToken: string,
  days: number = 30
): Promise<DemographicBreakdown[]> {
  const since = new Date(); since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split("T")[0];
  const untilStr = new Date().toISOString().split("T")[0];
  const url =
    `${GRAPH_API}/${adAccountId}/insights` +
    `?fields=impressions,clicks&breakdowns=age` +
    `&time_range={"since":"${sinceStr}","until":"${untilStr}"}` +
    `&access_token=${accessToken}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  if (data.error) throw new Error(`Meta Age [${adAccountId}]: ${data.error.message}`);

  return ((data.data ?? []) as Array<{ age: string; impressions: string; clicks: string }>)
    .map(row => ({
      label: row.age,
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
    }))
    .sort((a, b) => b.impressions - a.impressions);
}

/**
 * Agregadores de insights
 */
export function aggregateInsights(days: MetaInsightDay[]) {
  const totals = days.reduce(
    (acc, d) => ({
      spend: acc.spend + d.spend,
      impressions: acc.impressions + d.impressions,
      clicks: acc.clicks + d.clicks,
      purchases: acc.purchases + d.purchases,
      leads: acc.leads + d.leads,
      messages: acc.messages + d.messages,
      conversions: acc.conversions + d.conversions,
      revenue: acc.revenue + d.revenue,
    }),
    { spend: 0, impressions: 0, clicks: 0, purchases: 0, leads: 0, messages: 0, conversions: 0, revenue: 0 }
  );

  return {
    ...totals,
    cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
    cpa: totals.conversions > 0 ? totals.spend / totals.conversions : 0,
    roas: totals.spend > 0 ? totals.revenue / totals.spend : 0,
    ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
  };
}
