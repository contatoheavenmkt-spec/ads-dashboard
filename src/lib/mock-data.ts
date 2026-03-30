// Mock data simulando 10 Business Managers conectadas
// Será substituído por dados reais das APIs Meta Ads e Google Ads

export interface MockBM {
  id: string;
  name: string;
  platform: "meta" | "google";
  accounts: MockAdAccount[];
}

export interface MockAdAccount {
  id: string;
  name: string;
  bmId: string;
  bmName: string;
  platform: "meta" | "google";
  status: "active" | "error" | "disconnected";
}

export interface MockMetric {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

export interface MockCampaign {
  id: string;
  name: string;
  accountId: string;
  status: "ACTIVE" | "PAUSED" | "ARCHIVED";
  objective: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpc: number;
  cpa: number;
  roas: number;
  ctr: number;
}

export interface MockAdSet {
  id: string;
  name: string;
  campaignId: string;
  accountId: string;
  status: "ACTIVE" | "PAUSED";
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

// 10 Business Managers simuladas
export const MOCK_BMS: MockBM[] = [
  {
    id: "bm_001",
    name: "Agência Rocket Digital",
    platform: "meta",
    accounts: [
      { id: "act_1001", name: "E-commerce Moda Brasil", bmId: "bm_001", bmName: "Agência Rocket Digital", platform: "meta", status: "active" },
      { id: "act_1002", name: "Loja de Eletrônicos Premium", bmId: "bm_001", bmName: "Agência Rocket Digital", platform: "meta", status: "active" },
      { id: "act_1003", name: "Marketplace Calçados", bmId: "bm_001", bmName: "Agência Rocket Digital", platform: "meta", status: "active" },
    ],
  },
  {
    id: "bm_002",
    name: "Performance Hub Agency",
    platform: "meta",
    accounts: [
      { id: "act_2001", name: "SaaS Financeiro B2B", bmId: "bm_002", bmName: "Performance Hub Agency", platform: "meta", status: "active" },
      { id: "act_2002", name: "EdTech Cursos Online", bmId: "bm_002", bmName: "Performance Hub Agency", platform: "meta", status: "active" },
    ],
  },
  {
    id: "bm_003",
    name: "Growth Masters",
    platform: "meta",
    accounts: [
      { id: "act_3001", name: "Imobiliária Alto Padrão", bmId: "bm_003", bmName: "Growth Masters", platform: "meta", status: "active" },
      { id: "act_3002", name: "Construtora Horizonte", bmId: "bm_003", bmName: "Growth Masters", platform: "meta", status: "active" },
    ],
  },
  {
    id: "bm_004",
    name: "ConverteAI Marketing",
    platform: "meta",
    accounts: [
      { id: "act_4001", name: "Clínica Odontológica Sorrir", bmId: "bm_004", bmName: "ConverteAI Marketing", platform: "meta", status: "active" },
      { id: "act_4002", name: "Clínica Estética Bella", bmId: "bm_004", bmName: "ConverteAI Marketing", platform: "meta", status: "active" },
      { id: "act_4003", name: "Academia FitLife", bmId: "bm_004", bmName: "ConverteAI Marketing", platform: "meta", status: "active" },
    ],
  },
  {
    id: "bm_005",
    name: "Scale Digital Agency",
    platform: "meta",
    accounts: [
      { id: "act_5001", name: "Restaurante Sabor & Arte", bmId: "bm_005", bmName: "Scale Digital Agency", platform: "meta", status: "active" },
      { id: "act_5002", name: "Rede de Franquias Fast Food", bmId: "bm_005", bmName: "Scale Digital Agency", platform: "meta", status: "active" },
    ],
  },
  {
    id: "bm_006",
    name: "Mídia Paga Pro",
    platform: "meta",
    accounts: [
      { id: "act_6001", name: "Seguradora AutoProteg", bmId: "bm_006", bmName: "Mídia Paga Pro", platform: "meta", status: "active" },
      { id: "act_6002", name: "Plano de Saúde VidaMais", bmId: "bm_006", bmName: "Mídia Paga Pro", platform: "meta", status: "active" },
    ],
  },
  {
    id: "bm_007",
    name: "Tráfego Expert",
    platform: "meta",
    accounts: [
      { id: "act_7001", name: "Infoproduto Finanças Pessoais", bmId: "bm_007", bmName: "Tráfego Expert", platform: "meta", status: "active" },
      { id: "act_7002", name: "Mentoria Coach Business", bmId: "bm_007", bmName: "Tráfego Expert", platform: "meta", status: "active" },
      { id: "act_7003", name: "Curso de Marketing Digital", bmId: "bm_007", bmName: "Tráfego Expert", platform: "meta", status: "active" },
    ],
  },
  {
    id: "bm_008",
    name: "ADS Estratégico",
    platform: "meta",
    accounts: [
      { id: "act_8001", name: "Software RH Empresarial", bmId: "bm_008", bmName: "ADS Estratégico", platform: "meta", status: "active" },
      { id: "act_8002", name: "Plataforma ERP Cloud", bmId: "bm_008", bmName: "ADS Estratégico", platform: "meta", status: "active" },
    ],
  },
  {
    id: "bm_009",
    name: "Click & Convert",
    platform: "meta",
    accounts: [
      { id: "act_9001", name: "Pet Shop BichoPet", bmId: "bm_009", bmName: "Click & Convert", platform: "meta", status: "active" },
      { id: "act_9002", name: "Veterinária VidaAnimal", bmId: "bm_009", bmName: "Click & Convert", platform: "meta", status: "active" },
    ],
  },
  {
    id: "bm_010",
    name: "ROI Digital",
    platform: "meta",
    accounts: [
      { id: "act_a001", name: "Viagens & Turismo Brasil", bmId: "bm_010", bmName: "ROI Digital", platform: "meta", status: "active" },
      { id: "act_a002", name: "Hotel Boutique Luxo", bmId: "bm_010", bmName: "ROI Digital", platform: "meta", status: "active" },
    ],
  },
];

export const ALL_ACCOUNTS: MockAdAccount[] = MOCK_BMS.flatMap((bm) => bm.accounts);

// Gera métricas diárias para os últimos 30 dias
function generateDailyMetrics(
  baseSpend: number,
  baseConversions: number,
  days: number = 30
): MockMetric[] {
  const metrics: MockMetric[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];

    const variance = 0.7 + Math.random() * 0.6;
    const weekendFactor = [0, 6].includes(date.getDay()) ? 1.3 : 1;
    const spend = baseSpend * variance * weekendFactor;
    const impressions = spend * (80 + Math.random() * 40);
    const clicks = impressions * (0.015 + Math.random() * 0.02);
    const conversions = baseConversions * variance * weekendFactor;
    const revenue = conversions * (50 + Math.random() * 200);

    metrics.push({
      date: dateStr,
      spend: Math.round(spend * 100) / 100,
      impressions: Math.round(impressions),
      clicks: Math.round(clicks),
      conversions: Math.round(conversions),
      revenue: Math.round(revenue * 100) / 100,
    });
  }

