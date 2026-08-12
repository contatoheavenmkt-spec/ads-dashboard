// Meta Graph API client
// Todas as funções recebem o accessToken como parâmetro (vem do DB via OAuth)

const GRAPH_API = "https://graph.facebook.com/v21.0";

// Fuso usado para calcular o intervalo de datas. Meta interpreta a string
// de data no fuso da conta de anúncios; como nossas contas são BR, fixamos
// aqui. Gerar com `toISOString()` (UTC) puro causa off-by-one entre 21h-00h
// no horário local.
const ACCOUNT_TIMEZONE = "America/Sao_Paulo";

/**
 * Valida string `YYYY-MM-DD` simples — não aceita timezones ou horas. Usado
 * pra checar `since`/`until` recebidos via query antes de injetar na URL Meta.
 */
export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Intervalo de datas (YYYY-MM-DD) no fuso da conta para uma janela de
 * `days` dias **incluindo hoje** (offset=0). Com `offset > 0`, retorna a
 * janela `offset` dias antes — usado pra calcular comparação com período
 * anterior:
 *   offset=0     → [today - days + 1 ... today]      (período atual)
 *   offset=days  → [today - 2*days + 1 ... today - days]  (período anterior imediato)
 */
export function getInsightsDateRange(days: number, offset = 0): { since: string; until: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: ACCOUNT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayBR = fmt.format(new Date());
  const [y, m, d] = todayBR.split("-").map(Number);
  // UTC midnight evita surpresas com DST quando subtrai dias.
  const untilRef = new Date(Date.UTC(y, m - 1, d));
  untilRef.setUTCDate(untilRef.getUTCDate() - offset);
  const until = untilRef.toISOString().split("T")[0];

  const sinceRef = new Date(untilRef);
  sinceRef.setUTCDate(sinceRef.getUTCDate() - Math.max(0, days - 1));
  const since = sinceRef.toISOString().split("T")[0];

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

// ─── Erros da Graph API ───────────────────────────────────────────────────────

/**
 * Erro da Graph API preservando `code` e `error_subcode`. Antes todos os
 * pontos deste módulo faziam `throw new Error(data.error.message)`, jogando
 * fora o código — e sem o código não dá pra distinguir "conta saiu do BM"
 * (permanente, precisa avisar o dono) de "rate limit" (passa sozinho).
 */
export class MetaApiError extends Error {
  readonly code: number;
  readonly subcode: number | null;
  readonly fbtrace: string | null;

  constructor(
    raw: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string } | null | undefined,
    context?: string,
  ) {
    const msg = raw?.message ?? "erro desconhecido da Graph API";
    super(context ? `${context}: ${msg}` : msg);
    this.name = "MetaApiError";
    this.code = raw?.code ?? -1;
    this.subcode = raw?.error_subcode ?? null;
    this.fbtrace = raw?.fbtrace_id ?? null;
  }

  /** Não passa sozinho: conta fora do BM, sem permissão, objeto inexistente. */
  get isPermanent(): boolean {
    return [10, 100, 200, 272, 294].includes(this.code);
  }

  /** Token morto/revogado — afeta TODAS as integrações do dono, não uma conta. */
  get isTokenError(): boolean {
    return this.code === 190;
  }

  /** Throttling — temporário. Nunca marcar integração como morta por isso. */
  get isRateLimit(): boolean {
    return [4, 17, 32, 613, 80000, 80004].includes(this.code);
  }
}

// ─── Ad Accounts ──────────────────────────────────────────────────────────────

