// Meta Graph API client
// Todas as funções recebem o accessToken como parâmetro (vem do DB via OAuth)

const GRAPH_API = "https://graph.facebook.com/v21.0";

// Fuso usado para calcular o intervalo de datas. Meta interpreta a string
// de data no fuso da conta de anúncios; como nossas contas são BR, fixamos
// aqui. Gerar com `toISOString()` (UTC) puro causa off-by-one entre 21h-00h
// no horário local.
const ACCOUNT_TIMEZONE = "America/Sao_Paulo";

/**
 * Intervalo de datas (YYYY-MM-DD) no fuso da conta para uma janela de
 * `days` dias **incluindo hoje**. Para days=1 retorna o mesmo dia em
 * since/until (apenas hoje).
 */
export function getInsightsDateRange(days: number): { since: string; until: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: ACCOUNT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const until = fmt.format(new Date());
  // Parsar `until` (YYYY-MM-DD) e subtrair (days - 1) dias usando UTC midnight
  // para evitar surpresas com DST. O resultado é uma data calendário BR.
  const [y, m, d] = until.split("-").map(Number);
  const ref = new Date(Date.UTC(y, m - 1, d));
  ref.setUTCDate(ref.getUTCDate() - Math.max(0, days - 1));
  const since = ref.toISOString().split("T")[0];
  return { since, until };
}

// Anexado a toda chamada `/insights`. Sem isso, Meta usa o default da request
// (varia entre contas) e o número de conversões diverge do que o cliente vê
// no Ads Manager. Com `use_account_attribution_setting=true`, herda o que o
// usuário configurou na própria conta.
const ATTRIBUTION_PARAM = "use_account_attribution_setting=true";

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
  reach: number;
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

/**
 * Lê UMA action específica (não soma várias). Retorna o valor da primeira
 * action cujo type bate. Se a primária não existir, tenta os fallbacks na ordem.
 *
 * Por que não somar? Porque no Meta a action `purchase` JÁ É a agregação de
 * `offsite_conversion.fb_pixel_purchase` + `onsite_conversion.purchase` + outras
 * origens. Somar inflaria a métrica 2-3x e divergiria do que o Ads Manager mostra.
 */
function readAction(
  actions: Array<{ action_type: string; value: string }> | undefined,
  primary: string,
  fallbacks: string[] = [],
): number {
  if (!actions || actions.length === 0) return 0;
  const tryType = (type: string) => {
    const found = actions.find((a) => a.action_type === type);
    return found ? Number(found.value ?? 0) : null;
  };
  const main = tryType(primary);
  if (main !== null && !isNaN(main)) return main;
  for (const fb of fallbacks) {
    const v = tryType(fb);
    if (v !== null && !isNaN(v)) return v;
  }
  return 0;
}

// Aliases canônicos usados em todo o módulo. Trocar aqui se a Meta mudar o nome.
const ACTION_PURCHASE = "purchase";
const ACTION_PURCHASE_FALLBACKS = ["omni_purchase", "offsite_conversion.fb_pixel_purchase", "onsite_conversion.purchase"];

const ACTION_LEAD = "lead";
const ACTION_LEAD_FALLBACKS = ["omni_lead", "onsite_conversion.lead", "on-site_conversion.lead"];