  return metrics;
}

// Cache de métricas por conta
const metricsCache: Record<string, MockMetric[]> = {};

const accountBaseMetrics: Record<string, { spend: number; conversions: number }> = {
  act_1001: { spend: 850, conversions: 45 },
  act_1002: { spend: 1200, conversions: 30 },
  act_1003: { spend: 650, conversions: 60 },
  act_2001: { spend: 2500, conversions: 12 },
  act_2002: { spend: 900, conversions: 80 },
  act_3001: { spend: 1800, conversions: 8 },
  act_3002: { spend: 1400, conversions: 10 },
  act_4001: { spend: 600, conversions: 35 },
  act_4002: { spend: 750, conversions: 28 },
  act_4003: { spend: 450, conversions: 55 },
  act_5001: { spend: 400, conversions: 70 },
  act_5002: { spend: 1100, conversions: 90 },
  act_6001: { spend: 2200, conversions: 18 },
  act_6002: { spend: 1900, conversions: 22 },
  act_7001: { spend: 700, conversions: 95 },
  act_7002: { spend: 550, conversions: 40 },
  act_7003: { spend: 480, conversions: 110 },
  act_8001: { spend: 3000, conversions: 15 },
  act_8002: { spend: 2800, conversions: 12 },
  act_9001: { spend: 350, conversions: 65 },
  act_9002: { spend: 420, conversions: 48 },
  act_a001: { spend: 1600, conversions: 25 },
  act_a002: { spend: 1300, conversions: 20 },
};

export function getAccountMetrics(accountId: string, days: number = 30): MockMetric[] {
  const key = `${accountId}_${days}`;
  if (!metricsCache[key]) {
    const base = accountBaseMetrics[accountId] ?? { spend: 500, conversions: 20 };
    metricsCache[key] = generateDailyMetrics(base.spend, base.conversions, days);
  }
  return metricsCache[key];
}

export function getAccountsMetrics(accountIds: string[], days: number = 30): MockMetric[] {
  const allMetrics = accountIds.flatMap((id) => getAccountMetrics(id, days));

  // Agrupa por data
  const byDate: Record<string, MockMetric> = {};
  for (const m of allMetrics) {
    if (!byDate[m.date]) {
      byDate[m.date] = { date: m.date, spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
    }
    byDate[m.date].spend += m.spend;
    byDate[m.date].impressions += m.impressions;
    byDate[m.date].clicks += m.clicks;
    byDate[m.date].conversions += m.conversions;
    byDate[m.date].revenue += m.revenue;
  }

  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

export function aggregateMetrics(metrics: MockMetric[]) {
  const totals = metrics.reduce(
    (acc, m) => ({
      spend: acc.spend + m.spend,
      impressions: acc.impressions + m.impressions,
      clicks: acc.clicks + m.clicks,
      conversions: acc.conversions + m.conversions,
      revenue: acc.revenue + m.revenue,
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 }
  );

  return {
    ...totals,
    cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
    cpa: totals.conversions > 0 ? totals.spend / totals.conversions : 0,
    roas: totals.spend > 0 ? totals.revenue / totals.spend : 0,
    ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
  };
}

// Campanhas mock por conta
export function getCampaigns(accountIds: string[]): MockCampaign[] {
  const campaignNames = [
    "Remarketing - Visitantes 30 dias",
    "Lookalike - Compradores",
    "Topo de Funil - Interesse Amplo",
    "Conversão - Carrinho Abandonado",
    "Awareness - Vídeo",
    "Lead Gen - Formulário",
    "Catálogo - DPA",
    "Retenção - Clientes Ativos",
    "Black Friday - Oferta",
    "Temporada - Verão",
  ];

  const objectives = ["CONVERSIONS", "LEAD_GENERATION", "BRAND_AWARENESS", "TRAFFIC", "CATALOG_SALES"];
  const statuses: Array<"ACTIVE" | "PAUSED" | "ARCHIVED"> = ["ACTIVE", "ACTIVE", "ACTIVE", "PAUSED", "ACTIVE"];

  return accountIds.flatMap((accountId, ai) =>
    Array.from({ length: 3 + (ai % 3) }, (_, i) => {
      const base = accountBaseMetrics[accountId] ?? { spend: 500, conversions: 20 };
      const factor = 0.2 + Math.random() * 0.6;
      const spend = base.spend * factor * 30;
      const impressions = spend * (70 + Math.random() * 50);
      const clicks = impressions * (0.01 + Math.random() * 0.025);
      const conversions = base.conversions * factor * 30;
      const revenue = conversions * (80 + Math.random() * 150);

      return {
        id: `campaign_${accountId}_${i}`,
        name: campaignNames[(ai * 3 + i) % campaignNames.length],
        accountId,
        status: statuses[(ai + i) % statuses.length],
        objective: objectives[i % objectives.length],
        spend: Math.round(spend * 100) / 100,
        impressions: Math.round(impressions),
        clicks: Math.round(clicks),
        conversions: Math.round(conversions),
        cpc: clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0,
        cpa: conversions > 0 ? Math.round((spend / conversions) * 100) / 100 : 0,
        roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0,
        ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
      };
    })
  );
}
