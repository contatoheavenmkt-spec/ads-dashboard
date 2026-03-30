import { NextRequest, NextResponse } from "next/server";

// ─── Mock data generator ─────────────────────────────────────────────────────
// Seed determinístico por dia para que recargas mostrem os mesmos dados

function seedRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 4294967296;
  };
}

function buildTimeSeries(days: number) {
  const series = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const rand = seedRand(d.getDate() * 137 + d.getMonth() * 31 + days);
    const weekday = d.getDay();
    const weekMult = weekday === 0 || weekday === 6 ? 0.7 : 1;
    const base = 600 + rand() * 400;
    const spend = Math.round(base * weekMult * 10) / 10;
    const impressions = Math.round(spend * (38 + rand() * 10));
    const clicks = Math.round(impressions * (0.025 + rand() * 0.01));
    const conversions = Math.round(clicks * (0.08 + rand() * 0.04));
    const revenue = 0; // Removido conforme solicitação para focar em Conversas/Leads
    series.push({ date: dateStr, spend, impressions, clicks, conversions, revenue });
  }
  return series;
}

const ALL_CAMPAIGNS = [
  { id: "gc1", name: "Pesquisa | Sapatos Femininos", network: "SEARCH", objective: "CONVERSIONS" },
  { id: "gc2", name: "Pesquisa | Hotéis SP", network: "SEARCH", objective: "CONVERSIONS" },
  { id: "gc3", name: "Display | Remarketing Geral", network: "DISPLAY", objective: "AWARENESS" },
  { id: "gc4", name: "YouTube | Branding Q2", network: "VIDEO", objective: "AWARENESS" },
  { id: "gc5", name: "Pesquisa | Delivery Comida", network: "SEARCH", objective: "LEADS" },
  { id: "gc6", name: "Shopping | Calçados", network: "SHOPPING", objective: "CONVERSIONS" },
  { id: "gc7", name: "Display | Prospecção Fria", network: "DISPLAY", objective: "TRAFFIC" },
  { id: "gc8", name: "Pesquisa | Pousadas Litoral", network: "SEARCH", objective: "CONVERSIONS" },
];

function buildCampaigns(days: number) {
  return ALL_CAMPAIGNS.map((c, idx) => {
    const rand = seedRand(idx * 97 + days * 13);
    const spend = Math.round((300 + rand() * 800) * (days / 30) * 10) / 10;
    const impressions = Math.round(spend * (30 + rand() * 20));
    const clicks = Math.round(impressions * (0.02 + rand() * 0.015));
    const conversions = Math.round(clicks * (0.06 + rand() * 0.08));
    const revenue = 0;
    const status = idx < 5 ? "ACTIVE" : idx === 5 ? "ACTIVE" : "PAUSED";
    return {
      id: c.id,
      name: c.name,
      accountId: "gads-7712",
      objective: c.objective,
      status,
      network: c.network,
      spend,
      impressions,
      clicks,
      conversions,
      revenue,
      cpc: clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0,
      cpa: conversions > 0 ? Math.round((spend / conversions) * 100) / 100 : 0,
      roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0,
      ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
    };
  });
}

const ALL_KEYWORDS = [
  { kw: "comprar sapatos femininos", matchType: "Frase" },
  { kw: "melhores hotéis SP", matchType: "Exata" },
  { kw: "delivery comida rápida", matchType: "Ampla" },
  { kw: "sapatos social masculino", matchType: "Frase" },
  { kw: "hotel perto aeroporto", matchType: "Exata" },
  { kw: "pedir pizza online", matchType: "Ampla" },
  { kw: "pousada praia litoral", matchType: "Frase" },
  { kw: "tênis corrida promoção", matchType: "Frase" },
];

function buildKeywords(days: number) {
  return ALL_KEYWORDS.map((k, idx) => {
    const rand = seedRand(idx * 53 + days * 7);
    const impressions = Math.round((5000 + rand() * 20000) * (days / 30));
    const clicks = Math.round(impressions * (0.08 + rand() * 0.08));
    const conversions = Math.round(clicks * (0.05 + rand() * 0.1));
    const ctr = impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0;
    return { kw: k.kw, matchType: k.matchType, ctr: `${ctr}%`, clicks, conversions };
  }).sort((a, b) => b.clicks - a.clicks);
}