// Para mensagens, usamos "conversa iniciada" como a métrica de conversão.
// As outras (welcome viewed, first reply) são eventos do funil, não conversões.
const ACTION_MESSAGE = "onsite_conversion.messaging_conversation_started_7d";
const ACTION_MESSAGE_FALLBACKS = ["messaging_conversation_started_7d", "on-site_conversion.messaging_conversation_started_7d"];

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
  const { since, until } = getInsightsDateRange(days);

  const fields = "spend,impressions,reach,clicks,actions,action_values";
  const url =
    `${GRAPH_API}/${adAccountId}/insights` +
    `?fields=${fields}` +
    `&time_increment=1` +
    `&time_range={"since":"${since}","until":"${until}"}` +
    `&${ATTRIBUTION_PARAM}` +
    `&limit=90` +
    `&access_token=${accessToken}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();

  if (data.error) throw new Error(`Meta Insights [${adAccountId}]: ${data.error.message}`);

  return ((data.data ?? []) as Array<{
    spend: string;
    impressions: string;
    reach: string;
    clicks: string;
    actions?: Array<{ action_type: string; value: string }>;
    action_values?: Array<{ action_type: string; value: string }>;
    date_start: string;
  }>).map((row) => {
    const purchases = readAction(row.actions, ACTION_PURCHASE, ACTION_PURCHASE_FALLBACKS);
    const leads = readAction(row.actions, ACTION_LEAD, ACTION_LEAD_FALLBACKS);
    const messages = readAction(row.actions, ACTION_MESSAGE, ACTION_MESSAGE_FALLBACKS);

    return {
      date: row.date_start,
      spend: Number(row.spend ?? 0),
      impressions: Number(row.impressions ?? 0),
      reach: Number(row.reach ?? 0),
      clicks: Number(row.clicks ?? 0),
      purchases,
      leads,
      messages,
      conversions: purchases + leads + messages,
      revenue: readAction(row.action_values, ACTION_PURCHASE, ACTION_PURCHASE_FALLBACKS),
    };
  });
}

export async function getCampaignInsights(
  campaignId: string,
  accessToken: string,
  days: number = 30
): Promise<MetaInsightDay[]> {
  const { since, until } = getInsightsDateRange(days);

  const fields = "spend,impressions,reach,clicks,actions,action_values";
  const url =
    `${GRAPH_API}/${campaignId}/insights` +
    `?fields=${fields}` +
    `&time_increment=1` +
    `&time_range={"since":"${since}","until":"${until}"}` +
    `&${ATTRIBUTION_PARAM}` +
    `&limit=90` +
    `&access_token=${accessToken}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();

  if (data.error) throw new Error(`Meta Campaign Insights [${campaignId}]: ${data.error.message}`);

  return ((data.data ?? []) as Array<{
    spend: string;
    impressions: string;
    reach: string;
    clicks: string;
    actions?: Array<{ action_type: string; value: string }>;
    action_values?: Array<{ action_type: string; value: string }>;
    date_start: string;
  }>).map((row) => {
    const purchases = readAction(row.actions, ACTION_PURCHASE, ACTION_PURCHASE_FALLBACKS);
    const leads = readAction(row.actions, ACTION_LEAD, ACTION_LEAD_FALLBACKS);
    const messages = readAction(row.actions, ACTION_MESSAGE, ACTION_MESSAGE_FALLBACKS);

    return {
      date: row.date_start,
      spend: Number(row.spend ?? 0),
      impressions: Number(row.impressions ?? 0),
      reach: Number(row.reach ?? 0),
      clicks: Number(row.clicks ?? 0),
      purchases,
      leads,
      messages,
      conversions: purchases + leads + messages,
      revenue: readAction(row.action_values, ACTION_PURCHASE, ACTION_PURCHASE_FALLBACKS),
    };
  });
}

// ─── Campanhas ────────────────────────────────────────────────────────────────