export async function getMetaAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  // `business{id,name}` identifica a BM dona da conta. Sem esse campo,
  // getMetaBMs caía sempre no fallback e TODA integração era gravada com
  // bmId = "todas-contas" (11 de 15 no banco em 27/07).
  const fields = "id,name,account_status,business{id,name}";
  const url = `${GRAPH_API}/me/adaccounts?fields=${fields}&limit=200&access_token=${accessToken}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();

  if (data.error) {
    throw new MetaApiError(data.error, "Meta AdAccounts");
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
  days: number = 30,
  offset: number = 0,
  customRange?: { since: string; until: string }
): Promise<MetaInsightDay[]> {
  const { since, until } = customRange ?? getInsightsDateRange(days, offset);

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
  days: number = 30,
  customRange?: { since: string; until: string }
): Promise<MetaCampaign[]> {
  const { since, until } = customRange ?? getInsightsDateRange(days);
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
  days: number = 30,
  offset: number = 0,
  customRange?: { since: string; until: string }
): Promise<MetaInsightDay[]> {
  const results = await Promise.allSettled(
    adAccountIds.map((id) => getAccountInsights(id, accessToken, days, offset, customRange))
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
  // ── Campos para a análise de criativos ──
  /** O texto principal do anúncio: é onde mora o "ângulo". */
  body: string | null;
  /** O título do criativo. */
  title: string | null;
  /** Link do post real no Instagram, quando existe. */
  permalink: string | null;
  /** Quantas vezes, em média, a mesma pessoa viu o anúncio no período. */
  frequency: number;
  ctr: number;
  cpm: number;
}

/** Lotes de ids para o endpoint batch do Graph (teto de 50 por chamada). */
function emLotes<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

/**
 * Executa em ondas de no máximo `limite` requisições simultâneas.
 *
 * Disparar todos os lotes de uma vez estoura o "Application request limit"
 * da Meta em janelas longas (medido: 3 anos = ~30 lotes simultâneos = erro),
 * e o erro derrubava a conta inteira. Em ondas passa.
 */
async function emOndas<T, R>(
  itens: T[],
  limite: number,
  tarefa: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const saida: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < itens.length; i += limite) {
    const onda = itens.slice(i, i + limite);
    saida.push(...(await Promise.allSettled(onda.map(tarefa))));
  }
  return saida;
}

/** Segue paging.next acumulando as linhas, com teto de páginas. */
async function lerPaginado(
  urlInicial: string,
  maxPaginas: number,
): Promise<{ linhas: Record<string, unknown>[]; truncado: boolean }> {
  const linhas: Record<string, unknown>[] = [];
  let url: string | undefined = urlInicial;
  let paginas = 0;
  while (url && paginas < maxPaginas) {
    const res: Response = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    linhas.push(...((data.data ?? []) as Record<string, unknown>[]));
    // O Graph devolve o next absoluto e já com o token embutido.
    url = data.paging?.next as string | undefined;
    paginas++;
  }
  return { linhas, truncado: Boolean(url) };
}

export async function getAdCreatives(
  adAccountId: string,
  accessToken: string,
  days: number = 30,
  customRange?: { since: string; until: string },
  campaignId?: string | null,
): Promise<MetaAdCreative[]> {
  const { since, until } = customRange ?? getInsightsDateRange(days);

  /*
   * A pergunta é "o que RODOU no período". Perguntar isso à lista de anúncios
   * da conta era a rota errada e custou dado de verdade: a BBG tem 1.937
   * anúncios, o /ads devolve 200 por página em ordem que NÃO é por entrega, e
   * o código lia só a primeira. Numa janela de 1 ano isso escondia 531
   * anúncios e R$ 23 mil de verba — metade do investimento invisível na tela.
   *
   * Agora a pergunta vai direto ao lugar que sabe responder: /insights com
   * level=ad só devolve quem teve entrega no período (25 linhas em 30 dias,
   * onde antes varríamos 1.937 registros). Como insights não filtra por
   * status, isso conserta de brinde o outro furo: anúncio que entregou e
   * depois foi reprovado (WITH_ISSUES/DISAPPROVED) ficava de fora do
   * whitelist de effective_status e sumia com a verba junto.
   *
   * Só depois buscamos criativo e status dos que realmente entregaram.
   */
  const camposInsights =
    "ad_id,ad_name,impressions,clicks,spend,actions,frequency,ctr,cpm";
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));
  const filtroCampanha = campaignId
    ? `&filtering=${encodeURIComponent(
        JSON.stringify([{ field: "campaign.id", operator: "IN", value: [campaignId] }]),
      )}`
    : "";
  const urlInsights =
    `${GRAPH_API}/${adAccountId}/insights` +
    `?level=ad&fields=${camposInsights}` +
    `&time_range=${timeRange}` +
    `&use_account_attribution_setting=true` +
    filtroCampanha +
    `&limit=500` +
    `&access_token=${accessToken}`;

  let entregaram: Record<string, unknown>[];
  try {
    // Teto de 20 páginas = 10 mil anúncios com entrega; acima disso a tela
    // não seria legível de qualquer jeito.
    ({ linhas: entregaram } = await lerPaginado(urlInsights, 20));
  } catch (e) {
    throw new Error(`Meta Ads [${adAccountId}]: ${(e as Error).message}`);
  }

  const porId = new Map<string, MetaAdCreative>();
  for (const linha of entregaram) {
    const row = linha as {
      ad_id?: string;
      ad_name?: string;
      impressions?: string;
      clicks?: string;
      spend?: string;
      frequency?: string;
      ctr?: string;
      cpm?: string;
      actions?: Array<{ action_type: string; value: string }>;
    };
    const id = row.ad_id;
    if (!id) continue;
    const impressions = Number(row.impressions ?? 0);
    if (impressions <= 0) continue;

    const purchases = readAction(row.actions, ACTION_PURCHASE, ACTION_PURCHASE_FALLBACKS);
    const leads = readAction(row.actions, ACTION_LEAD, ACTION_LEAD_FALLBACKS);
    const messages = readAction(row.actions, ACTION_MESSAGE, ACTION_MESSAGE_FALLBACKS);

    porId.set(id, {
      id,
      name: row.ad_name ?? "Anúncio",
      thumbnail: null,
      impressions,
      clicks: Number(row.clicks ?? 0),
      spend: Number(row.spend ?? 0),
      purchases,
      leads,
      messages,
      conversions: purchases + leads + messages,
      // Preenchido no passo 2; "DESCONHECIDO" é honesto quando o Graph não
      // devolve o anúncio (excluído, por exemplo) — melhor que fingir Pausado.
      status: "DESCONHECIDO",
      isMessaging: messages > 0,
      body: null,
      title: null,
      permalink: null,
      frequency: Number(row.frequency ?? 0),
      ctr: Number(row.ctr ?? 0),
      cpm: Number(row.cpm ?? 0),
    });
  }

  if (porId.size === 0) return [];

  /*
   * Passo 2: criativo e status SÓ de quem entregou, em lotes de 50 (teto do
   * batch do Graph). thumbnail 512 porque o padrão é 64x64 — a imagem
   * "embaçada" que o usuário via. allSettled por lote: um lote que falhe
   * degrada aquele pedaço (fica sem imagem) em vez de derrubar a conta toda.
   */
  const camposAd =
    `id,name,status,effective_status,` +
    `creative.thumbnail_width(512).thumbnail_height(512)` +
    `{thumbnail_url,image_url,title,body,instagram_permalink_url}`;

  const lotes = emLotes([...porId.keys()], 50);
  const respostas = await emOndas(lotes, 4, async (lote) => {
    const url =
      `${GRAPH_API}/?ids=${lote.join(",")}` +
      `&fields=${encodeURIComponent(camposAd)}` +
      `&access_token=${accessToken}`;
    const buscar = async () => {
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data;
    };
    let data;
    try {
      data = await buscar();
    } catch (e) {
      // Rate limit passa sozinho: uma pausa curta e mais uma tentativa
      // salvam o lote em vez de deixar o card sem imagem.
      if (!/request limit|rate limit|#17|#4/i.test(String(e))) throw e;
      await new Promise((r) => setTimeout(r, 3000));
      data = await buscar();
    }
    return data as Record<string, {
        name?: string;
        status?: string;
        effective_status?: string;
        creative?: {
          thumbnail_url?: string;
          image_url?: string;
          title?: string;
          body?: string;
          instagram_permalink_url?: string;
        };
      }>;
  });

  for (const r of respostas) {
    if (r.status !== "fulfilled") continue;
    for (const [id, det] of Object.entries(r.value)) {
      const alvo = porId.get(id);
      if (!alvo || !det) continue;
      alvo.name = det.name ?? alvo.name;
      alvo.status = det.effective_status ?? det.status ?? alvo.status;
      alvo.thumbnail = det.creative?.thumbnail_url ?? det.creative?.image_url ?? null;
      alvo.title = det.creative?.title ?? null;
      alvo.body = det.creative?.body ?? null;
      alvo.permalink = det.creative?.instagram_permalink_url ?? null;
    }
  }

  // Quem mais entregou primeiro.
  return [...porId.values()].sort((a, b) => b.impressions - a.impressions);
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
  days: number = 30,
  customRange?: { since: string; until: string }
): Promise<DemographicBreakdown[]> {
  const { since, until } = customRange ?? getInsightsDateRange(days);
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

export interface PlacementBreakdown {
  /** "facebook · feed", "instagram · stories", "instagram · reels", etc. */
  label: string;
  impressions: number;
  clicks: number;
  spend: number;
}

/**
 * Breakdown por placement do Meta — onde os anúncios apareceram (Feed,
 * Stories, Reels, Audience Network, etc) cruzando publisher_platform com
 * platform_position. Útil pra ver onde o investimento está performando
 * melhor por placement.
 */
export async function getPlacementBreakdown(
  adAccountId: string,
  accessToken: string,
  days: number = 30,
  customRange?: { since: string; until: string }
): Promise<PlacementBreakdown[]> {
  const { since, until } = customRange ?? getInsightsDateRange(days);
  // publisher_platform = facebook/instagram/messenger/audience_network
  // platform_position  = feed/stories/reels/marketplace/...
  const url =
    `${GRAPH_API}/${adAccountId}/insights` +
    `?fields=impressions,clicks,spend` +
    `&breakdowns=publisher_platform,platform_position` +
    `&time_range={"since":"${since}","until":"${until}"}` +
    `&${ATTRIBUTION_PARAM}` +
    `&limit=100` +
    `&access_token=${accessToken}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  if (data.error) throw new Error(`Meta Placement [${adAccountId}]: ${data.error.message}`);

  return ((data.data ?? []) as Array<{
    publisher_platform: string;
    platform_position: string;
    impressions: string;
    clicks: string;
    spend: string;
  }>).map((row) => ({
    label: `${prettyPlatform(row.publisher_platform)} · ${prettyPosition(row.platform_position)}`,
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    spend: Number(row.spend ?? 0),
  })).filter((r) => r.impressions > 0);
}

function prettyPlatform(p: string): string {
  const map: Record<string, string> = {
    facebook: "Facebook",
    instagram: "Instagram",
    messenger: "Messenger",
    audience_network: "Audience Network",
  };
  return map[p] ?? p;
}

function prettyPosition(p: string): string {
  const map: Record<string, string> = {
    feed: "Feed",
    facebook_stories: "Stories",
    instagram_stories: "Stories",
    instagram_reels: "Reels",
    instagram_explore: "Explore",
    instagram_shop: "Shop",
    marketplace: "Marketplace",
    video_feeds: "Vídeos",
    right_hand_column: "Coluna direita",
    instream_video: "Em vídeo",
    search: "Pesquisa",
    biz_disco_feed: "Discovery",
    reels: "Reels",
    stories: "Stories",
  };
  return map[p] ?? p.replace(/_/g, " ");
}

export async function getAgeBreakdown(
  adAccountId: string,
  accessToken: string,
  days: number = 30,
  customRange?: { since: string; until: string }
): Promise<DemographicBreakdown[]> {
  const { since, until } = customRange ?? getInsightsDateRange(days);
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