function buildDemographics(days: number) {
  const gender = [
    { label: "Masculino", impressions: 4500 * (days / 30), clicks: 320 * (days / 30) },
    { label: "Feminino", impressions: 5200 * (days / 30), clicks: 410 * (days / 30) },
    { label: "Desconhecido", impressions: 800 * (days / 30), clicks: 50 * (days / 30) },
  ];
  const age = [
    { label: "18-24", impressions: 1200 * (days / 30), clicks: 150 * (days / 30) },
    { label: "25-34", impressions: 2800 * (days / 30), clicks: 280 * (days / 30) },
    { label: "35-44", impressions: 2200 * (days / 30), clicks: 210 * (days / 30) },
    { label: "45-54", impressions: 1800 * (days / 30), clicks: 140 * (days / 30) },
    { label: "55-64", impressions: 1100 * (days / 30), clicks: 80 * (days / 30) },
    { label: "65+", impressions: 900 * (days / 30), clicks: 60 * (days / 30) },
  ];
  return { gender, age };
}

const REGION_LIST = [
  "São Paulo", "Rio de Janeiro", "Minas Gerais", "Paraná",
  "Rio Grande do Sul", "Bahia", "Santa Catarina", "Goiás", "Pernambuco",
];

function buildRegions(days: number) {
  return REGION_LIST.map((name, idx) => {
    const rand = seedRand(idx * 61 + days * 11);
    const base = idx === 0 ? 15000 : idx === 1 ? 10000 : 4000 - idx * 300;
    const value = Math.round((base + rand() * base * 0.3) * (days / 30));
    return { name, value };
  }).sort((a, b) => b.value - a.value);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") ?? "30");
  const campaignId = searchParams.get("campaignId");

  const campaigns = buildCampaigns(days);
  const keywords = buildKeywords(days);
  const demographics = buildDemographics(days);
  const regions = buildRegions(days);

  // Se tiver campaignId, filtramos TUDO para essa campanha
  if (campaignId) {
    const campaign = campaigns.find(c => c.id === campaignId);
    if (campaign) {
      // No mock, vamos apenas 'achatar' a série temporal para bater com os totais da campanha 
      // ou gerar uma série proporcional. Vamos gerar uma proporcional.
      const rawTimeSeries = buildTimeSeries(days);
      const totalSpend = rawTimeSeries.reduce((a, b) => a + b.spend, 0) || 1;
      const factor = campaign.spend / totalSpend;
      
      const timeSeries = rawTimeSeries.map(d => ({
        ...d,
        spend: Math.round(d.spend * factor * 10) / 10,
        conversions: Math.round(d.conversions * (campaign.conversions / (rawTimeSeries.reduce((a,b)=>a+b.conversions,0)||1))),
        clicks: Math.round(d.clicks * (campaign.clicks / (rawTimeSeries.reduce((a,b)=>a+b.clicks,0)||1))),
      }));

      return NextResponse.json({ 
        timeSeries, 
        totals: campaign, 
        campaigns: [campaign],
        keywords: keywords.slice(0, 3), // Simplificando Keywords no filtro
        demographics,
        regions
      });
    }
  }

  const timeSeries = buildTimeSeries(days);
  const totals = timeSeries.reduce(
    (acc, d) => ({
      spend: acc.spend + d.spend,
      impressions: acc.impressions + d.impressions,
      clicks: acc.clicks + d.clicks,
      conversions: acc.conversions + d.conversions,
      revenue: acc.revenue + d.revenue,
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 }
  );

  const enrichedTotals = {
    ...totals,
    spend: Math.round(totals.spend * 100) / 100,
    revenue: Math.round(totals.revenue * 100) / 100,
    cpc: totals.clicks > 0 ? Math.round((totals.spend / totals.clicks) * 100) / 100 : 0,
    cpa: totals.conversions > 0 ? Math.round((totals.spend / totals.conversions) * 100) / 100 : 0,
    roas: totals.spend > 0 ? Math.round((totals.revenue / totals.spend) * 100) / 100 : 0,
    ctr: totals.impressions > 0 ? Math.round((totals.clicks / totals.impressions) * 10000) / 100 : 0,
    searchImpressionShare: 84.5,
    qualityScoreAvg: 7.8,
  };

  return NextResponse.json({ timeSeries, totals: enrichedTotals, campaigns, keywords, demographics, regions });
}