export async function getAccountCampaigns(
  adAccountId: string,
  accessToken: string,
  days: number = 30
): Promise<MetaCampaign[]> {
  const { since, until } = getInsightsDateRange(days);
  const insightFields = "spend,impressions,clicks,actions,action_values";
  // Sub-field parameters do Graph API seguem o padrão `field.param(value)`.
  // time_range respeita o filtro do usuário (antes era last_30d hardcoded);
  // use_account_attribution_setting herda a janela de atribuição que o cliente
  // tem configurada no Ads Manager (sem isso, o número de conversões diverge).
  const insightParams =
    `time_range({"since":"${since}","until":"${until}"})` +
    `.use_account_attribution_setting(true)`;
  const fields = `id,name,status,objective,insights.${insightParams}{${insightFields}}`;
  const url =
    `${GRAPH_API}/${adAccountId}/campaigns` +
    `?fields=${encodeURIComponent(fields)}&limit=50&access_token=${accessToken}`;

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
    const purchases = readAction(ins?.actions, ACTION_PURCHASE, ACTION_PURCHASE_FALLBACKS);
    const leads = readAction(ins?.actions, ACTION_LEAD, ACTION_LEAD_FALLBACKS);
    const messages = readAction(ins?.actions, ACTION_MESSAGE, ACTION_MESSAGE_FALLBACKS);

    // Se tiver mensagens, ou se o objetivo for MESSAGES/ENGAGEMENT
    const isMessaging = messages > 0 || c.objective === "MESSAGES" || c.objective === "OUTCOME_MESSAGING" || c.objective === "OUTCOME_ENGAGEMENT";
    const conversions = purchases + leads + messages;
    const revenue = readAction(ins?.action_values, ACTION_PURCHASE, ACTION_PURCHASE_FALLBACKS);

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
      existing.reach += d.reach;
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
  const { since, until } = getInsightsDateRange(days);
  const insightFields = "impressions,clicks,spend,actions";
  // date_preset só aceita valores enumerados (last_7d/last_30d/...), então
  // values arbitrários como 15 quebravam silenciosamente. time_range aceita
  // qualquer janela e ainda casa com o que o usuário escolhe na dash.
  const insightParams =
    `time_range({"since":"${since}","until":"${until}"})` +
    `.use_account_attribution_setting(true)`;
  const fields = `id,name,status,creative{thumbnail_url,image_url},insights.${insightParams}{${insightFields}}`;
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
    const purchases = readAction(ins?.actions, ACTION_PURCHASE, ACTION_PURCHASE_FALLBACKS);
    const leads = readAction(ins?.actions, ACTION_LEAD, ACTION_LEAD_FALLBACKS);
    const messages = readAction(ins?.actions, ACTION_MESSAGE, ACTION_MESSAGE_FALLBACKS);

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
  const { since, until } = getInsightsDateRange(days);
  const url =
    `${GRAPH_API}/${adAccountId}/insights` +
    `?fields=impressions,clicks&breakdowns=gender` +
    `&time_range={"since":"${since}","until":"${until}"}` +
    `&${ATTRIBUTION_PARAM}` +
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
  const { since, until } = getInsightsDateRange(days);
  const url =
    `${GRAPH_API}/${adAccountId}/insights` +
    `?fields=impressions,clicks&breakdowns=age` +
    `&time_range={"since":"${since}","until":"${until}"}` +
    `&${ATTRIBUTION_PARAM}` +
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

// ─── Saldo (pré-pago) ────────────────────────────────────────────────────────

export interface MetaAccountBalance {
  /** "act_XXX" */
  adAccountId: string;
  name: string;
  /** Conta é pré-pago? Determinado por `funding_source_details.type`. */
  isPrepaid: boolean;
  /** Saldo restante em reais (somente pré-pago). null pra contas pós-pago. */
  balance: number | null;
  /** Valor já gasto contra o saldo atual (pré-pago). */
  amountSpent: number | null;
  currency: string;
}

/**
 * Lê o saldo de uma conta Meta. Só faz sentido pra contas pré-pagas — em
 * contas pós-pagas (cartão/boleto faturado), o campo `balance` da API vem
 * 0 ou inválido porque Meta nunca calculou um "saldo restante".
 *
 * Como detectar pré-pago: `funding_source_details.type` retorna
 * "PREPAID_FUNDS" pra contas pré-pago. Outros valores (CREDIT_CARD,
 * INVOICE, etc.) são pós-pago — devolvemos null em balance pra sinalizar
 * que não dá pra alertar.
 */
export async function getAccountBalance(
  adAccountId: string,
  accessToken: string,
): Promise<MetaAccountBalance> {
  const fields = "name,balance,amount_spent,currency,funding_source_details";
  const url = `${GRAPH_API}/${adAccountId}?fields=${fields}&access_token=${accessToken}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  if (data.error) throw new Error(`Meta Balance [${adAccountId}]: ${data.error.message}`);

  // balance e amount_spent vêm como string em centavos (ex.: "12345" = R$ 123,45)
  const balanceCents = Number(data.balance ?? 0);
  const spentCents = Number(data.amount_spent ?? 0);
  const fundingType = data.funding_source_details?.type ?? "";
  const isPrepaid = fundingType === "PREPAID_FUNDS";

  return {
    adAccountId,
    name: String(data.name ?? ""),
    isPrepaid,
    balance: isPrepaid ? balanceCents / 100 : null,
    amountSpent: isPrepaid ? spentCents / 100 : null,
    currency: String(data.currency ?? "BRL"),
  };
}

/**
 * Agregadores de insights
 */
export function aggregateInsights(days: MetaInsightDay[]) {
  // Reach é número de pessoas únicas — somar entre dias conta a mesma pessoa
  // várias vezes e infla o total. Como não temos o "reach único do período"
  // sem fazer outra chamada, usamos MAX dos reach diários como aproximação
  // (mais conservadora que a soma).
  const maxReach = days.reduce((m, d) => Math.max(m, d.reach), 0);
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
    reach: maxReach,
    cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
    cpa: totals.conversions > 0 ? totals.spend / totals.conversions : 0,
    roas: totals.spend > 0 ? totals.revenue / totals.spend : 0,
    ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
  };
}
