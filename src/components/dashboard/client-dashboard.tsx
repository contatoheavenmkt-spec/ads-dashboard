"use client";

import { useEffect, useState } from "react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PerformanceChart } from "@/components/charts/performance-chart";
import { FunnelChart } from "@/components/charts/funnel-chart";
import { TopCampaignsDonut } from "@/components/charts/top-campaigns-donut";
import { CampaignsTable } from "@/components/dashboard/campaigns-table";
import { GaugeChart } from "@/components/dashboard/gauge-chart";
import { KeywordsTable } from "@/components/dashboard/keywords-table";
import { RegionList, RegionMap } from "@/components/dashboard/region-heatmap";
import { ClientSidebar, ClientView } from "@/components/layout/client-sidebar";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  Loader2, LayoutDashboard, Calendar, ChevronDown, Check,
  Download, Users, PieChart as PieChartIcon,
  Search, Target, Layers, MousePointer2, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "next-auth/react";
import { Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Filler,
} from "chart.js";
import Link from "next/link";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Title, Filler);

// ─── Constants ────────────────────────────────────────────────────────────────

const GENDER_COLORS = ["#3b82f6", "#93c5fd", "#1e40af"];
const AGE_COLORS = ["#1e3a8a", "#1e40af", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe"];

const PERIOD_OPTIONS = [
  { label: "Hoje", days: 1 },
  { label: "Últimos 7 dias", days: 7 },
  { label: "Últimos 15 dias", days: 15 },
  { label: "Últimos 30 dias", days: 30 },
  { label: "Últimos 90 dias", days: 90 },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetaTimeSeries {
  date: string; spend: number; impressions: number; reach: number;
  clicks: number; purchases: number; leads: number; messages: number;
  conversions: number; revenue: number;
}
interface MetaTotals {
  spend: number; impressions: number; reach: number; clicks: number;
  purchases: number; leads: number; messages: number; conversions: number;
  revenue: number; cpc: number; cpa: number; roas: number; ctr: number;
}
interface MetaCampaign {
  id: string; name: string; accountId: string; objective: string; status: string;
  spend: number; impressions: number; clicks: number; purchases: number;
  leads: number; messages: number; conversions: number;
  cpc: number; cpa: number; roas: number; ctr: number;
}
interface MetaData {
  timeSeries: MetaTimeSeries[];
  totals: MetaTotals;
  campaigns: MetaCampaign[];
}

interface GoogleTimeSeries {
  date: string; spend: number; impressions: number; clicks: number; conversions: number; revenue: number;
}
interface GoogleTotals {
  spend: number; impressions: number; clicks: number; conversions: number; revenue: number;
  cpc: number; cpa: number; roas: number; ctr: number;
  searchImpressionShare: number; qualityScoreAvg: number;
}
interface GoogleCampaign {
  id: string; name: string; accountId: string; objective: string; status: string;
  spend: number; impressions: number; clicks: number; conversions: number;
  cpc: number; cpa: number; roas: number; ctr: number;
}
interface GoogleKeyword {
  kw: string; matchType: string; ctr: string; clicks: number; conversions: number;
}
interface DemographicItem { label: string; impressions: number; clicks: number }
interface GoogleData {
  timeSeries: GoogleTimeSeries[];
  totals: GoogleTotals;
  campaigns: GoogleCampaign[];
  keywords: GoogleKeyword[];
  demographics: {
    gender: DemographicItem[];
    age: DemographicItem[];
  };
}

interface GA4TimeSeries {
  date: string; sessions: number; users: number; newUsers: number;
  pageviews: number; engagedSessions: number; events: number; conversions: number;
}
interface GA4Totals {
  sessions: number; users: number; newUsers: number; pageviews: number;
  engagedSessions: number; events: number; conversions: number;
  engagementRate: number; eventsPerSession: number; pagesPerSession: number; newUserRate: number;
}
interface GA4Event {
  event: string; count: number; sessions: number; conversion: string;
}
interface GA4Data {
  timeSeries: GA4TimeSeries[];
  totals: GA4Totals;
  events: GA4Event[];
  regions: { name: string; value: number }[];
  channels: Record<string, { label: string; value: number; color: string }>;
  languages: { label: string; value: number; color: string }[];
  demographics: {
    gender: DemographicItem[];
    age: DemographicItem[];
  };
}

interface DemographicBreakdown { label: string; impressions: number; clicks: number }
interface AdCreative {
  id: string; name: string; thumbnail: string | null;
  impressions: number; clicks: number; purchases: number;
  leads: number; messages: number; conversions: number;
  spend: number; status: string; isMessaging: boolean;
}

interface ClientDashboardProps {
  workspaceId: string;
  workspaceName: string;
  logo?: string | null;
  platforms: string[];
  showLogout?: boolean;
  slug: string;
}

// ─── Safe fetch ───────────────────────────────────────────────────────────────

async function safeFetch(url: string): Promise<unknown> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const text = await r.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; }
  } catch { return null; }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ClientDashboard({
  workspaceId, workspaceName, logo, platforms, showLogout, slug,
}: ClientDashboardProps) {
  const defaultView: ClientView =
    platforms.length >= 2 ? "overview"
      : platforms.includes("meta") ? "meta"
        : platforms.includes("google") ? "google"
          : platforms.includes("ga4") ? "ga4"
            : "meta";

  const [view, setView] = useState<ClientView>(defaultView);
  const [days, setDays] = useState(30);
  const [daysOpen, setDaysOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Data state
  const [metaData, setMetaData] = useState<MetaData | null>(null);
  const [googleData, setGoogleData] = useState<GoogleData | null>(null);
  const [ga4Data, setGa4Data] = useState<GA4Data | null>(null);
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [demographics, setDemographics] = useState<{ gender: DemographicBreakdown[]; age: DemographicBreakdown[] }>({ gender: [], age: [] });
  const [regions, setRegions] = useState<{ name: string; value: number }[]>([]);

  // Fetch data when view or days changes
  useEffect(() => {
    setLoading(true);
    const hasMeta = platforms.includes("meta");
    const hasGoogle = platforms.includes("google");
    const hasGA4 = platforms.includes("ga4");
    const needsMeta = view === "meta" || view === "overview" || (view === "detalhes" && hasMeta);
    const needsGoogle = view === "google" || view === "overview" || (view === "detalhes" && hasGoogle);
    const needsGA4 = view === "ga4" || view === "overview" || (view === "detalhes" && hasGA4);
    const needsCreatives = view === "detalhes" && hasMeta;
    const needsDemographics = view === "detalhes" && hasMeta;
    const needsRegions = view === "detalhes" && hasMeta;

    const metaParams = new URLSearchParams({ workspaceId, days: String(days) });
    if (selectedCampaign) metaParams.set("campaignId", selectedCampaign.id);
    const googleParams = new URLSearchParams({ workspaceId, days: String(days) });
    const ga4Params = new URLSearchParams({ workspaceId, days: String(days) });

    Promise.all([
      needsMeta ? safeFetch(`/api/metrics?${metaParams}`) : Promise.resolve(null),
      needsGoogle ? safeFetch(`/api/google/metrics?${googleParams}`) : Promise.resolve(null),
      needsGA4 ? safeFetch(`/api/ga4/metrics?${ga4Params}`) : Promise.resolve(null),
      needsCreatives ? safeFetch(`/api/meta/creatives?${metaParams}`) : Promise.resolve(null),
      needsDemographics ? safeFetch(`/api/meta/demographics?${metaParams}`) : Promise.resolve(null),
      needsRegions ? safeFetch(`/api/meta/regions?${metaParams}`) : Promise.resolve(null),
    ]).then(([meta, google, ga4, creativesRes, demoRes, regionsRes]) => {
      if (meta) setMetaData(meta as MetaData);
      if (google) setGoogleData(google as GoogleData);
      if (ga4) setGa4Data(ga4 as GA4Data);
      if (creativesRes) setCreatives((creativesRes as { ads: AdCreative[] })?.ads ?? []);
      if (demoRes) setDemographics(demoRes as { gender: DemographicBreakdown[]; age: DemographicBreakdown[] });
      if (regionsRes) setRegions((regionsRes as { regions: { name: string; value: number }[] })?.regions ?? []);
    }).catch(() => { }).finally(() => setLoading(false));
  }, [workspaceId, days, view, selectedCampaign]);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!daysOpen && !campaignOpen) return;
    const handleClick = () => { setDaysOpen(false); setCampaignOpen(false); };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [daysOpen, campaignOpen]);

  const currentPeriodLabel = PERIOD_OPTIONS.find(p => p.days === days)?.label ?? `Últimos ${days} dias`;

  // ─── Download CSV ─────────────────────────────────────────────────────────

  function handleDownload() {
    if (view === "ga4") {
      const source = ga4Data?.timeSeries;
      if (!source) return;
      const headers = ["Data", "Sessões", "Usuários", "Conversões"];
      const rows = source.map(d => [d.date, d.sessions, d.users, d.conversions]);
      const csv = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `relatorio_ga4.csv`; a.click();
    } else if (view === "google") {
      const source = googleData?.timeSeries;
      if (!source) return;
      const headers = ["Data", "Investimento", "Impressões", "Cliques", "Conversões"];
      const rows = source.map(d => [d.date, d.spend.toFixed(2), d.impressions, d.clicks, d.conversions]);
      const csv = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `relatorio_google_ads.csv`; a.click();
    } else {
      const source = metaData?.timeSeries;
      if (!source) return;
      const headers = ["Data", "Investimento", "Impressões", "Cliques", "Conversões", "Vendas", "Conversas"];
      const rows = source.map(d => [d.date, d.spend.toFixed(2), d.impressions, d.clicks, d.conversions, d.purchases, d.messages + d.leads]);
      const csv = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `relatorio_meta.csv`; a.click();
    }
  }

  // ─── View renderers ───────────────────────────────────────────────────────

  const renderMeta = () => {
    const t = metaData?.totals;
    const hasMessages = t && t.messages > 0;
    const hasPurchases = t && t.purchases > 0;
    const hasRevenue = t && t.revenue > 0;

    const kpis = [
      { title: "Investimento", value: formatCurrency(t?.spend ?? 0), color: "#3b82f6", data: metaData?.timeSeries.map(d => d.spend) ?? [] },
      { title: "Impressões", value: formatNumber(t?.impressions ?? 0), color: "#f59e0b", data: metaData?.timeSeries.map(d => d.impressions) ?? [] },
      { title: "Alcance", value: formatNumber(t?.reach ?? 0), color: "#a855f7", data: metaData?.timeSeries.map(d => d.reach) ?? [] },
      { title: "Cliques", value: formatNumber(t?.clicks ?? 0), color: "#06b6d4", data: metaData?.timeSeries.map(d => d.clicks) ?? [] },
      ...(hasMessages ? [{ title: "Mensagens Iniciadas", value: formatNumber(t?.messages ?? 0), color: "#10b981", data: metaData?.timeSeries.map(d => d.messages) ?? [] }] : []),
      ...(hasPurchases ? [{ title: "Vendas", value: formatNumber(t?.purchases ?? 0), color: "#f97316", data: metaData?.timeSeries.map(d => d.purchases) ?? [] }] : []),
      ...(hasRevenue ? [{ title: "Faturamento", value: formatCurrency(t?.revenue ?? 0), color: "#22c55e", data: metaData?.timeSeries.map(d => d.revenue) ?? [] }] : []),
    ];

    return (
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 pb-8 sm:p-6 space-y-4 sm:space-y-6">

        {/* Top KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {kpis.map((k) => (
            <KpiCard
              key={k.title}
              title={k.title}
              value={k.value}
              change={0}
              sparklineColor={k.color}
              sparklineData={k.data}
            />
          ))}
        </div>

        {/* Charts Row — mobile: [Funnel|Donut] stacked above [Line]; desktop: side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
          {/* Funnel + Donut: always side by side */}
          <div className="flex gap-3 sm:gap-4">
            {/* Funnel */}
            <div className="glass-panel rounded-2xl p-3 sm:p-6 flex-1 flex flex-col relative min-h-[190px]">
              <h2 className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 sm:mb-6 text-center">Funil de Conversão</h2>
              <FunnelChart data={{
                impressions: t?.impressions ?? 0,
                clicks: t?.clicks ?? 0,
                conversions: t?.conversions ?? 0,
                revenue: t?.revenue ?? 0,
                conversionLabel: t && t.purchases > 0 ? "Vendas" : t && t.messages > 0 ? "Conversas" : t && t.leads > 0 ? "Leads" : "Conversões"
              }} />
            </div>
            {/* Donut */}
            <div className="glass-panel rounded-2xl p-3 sm:p-6 flex-1 flex flex-col min-h-[190px]">
              <h2 className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 sm:mb-6 text-center">Top Campanhas</h2>
              <TopCampaignsDonut
                campaigns={metaData?.campaigns ?? []}
                conversionLabel={t && t.purchases > 0 ? "VENDAS" : t && t.messages > 0 ? "CONVERSAS" : "CONVERSÕES"}
              />
            </div>
          </div>
          {/* Line Chart */}
          <div className="glass-panel rounded-2xl p-4 sm:p-6 flex flex-col">
            <div className="flex justify-between items-center mb-3 sm:mb-6">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center w-full">Performance ao Longo do Tempo</h2>
            </div>
            <div className="flex-1 w-full min-h-[200px] sm:min-h-[300px]">
              <PerformanceChart
                data={metaData?.timeSeries ?? []}
                metrics={["spend", "revenue"]}
              />
            </div>
            <div className="flex justify-center gap-6 mt-3 sm:mt-4">
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                <span className="w-3 h-1 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"></span> Faturamento
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                <span className="w-3 h-1 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]"></span> Investimento
              </div>
            </div>
          </div>
        </div>

        {/* Active Campaigns Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <LayoutDashboard size={16} className="text-blue-500" />
              Campanhas em Execução
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                {metaData?.campaigns?.filter(c => c.status === "ACTIVE").length ?? 0} ATIVAS AGORA
              </span>
            </div>
          </div>
          <CampaignsTable
            campaigns={metaData?.campaigns ?? []}
            showExport
          />
        </div>

      </div>
    );
  };

  const renderGoogle = () => {
    const t = googleData?.totals;

    const isGoogleConnected = platforms.includes("google");
    if (!isGoogleConnected) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-center max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Search size={28} className="text-cyan-500/60" />
            </div>
            <div>
              <p className="text-slate-200 font-bold text-sm">Integração Google Ads</p>
              <p className="text-slate-500 text-xs mt-1">A conexão com Google Ads estará disponível em breve. Os dados aparecerão aqui assim que a integração for ativada.</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 pb-8 sm:p-6 space-y-4 sm:space-y-6">

        {/* KPIs */}
        <div className={`grid gap-3 sm:gap-4 ${t && t.revenue > 0 ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-5" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-3"}`}>
          <KpiCard
            title="Investimento"
            value={formatCurrency(t?.spend ?? 0)}
            sparklineColor="#22d3ee"
            sparklineData={googleData?.timeSeries.map(d => d.spend) ?? []}
          />
          {t && t.revenue > 0 && (
            <KpiCard
              title="Receita"
              value={formatCurrency(t?.revenue ?? 0)}
              sparklineColor="#10b981"
              sparklineData={googleData?.timeSeries.map(d => d.revenue) ?? []}
            />
          )}
          <KpiCard
            title="Conversões"
            value={formatNumber(t?.conversions ?? 0)}
            sparklineColor="#06b6d4"
            sparklineData={googleData?.timeSeries.map(d => d.conversions) ?? []}
          />
          {t && t.revenue > 0 && (
            <KpiCard
              title="ROAS Médio"
              value={`${(t?.roas ?? 0).toFixed(2)}x`}
              sparklineColor="#a855f7"
              sparklineData={googleData?.timeSeries.map(d => d.spend > 0 ? d.revenue / d.spend : 0) ?? []}
            />
          )}
          <KpiCard
            title="CPC Médio"
            value={formatCurrency(t?.cpc ?? 0)}
            sparklineColor="#60a5fa"
            sparklineData={googleData?.timeSeries.map(d => d.clicks > 0 ? d.spend / d.clicks : 0) ?? []}
          />
        </div>

        {/* Charts Row — mobile: [Funnel|Donut] stacked above [Line]; desktop: side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
          {/* Funnel + Donut: always side by side */}
          <div className="flex gap-3 sm:gap-4">
            {/* Funnel */}
            <div className="glass-panel rounded-2xl p-3 sm:p-6 flex-1 flex flex-col relative min-h-[190px]">
              <h2 className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 sm:mb-6 text-center">Funil de Conversão</h2>
              <FunnelChart data={{
                impressions: t?.impressions ?? 0,
                clicks: t?.clicks ?? 0,
                conversions: t?.conversions ?? 0,
                revenue: t?.revenue ?? 0,
                conversionLabel: t && t.revenue > 0 ? "Vendas" : "Conversões",
              }} />
            </div>
            {/* Donut */}
            <div className="glass-panel rounded-2xl p-3 sm:p-6 flex-1 flex flex-col min-h-[190px]">
              <h2 className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 sm:mb-6 text-center">Top Campanhas</h2>
              <TopCampaignsDonut
                campaigns={googleData?.campaigns ?? []}
                conversionLabel={t && t.revenue > 0 ? "Vendas" : "Conversões"}
              />
            </div>
          </div>
          {/* Line Chart */}
          <div className="glass-panel rounded-2xl p-4 sm:p-6 flex flex-col">
            <div className="flex justify-between items-center mb-3 sm:mb-6">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center w-full">Performance ao Longo do Tempo</h2>
            </div>
            <div className="flex-1 w-full min-h-[200px] sm:min-h-[300px]">
              <PerformanceChart
                data={googleData?.timeSeries ?? []}
                metrics={t && t.revenue > 0 ? ["spend", "revenue"] : ["spend", "clicks"]}
              />
            </div>
            <div className="flex justify-center gap-6 mt-3 sm:mt-4">
              {t && t.revenue > 0 ? (
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                  <span className="w-3 h-1 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"></span> Receita
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                  <span className="w-3 h-1 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.4)]"></span> Cliques
                </div>
              )}
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                <span className="w-3 h-1 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.4)]"></span> Investimento
              </div>
            </div>
          </div>
        </div>

        {/* Enriched Data Row: Keywords & Demographics */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
          {/* Keywords Table */}
          <div className="lg:col-span-7">
            <KeywordsTable keywords={googleData?.keywords ?? []} />
          </div>

          {/* Demographics */}
          <div className="lg:col-span-5 flex flex-col gap-4 sm:gap-6">
            {(googleData?.demographics.gender.length ?? 0) > 0 && (
              <div className="glass-panel rounded-2xl p-4 sm:p-6 flex flex-col">
                <div className="flex items-center gap-2 mb-4 sm:mb-6">
                  <Users size={16} className="text-cyan-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Demografia: Gênero</h3>
                </div>
                <div className="grid grid-cols-2 gap-6 items-center">
                  <div className="aspect-square relative max-w-[140px] mx-auto">
                    <Pie
                      data={{
                        labels: googleData!.demographics.gender.map(g => g.label),
                        datasets: [{
                          data: googleData!.demographics.gender.map(g => g.impressions),
                          backgroundColor: ['#22d3ee', '#2563eb', '#1e40af'],
                          borderWidth: 0,
                        }]
                      }}
                      options={{ cutout: '70%', plugins: { legend: { display: false } } }}
                    />
                  </div>
                  <div className="space-y-3">
                    {(() => {
                      const total = googleData!.demographics.gender.reduce((a, b) => a + b.impressions, 0);
                      return googleData!.demographics.gender.map((g, i) => (
                        <div key={i} className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ['#22d3ee', '#2563eb', '#1e40af'][i] }}></div>
                            {g.label}
                          </div>
                          <span className="text-white">{total > 0 ? Math.round((g.impressions / total) * 100) : 0}%</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            )}

            {(googleData?.demographics.age.length ?? 0) > 0 && (
              <div className="glass-panel rounded-2xl p-4 sm:p-6 flex flex-col">
                <div className="flex items-center gap-2 mb-4 sm:mb-6">
                  <PieChartIcon size={16} className="text-cyan-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Demografia: Idade</h3>
                </div>
                <div className="space-y-3">
                  {(() => {
                    const total = googleData!.demographics.age.reduce((acc, curr) => acc + curr.impressions, 0);
                    return googleData!.demographics.age.map((a, i) => {
                      const percent = total > 0 ? Math.round((a.impressions / total) * 100) : 0;
                      return (
                        <div key={i} className="space-y-1">
                          <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase">
                            <span>{a.label}</span>
                            <span>{percent}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-cyan-500 rounded-full"
                              style={{ width: `${percent}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Campaigns Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <LayoutDashboard size={16} className="text-cyan-500" />
              Campanhas em Execução
            </h2>
            <span className="text-[10px] font-bold text-cyan-500 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
              {googleData?.campaigns?.filter(c => c.status === "ACTIVE").length ?? 0} ATIVAS AGORA
            </span>
          </div>
          <CampaignsTable campaigns={(googleData?.campaigns ?? []).map(c => ({ ...c, accountId: "", objective: "" }))} showExport />
        </div>

      </div>
    );
  };

  const renderGA4 = () => {
    const t = ga4Data?.totals;

    const isGA4Connected = platforms.includes("ga4");
    if (!isGA4Connected) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-center max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <Target size={28} className="text-orange-500/60" />
            </div>
            <div>
              <p className="text-slate-200 font-bold text-sm">Integração Google Analytics 4</p>
              <p className="text-slate-500 text-xs mt-1">A conexão com GA4 estará disponível em breve. Os dados aparecerão aqui assim que a integração for ativada.</p>
            </div>
          </div>
        </div>
      );
    }

    // Mapeia timeSeries GA4 para o formato do PerformanceChart
    const chartSeries = (ga4Data?.timeSeries ?? []).map(d => ({
      date: d.date,
      spend: d.sessions,
      revenue: d.engagedSessions,
      impressions: d.pageviews,
      clicks: d.users,
      conversions: d.conversions,
    }));

    // Mapeia eventos como "campanhas" pro donut de top eventos
    const eventsAsCampaigns = (ga4Data?.events ?? []).map(e => ({
      id: e.event,
      name: e.event,
      conversions: e.count,
    }));

    return (
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 pb-8 sm:p-6 space-y-4 sm:space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <KpiCard
            title="Sessões"
            value={formatNumber(t?.sessions ?? 0)}
            sparklineColor="#f97316"
            sparklineData={ga4Data?.timeSeries.map(d => d.sessions) ?? []}
          />
          <KpiCard
            title="Usuários"
            value={formatNumber(t?.users ?? 0)}
            sparklineColor="#fb923c"
            sparklineData={ga4Data?.timeSeries.map(d => d.users) ?? []}
          />
          <KpiCard
            title="Novos Usuários"
            value={formatNumber(t?.newUsers ?? 0)}
            sparklineColor="#fdba74"
            sparklineData={ga4Data?.timeSeries.map(d => d.newUsers) ?? []}
          />
          <KpiCard
            title="Engajamento"
            value={`${t?.engagementRate ?? 0}%`}
            sparklineColor="#fbbf24"
            sparklineData={ga4Data?.timeSeries.map(d =>
              d.sessions > 0 ? (d.engagedSessions / d.sessions) * 100 : 0
            ) ?? []}
          />
          <KpiCard
            title="Eventos / Sessão"
            value={String(t?.eventsPerSession ?? 0)}
            sparklineColor="#fde68a"
            sparklineData={ga4Data?.timeSeries.map(d =>
              d.sessions > 0 ? d.events / d.sessions : 0
            ) ?? []}
          />
        </div>

        {/* Charts Row — mobile: [Funnel|Donut] stacked above [Line]; desktop: side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
          {/* Funnel + Donut: always side by side */}
          <div className="flex gap-3 sm:gap-4">
            {/* Funnel */}
            <div className="glass-panel rounded-2xl p-3 sm:p-6 flex-1 flex flex-col relative min-h-[190px]">
              <h2 className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 sm:mb-6 text-center">Funil de Audiência</h2>
              <FunnelChart data={{
                impressions: t?.sessions ?? 0,
                clicks: t?.engagedSessions ?? 0,
                conversions: t?.conversions ?? 0,
                revenue: t?.pageviews ?? 0,
                impressionsLabel: "Sessões",
                clicksLabel: "Engajadas",
                conversionLabel: "Conversões",
                rateLabel1: "Eng",
                rateLabel2: "Conv",
              }} />
            </div>
            {/* Top Events Donut */}
            <div className="glass-panel rounded-2xl p-3 sm:p-6 flex-1 flex flex-col min-h-[190px]">
              <h2 className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 sm:mb-6 text-center">Top Eventos</h2>
              <TopCampaignsDonut campaigns={eventsAsCampaigns} />
            </div>
          </div>
          {/* Line Chart */}
          <div className="glass-panel rounded-2xl p-4 sm:p-6 flex flex-col">
            <div className="flex justify-between items-center mb-3 sm:mb-6">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center w-full">Audiência ao Longo do Tempo</h2>
            </div>
            <div className="flex-1 w-full min-h-[200px] sm:min-h-[300px]">
              <PerformanceChart
                data={chartSeries}
                metrics={["spend", "clicks"]}
              />
            </div>
            <div className="flex justify-center gap-6 mt-3 sm:mt-4">
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                <span className="w-3 h-1 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.4)]"></span> Sessões
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                <span className="w-3 h-1 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]"></span> Usuários
              </div>
            </div>
          </div>
        </div>

        {/* Demographics Row */}
        {((ga4Data?.demographics.gender.length ?? 0) > 0 || (ga4Data?.demographics.age.length ?? 0) > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
            {(ga4Data?.demographics.gender.length ?? 0) > 0 && (
              <div className="lg:col-span-6 glass-panel rounded-2xl p-4 sm:p-6 flex flex-col">
                <div className="flex items-center gap-2 mb-4 sm:mb-6">
                  <Users size={16} className="text-orange-500" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Demografia: Gênero</h3>
                </div>
                <div className="grid grid-cols-2 gap-6 items-center">
                  <div className="aspect-square relative max-w-[160px] mx-auto">
                    <Pie
                      data={{
                        labels: ga4Data!.demographics.gender.map(g => g.label),
                        datasets: [{
                          data: ga4Data!.demographics.gender.map(g => g.impressions),
                          backgroundColor: ['#f97316', '#fb923c', '#fdba74'],
                          borderWidth: 0,
                        }]
                      }}
                      options={{ cutout: '70%', plugins: { legend: { display: false } } }}
                    />
                  </div>
                  <div className="space-y-4">
                    {(() => {
                      const total = ga4Data!.demographics.gender.reduce((a, b) => a + b.impressions, 0);
                      return ga4Data!.demographics.gender.map((g, i) => (
                        <div key={i} className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ['#f97316', '#fb923c', '#fdba74'][i] }}></div>
                            {g.label}
                          </div>
                          <span className="text-white">{total > 0 ? Math.round((g.impressions / total) * 100) : 0}%</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            )}

            {(ga4Data?.demographics.age.length ?? 0) > 0 && (
              <div className="lg:col-span-6 glass-panel rounded-2xl p-4 sm:p-6 flex flex-col">
                <div className="flex items-center gap-2 mb-4 sm:mb-6">
                  <PieChartIcon size={16} className="text-orange-500" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Demografia: Idade</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                  {(() => {
                    const total = ga4Data!.demographics.age.reduce((acc, curr) => acc + curr.impressions, 0);
                    return ga4Data!.demographics.age.map((a, i) => {
                      const percent = total > 0 ? Math.round((a.impressions / total) * 100) : 0;
                      return (
                        <div key={i} className="space-y-1">
                          <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase">
                            <span>{a.label}</span>
                            <span>{percent}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-orange-500 rounded-full"
                              style={{ width: `${percent}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Events Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <LayoutDashboard size={16} className="text-orange-500" />
              Eventos de Conversão
            </h2>
            <span className="text-[10px] font-bold text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded-full border border-orange-500/20">
              {ga4Data?.events?.length ?? 0} EVENTOS RASTREADOS
            </span>
          </div>
          <div className="glass-panel rounded-xl overflow-hidden flex flex-col border-none shadow-2xl">
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left text-sm whitespace-nowrap min-w-[500px]">
              <thead className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-800/50 border-b border-slate-700/50">
                <tr>
                  <th className="px-4 py-4 font-semibold">#</th>
                  <th className="px-4 py-4 font-semibold">Nome do Evento</th>
                  <th className="px-4 py-4 font-semibold text-right">Contagem</th>
                  <th className="px-4 py-4 font-semibold text-right">Sessões</th>
                  <th className="px-4 py-4 font-semibold text-right">Taxa de Conv.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30 text-slate-300">
                {(ga4Data?.events ?? []).map((e, idx) => {
                  const maxCount = Math.max(...(ga4Data?.events ?? []).map(ev => ev.count), 1);
                  const barWidth = Math.min((e.count / maxCount) * 100, 100);
                  return (
                    <tr key={e.event} className="hover:bg-slate-800/50 transition-colors group">
                      <td className="px-4 py-3.5 text-slate-500 text-xs">{idx + 1}.</td>
                      <td className="px-4 py-3.5 font-bold text-slate-100 group-hover:text-orange-400 uppercase tracking-tighter text-[11px]">{e.event}</td>
                      <td className="px-4 py-3.5 text-right font-medium relative overflow-hidden min-w-[120px]">
                        <div className="absolute inset-y-0 right-0 bg-orange-500/10 z-0 transition-all" style={{ width: `${barWidth}%` }} />
                        <span className="relative z-10 text-orange-300 font-black text-[11px]">{formatNumber(e.count)}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right text-slate-400 text-[11px]">{formatNumber(e.sessions)}</td>
                      <td className="px-4 py-3.5 text-right font-black text-[11px] text-orange-400">{e.conversion}</td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    );
  };

  const renderOverview = () => {
    const mt = metaData?.totals;
    const gt = googleData?.totals;
    const g4t = ga4Data?.totals;

    const totalSpend = (mt?.spend ?? 0) + (gt?.spend ?? 0);
    const totalRevenue = (mt?.revenue ?? 0) + (gt?.revenue ?? 0);
    const totalConversions = (mt?.conversions ?? 0) + (gt?.conversions ?? 0) + (g4t?.conversions ?? 0);
    const consolidatedCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

    // Merge timeSeries: soma Meta + Google por data
    const mergedSeries = (() => {
      interface TSEntry { date: string; spend: number; revenue: number; impressions: number; clicks: number; conversions: number }
      const map = new Map<string, TSEntry>();
      for (const d of metaData?.timeSeries ?? []) {
        map.set(d.date, { date: d.date, spend: d.spend, revenue: d.revenue, impressions: d.impressions, clicks: d.clicks, conversions: d.conversions });
      }
      for (const d of googleData?.timeSeries ?? []) {
        const existing = map.get(d.date);
        if (existing) {
          existing.spend += d.spend;
          existing.revenue += d.revenue;
          existing.impressions += d.impressions;
          existing.clicks += d.clicks;
          existing.conversions += d.conversions;
        } else {
          map.set(d.date, { date: d.date, spend: d.spend, revenue: d.revenue, impressions: d.impressions, clicks: d.clicks, conversions: d.conversions });
        }
      }
      return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    })();

    // Share de plataforma por investimento
    const metaShare = totalSpend > 0 ? Math.round(((mt?.spend ?? 0) / totalSpend) * 100) : 0;
    const googleShare = totalSpend > 0 ? Math.round(((gt?.spend ?? 0) / totalSpend) * 100) : 0;
    const ga4Share = 100 - metaShare - googleShare;

    return (
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 pb-8 sm:p-6 space-y-4 sm:space-y-6">

        {/* KPIs Consolidados */}
        <div className={`grid gap-3 sm:gap-4 ${totalRevenue > 0 ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-5" : "grid-cols-2 md:grid-cols-2 lg:grid-cols-4"}`}>
          <KpiCard title="Investimento Total" value={formatCurrency(totalSpend)} sparklineColor="#3b82f6" sparklineData={mergedSeries.map(d => d.spend)} />
          {totalRevenue > 0 && (
            <KpiCard title="Faturamento Total" value={formatCurrency(totalRevenue)} sparklineColor="#10b981" sparklineData={mergedSeries.map(d => d.revenue)} />
          )}
          <KpiCard title="Conversões Totais" value={formatNumber(totalConversions)} sparklineColor="#f59e0b" sparklineData={mergedSeries.map(d => d.conversions)} />
          <KpiCard title="CPA Consolidado" value={formatCurrency(consolidatedCpa)} sparklineColor="#60a5fa" sparklineData={mergedSeries.map(d => d.conversions > 0 ? d.spend / d.conversions : 0)} />
          <KpiCard title="Sessões GA4" value={formatNumber(g4t?.sessions ?? 0)} sparklineColor="#f97316" sparklineData={(ga4Data?.timeSeries ?? []).map(d => d.sessions)} />
        </div>

        {/* Performance + Share */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] lg:grid-cols-12 gap-4 sm:gap-6">

          {/* Combined Performance Chart */}
          <div className="sm:col-span-1 lg:col-span-7 glass-panel rounded-2xl p-4 sm:p-6 flex flex-col">
            <div className="flex items-center gap-4 mb-4">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Performance Consolidada</h2>
              <div className="flex items-center gap-3 ml-auto">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-1 bg-blue-500 rounded"></div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Investimento</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-1 bg-emerald-500 rounded"></div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Faturamento</span>
                </div>
              </div>
            </div>
            <div className="flex-1 min-h-[200px] sm:min-h-[260px]">
              <PerformanceChart data={mergedSeries} metrics={["spend", "revenue"]} />
            </div>
          </div>

          {/* Share de Plataforma */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="glass-panel rounded-2xl p-4 sm:p-6 flex flex-col items-center flex-1">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest mb-4 w-full text-center">Share de Investimento</h3>
              <div className="w-full aspect-square relative max-w-[140px]">
                <Pie
                  data={{
                    labels: ['Meta Ads', 'Google Ads', 'Outros'],
                    datasets: [{
                      data: [metaShare, googleShare, Math.max(ga4Share, 0)],
                      backgroundColor: ['#2563eb', '#22d3ee', '#f97316'],
                      borderWidth: 0,
                    }]
                  }}
                  options={{ cutout: '70%', plugins: { legend: { display: false } } }}
                />
                <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                  <span className="text-[9px] font-bold text-slate-400">Meta</span>
                  <span className="text-sm font-black text-white">{metaShare}%</span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 w-full">
                {[
                  { label: 'Meta Ads', color: '#2563eb', val: `${metaShare}%`, spend: mt?.spend ?? 0 },
                  { label: 'Google Ads', color: '#22d3ee', val: `${googleShare}%`, spend: gt?.spend ?? 0 },
                ].map(item => (
                  <div key={item.label} className="flex justify-between items-center text-[9px] font-bold text-slate-400 uppercase">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></div>
                      {item.label}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">{formatCurrency(item.spend)}</span>
                      <span className="text-white">{item.val}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>

        {/* Cards de plataforma */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">

          {/* Meta */}
          <button onClick={() => setView("meta")} className="glass-panel rounded-2xl p-4 sm:p-6 flex flex-col gap-4 hover:border-blue-500/50 border border-transparent transition-all group text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src="/icon-meta.png" alt="Meta Ads" className="w-6 h-6 object-contain" />
                <span className="text-sm font-bold text-slate-200 group-hover:text-white">Meta Ads</span>
              </div>
              <TrendingUp size={14} className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className={`grid gap-3 ${mt && mt.revenue > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Investimento</p>
                <p className="text-base font-black text-white">{formatCurrency(mt?.spend ?? 0)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Conversões</p>
                <p className="text-base font-black text-white">{formatNumber(mt?.conversions ?? 0)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">CTR</p>
                <p className="text-base font-black text-white">{(mt?.ctr ?? 0).toFixed(2)}%</p>
              </div>
            </div>
            <div className="text-[9px] font-bold text-blue-400 uppercase tracking-wider group-hover:text-blue-300">Ver detalhes →</div>
          </button>

          {/* Google */}
          <button onClick={() => setView("google")} className="glass-panel rounded-2xl p-4 sm:p-6 flex flex-col gap-4 hover:border-cyan-500/50 border border-transparent transition-all group text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src="/icon-google-ads.webp" alt="Google Ads" className="w-6 h-6 object-contain" />
                <span className="text-sm font-bold text-slate-200 group-hover:text-white">Google Ads</span>
              </div>
              <TrendingUp size={14} className="text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className={`grid gap-3 ${gt && gt.revenue > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Investimento</p>
                <p className="text-base font-black text-white">{formatCurrency(gt?.spend ?? 0)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Conversões</p>
                <p className="text-base font-black text-white">{formatNumber(gt?.conversions ?? 0)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">IQ Médio</p>
                <p className="text-base font-black text-white">{(gt?.qualityScoreAvg ?? 0).toFixed(1)}/10</p>
              </div>
            </div>
            <div className="text-[9px] font-bold text-cyan-400 uppercase tracking-wider group-hover:text-cyan-300">Ver detalhes →</div>
          </button>

          {/* GA4 */}
          <button onClick={() => setView("ga4")} className="glass-panel rounded-2xl p-4 sm:p-6 flex flex-col gap-4 hover:border-orange-500/50 border border-transparent transition-all group text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src="/icon-ga4.png" alt="Google Analytics 4" className="w-6 h-6 object-contain" />
                <span className="text-sm font-bold text-slate-200 group-hover:text-white">Google Analytics 4</span>
              </div>
              <TrendingUp size={14} className="text-orange-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Sessões</p>
                <p className="text-base font-black text-white">{formatNumber(g4t?.sessions ?? 0)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Engajamento</p>
                <p className="text-base font-black text-emerald-400">{g4t?.engagementRate ?? 0}%</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Usuários</p>
                <p className="text-base font-black text-white">{formatNumber(g4t?.users ?? 0)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Eventos/Sessão</p>
                <p className="text-base font-black text-white">{g4t?.eventsPerSession ?? 0}</p>
              </div>
            </div>
            <div className="text-[9px] font-bold text-orange-400 uppercase tracking-wider group-hover:text-orange-300">Ver detalhes →</div>
          </button>

        </div>

      </div>
    );
  };

  const renderDetalhes = () => {
    const hasMeta = platforms.includes("meta");
    const hasGoogle = platforms.includes("google");
    const hasGA4 = platforms.includes("ga4");
    const mt = metaData?.totals;
    const gt = googleData?.totals;
    const g4t = ga4Data?.totals;
    const convRate = mt && mt.clicks > 0 ? Math.round((mt.conversions / mt.clicks) * 1000) / 10 : 0;

    // Demographics — dados reais da BM
    const totalGI = demographics.gender.reduce((a, b) => a + b.impressions, 0) || 1;
    const gLabels = demographics.gender.map(g => g.label);
    const gData = demographics.gender.map(g => Math.round((g.impressions / totalGI) * 100));

    const totalAI = demographics.age.reduce((a, b) => a + b.impressions, 0) || 1;
    const aLabels = demographics.age.map(a => a.label);
    const aData = demographics.age.map(a => Math.round((a.impressions / totalAI) * 100));

    return (
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 pb-8 sm:p-6 space-y-4 sm:space-y-6">

        {/* ═══ Row 1: Gauge | Line | Gênero | Faixa Etária (Meta only) ═══ */}
        {hasMeta && <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-12 gap-3 sm:gap-4 lg:gap-6">

          {/* Gauge + KPIs — mobile: col 1 */}
          <div className="col-span-1 lg:col-span-3 flex flex-col gap-3 sm:gap-4">
            <div className="glass-panel flex-1 rounded-2xl p-3 sm:p-6 flex flex-col items-center justify-center">
              <GaugeChart
                value={convRate}
                label="Taxa de Conversão"
                sublabel={`${(mt?.conversions ?? 0).toLocaleString('pt-BR')} conv.`}
                color="#3b82f6"
              />
            </div>
            <div className={`glass-panel rounded-2xl p-4 space-y-2 ${mt?.revenue ?? 0 > 0 ? "" : "border-slate-800/50"}`}>
              <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500">
                <span>Investimento</span>
                <span className="text-white">{formatCurrency(mt?.spend ?? 0)}</span>
              </div>

              {/* WhatsApp Metric */}
              {((mt?.messages ?? 0) > 0 || (mt?.leads ?? 0) > 0) && (
                <div className="pt-1 border-t border-white/5 space-y-1">
                  <div className="flex justify-between text-[10px] font-bold uppercase text-blue-400">
                    <span>Conversas</span>
                    <span>{formatNumber((mt?.messages ?? 0) + (mt?.leads ?? 0))}</span>
                  </div>
                  <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500">
                    <span>Custo p/ Conversa</span>
                    <span className="text-white">{formatCurrency((mt?.messages ?? 0) + (mt?.leads ?? 0) > 0 ? (mt?.spend ?? 0) / ((mt?.messages ?? 0) + (mt?.leads ?? 0)) : 0)}</span>
                  </div>
                </div>
              )}

              {/* Purchase Metric */}
              {(mt?.purchases ?? 0) > 0 && (
                <div className="pt-1 border-t border-white/5 space-y-1">
                  <div className="flex justify-between text-[10px] font-bold uppercase text-emerald-400">
                    <span>Vendas (Compras)</span>
                    <span>{formatNumber(mt?.purchases ?? 0)}</span>
                  </div>
                  <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500">
                    <span>Custo p/ Venda</span>
                    <span className="text-white">{formatCurrency((mt?.purchases ?? 0) > 0 ? (mt?.spend ?? 0) / (mt?.purchases ?? 1) : 0)}</span>
                  </div>
                </div>
              )}

              {!(mt?.messages) && !(mt?.leads) && !(mt?.purchases) && (mt?.conversions ?? 0) > 0 && (
                <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500 pt-1 border-t border-white/5">
                  <span>Conversões</span>
                  <span className="text-white">{formatNumber(mt?.conversions ?? 0)}</span>
                </div>
              )}
              {((mt?.revenue ?? 0) > 0 || (mt?.roas ?? 0) > 0) && (
                <>
                  <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500 pt-1 border-t border-white/5">
                    <span>Receita</span>
                    <span className="text-white">{formatCurrency(mt?.revenue ?? 0)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Line Chart — mobile: col 2; desktop: col 2 (order) */}
          <div className="col-span-1 lg:col-span-4 glass-panel rounded-2xl p-3 sm:p-6 flex flex-col">
            <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-1 bg-blue-500 rounded"></div>
                <span className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase">
                  {(mt?.purchases ?? 0) > 0 ? "Vendas" : (mt?.messages ?? 0) > 0 ? "Conversas" : (mt?.leads ?? 0) > 0 ? "Leads" : "Conv."}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-1 bg-emerald-400 rounded"></div>
                <span className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase">Custo</span>
              </div>
            </div>
            <div className="flex-1 min-h-[160px] sm:min-h-[220px]">
              <PerformanceChart
                data={metaData?.timeSeries ?? []}
                metrics={["conversions", "spend"]}
                customLabels={{ conversions: (mt?.purchases ?? 0) > 0 ? "Vendas" : (mt?.messages ?? 0) > 0 ? "Conversas" : (mt?.leads ?? 0) > 0 ? "Leads" : "Conversões" }}
              />
            </div>
          </div>

          {/* Gênero — mobile: col 1 */}
          <div className="col-span-1 lg:col-span-2 glass-panel rounded-2xl p-3 sm:p-5 flex flex-col items-center">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest mb-3 w-full text-center">Gênero</h3>
            {gLabels.length > 0 ? (
              <>
                <div className="w-full aspect-square relative max-w-[120px]">
                  <Pie
                    data={{ labels: gLabels, datasets: [{ data: gData, backgroundColor: GENDER_COLORS, borderWidth: 0 }] }}
                    options={{ cutout: '65%', plugins: { legend: { display: false } } }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                    <span className="text-sm font-black text-white">{gData[0]}%</span>
                    <span className="text-[7px] font-bold text-slate-400">{gLabels[0]?.split(" ")[0]}</span>
                  </div>
                </div>
                <div className="mt-3 space-y-1 w-full">
                  {gLabels.map((label, i) => (
                    <div key={label} className="flex justify-between items-center text-[9px] font-bold text-slate-400 uppercase">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: GENDER_COLORS[i] }}></div>
                        {label}
                      </div>
                      <span className="text-white">{gData[i]}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-[10px] text-slate-600 font-bold uppercase tracking-widest text-center">Sem dados</div>
            )}
          </div>

          {/* Faixa Etária — mobile: col 2 */}
          <div className="col-span-1 lg:col-span-3 glass-panel rounded-2xl p-3 sm:p-5 flex flex-col items-center">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest mb-3 w-full text-center">Faixa Etária</h3>
            {aLabels.length > 0 ? (
              <>
                <div className="w-full aspect-square relative max-w-[120px]">
                  <Pie
                    data={{ labels: aLabels, datasets: [{ data: aData, backgroundColor: AGE_COLORS, borderWidth: 0 }] }}
                    options={{ cutout: '65%', plugins: { legend: { display: false } } }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                    <span className="text-sm font-black text-white">{aData[0]}%</span>
                    <span className="text-[7px] font-bold text-slate-400">{aLabels[0]}</span>
                  </div>
                </div>
                <div className="mt-3 space-y-1 w-full max-h-28 overflow-y-auto no-scrollbar">
                  {aLabels.map((label, i) => (
                    <div key={label} className="flex justify-between items-center text-[9px] font-bold text-slate-400 uppercase">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: AGE_COLORS[i % AGE_COLORS.length] }}></div>
                        {label}
                      </div>
                      <span className="text-white">{aData[i]}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-[10px] text-slate-600 font-bold uppercase tracking-widest text-center">Sem dados</div>
            )}
          </div>

        </div>}

        {/* ═══ Row 2: Anúncios Meta (FULL WIDTH) ═══ */}
        {hasMeta && <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
          <div className="lg:col-span-12 glass-panel rounded-2xl p-4 sm:p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-black text-white/80 uppercase tracking-[0.2em]">Anúncios Ativos</h3>
                <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20 uppercase">Meta Ads</span>
              </div>
              <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 uppercase tracking-widest">
                {creatives.filter(a => a.status === "ACTIVE").length} ATIVOS
              </span>
            </div>

            <div className="overflow-x-auto no-scrollbar pb-4">
              {creatives.length > 0 ? (
                <div className="flex gap-6" style={{ minWidth: `${creatives.length * 160}px` }}>
                  {creatives.map(ad => (
                    <div key={ad.id} className="flex-shrink-0 w-[160px] group/ad">
                      <p className="text-[10px] font-bold text-white/40 mb-3 truncate uppercase tracking-tighter group-hover/ad:text-white transition-colors">{ad.name}</p>
                      <div className="relative aspect-[4/5] w-full rounded-xl overflow-hidden bg-slate-800 border border-white/5 transition-transform group-hover/ad:scale-[1.02] duration-500">
                        {ad.thumbnail ? (
                          <img
                            src={ad.thumbnail}
                            alt={ad.name}
                            className="w-full h-full object-cover grayscale-[0.3] group-hover/ad:grayscale-0 transition-all duration-700"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-[8px] text-slate-600 font-bold uppercase tracking-widest italic">Sem imagem</span>
                          </div>
                        )}
                        <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${ad.status === "ACTIVE" ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" : "bg-slate-500"}`}></div>
                        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
                      </div>
                      <div className="mt-3 space-y-2 px-1">
                        <div className="flex justify-between items-center">
                          <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Impressões</span>
                          <span className="text-[12px] font-black text-white">{formatNumber(ad.impressions)}</span>
                        </div>

                        {ad.messages + ad.leads > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-[8px] font-bold text-blue-400 uppercase tracking-widest">Conversas</span>
                            <span className="text-[12px] font-black text-blue-400">{ad.messages + ad.leads}</span>
                          </div>
                        )}

                        {ad.purchases > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-widest">Vendas</span>
                            <span className="text-[12px] font-black text-emerald-400">{ad.purchases}</span>
                          </div>
                        )}

                        {!ad.messages && !ad.leads && !ad.purchases && ad.conversions > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Conv.</span>
                            <span className="text-[12px] font-black text-white">{ad.conversions}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-20 text-center text-slate-700 text-[10px] font-black uppercase tracking-[0.3em] opacity-40">
                  Nenhum anúncio encontrado
                </div>
              )}
            </div>

            {creatives.length > 0 && (
              <div className="mt-4 flex justify-between items-center text-[10px] font-bold text-white/10 uppercase tracking-[0.2em] border-t border-white/5 pt-4">
                <span>Exibindo {Math.min(creatives.length, 7)} / {creatives.length} anúncios</span>
                <div className="flex gap-6 pointer-events-auto">
                  <button className="hover:text-white transition-colors cursor-pointer">&lt;</button>
                  <button className="hover:text-white transition-colors cursor-pointer">&gt;</button>
                </div>
              </div>
            )}
          </div>
        </div>}

        {/* ═══ Row 3: Região & Mapa Geográfico (SPLIT, Meta only) ═══ */}
        {hasMeta && <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
          <div className="lg:col-span-4 h-[280px] sm:h-[480px]">
            <RegionList data={regions} title="Alcance por Região" />
          </div>
          <div className="lg:col-span-8 h-[280px] sm:h-[480px]">
            <RegionMap data={regions} title="Inteligência Geográfica" />
          </div>
        </div>}

        {/* ═══ Row 4: Keywords (Google Ads) ═══ */}
        {googleData?.keywords && (
          <div className="grid grid-cols-1 gap-6">
            <KeywordsTable keywords={googleData.keywords} />
          </div>
        )}

        {/* ═══ Row 5: Painéis laterais — Google Ads + GA4 ═══ */}
        {(hasGoogle || hasGA4) && <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">

          {/* Google Ads panel */}
          {hasGoogle && <div className="lg:col-span-6 glass-panel rounded-2xl p-4 sm:p-6 flex flex-col border border-cyan-500/10">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-3 h-3 rounded-full bg-cyan-400"></div>
              <h3 className="text-sm font-bold text-slate-200">Google Ads</h3>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
              {[
                { l: "Investimento", v: formatCurrency(gt?.spend ?? 0) },
                { l: "Conversões", v: formatNumber(gt?.conversions ?? 0) },
                { l: "CPC Médio", v: formatCurrency(gt?.cpc ?? 0) },
                { l: "CTR", v: `${(gt?.ctr ?? 0).toFixed(2)}%` },
                { l: "IQ Médio", v: `${(gt?.qualityScoreAvg ?? 0).toFixed(1)}/10` },
              ].filter((k): k is { l: string; v: string } => k.v !== null).map(k => (
                <div key={k.l} className="bg-slate-800/40 rounded-xl p-3">
                  <p className="text-[8px] font-bold text-slate-400 uppercase mb-0.5">{k.l}</p>
                  <p className="text-sm font-black text-white">{k.v}</p>
                </div>
              ))}
            </div>

            {/* Mini chart */}
            <div className="h-[140px] w-full">
              <PerformanceChart data={googleData?.timeSeries ?? []} metrics={["clicks", "spend"]} />
            </div>
            <div className="flex justify-center gap-4 mt-2">
              <div className="flex items-center gap-1 text-[8px] font-bold text-slate-400 uppercase">
                <span className="w-2 h-0.5 bg-cyan-500 rounded"></span> Cliques
              </div>
              <div className="flex items-center gap-1 text-[8px] font-bold text-slate-400 uppercase">
                <span className="w-2 h-0.5 bg-blue-500 rounded"></span> Investimento
              </div>
            </div>
          </div>}

          {/* GA4 panel */}
          {hasGA4 && <div className="lg:col-span-6 glass-panel rounded-2xl p-4 sm:p-6 flex flex-col border border-orange-500/10">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-3 h-3 rounded-full bg-orange-400"></div>
              <h3 className="text-sm font-bold text-slate-200">Google Analytics 4</h3>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
              {[
                { l: "Sessões", v: formatNumber(g4t?.sessions ?? 0) },
                { l: "Usuários", v: formatNumber(g4t?.users ?? 0) },
                { l: "Engajamento", v: `${g4t?.engagementRate ?? 0}%`, c: "text-emerald-400" },
                { l: "Novos Usuários", v: formatNumber(g4t?.newUsers ?? 0) },
                { l: "Eventos/Sessão", v: String(g4t?.eventsPerSession ?? 0) },
                { l: "Conversões", v: formatNumber(g4t?.conversions ?? 0) },
              ].map(k => (
                <div key={k.l} className="bg-slate-800/40 rounded-xl p-3">
                  <p className="text-[8px] font-bold text-slate-400 uppercase mb-0.5">{k.l}</p>
                  <p className={`text-base font-black ${k.c ?? "text-white"}`}>{k.v}</p>
                </div>
              ))}
            </div>

            <div className="flex-1 flex items-center justify-center text-[10px] text-slate-600 font-bold uppercase tracking-widest text-center">
              Integração GA4 em breve
            </div>
          </div>}

        </div>}

      </div>
    );
  };

  // ─── Main render ──────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-slate-950 pb-16 md:pb-0 overflow-hidden">
      {/* Sidebar */}
      <ClientSidebar
        platforms={platforms}
        view={view}
        onViewChange={(v) => { setView(v); setSelectedCampaign(null); setLoading(true); }}
        onLogout={showLogout ? () => signOut({ callbackUrl: "/login" }) : undefined}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">

        {/* Header */}
        <header className="px-3 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/50 bg-slate-900/40 backdrop-blur-md flex-shrink-0 z-30 relative">
          <div className="flex items-center gap-3 min-w-0">
            {logo && (
              <img
                src={logo}
                alt={workspaceName}
                className="w-10 h-10 rounded-xl object-cover border border-slate-700 shadow-lg shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <div className="min-w-0">
              <h1 className="text-base font-bold tracking-tight text-slate-100 leading-none truncate">{workspaceName}</h1>
              <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-widest">Dashboard de Performance</p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleDownload}
              className="p-2 rounded-lg border bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300 transition-all active:scale-95"
              title="Exportar CSV"
            >
              <Download size={15} />
            </button>

            {/* Campaign selector — visible only on meta/detalhes views */}
            {(view === "meta" || view === "detalhes") && metaData?.campaigns && metaData.campaigns.length > 0 && (
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setCampaignOpen(!campaignOpen); setDaysOpen(false); }}
                  className={cn(
                    "flex items-center gap-2 px-2 sm:px-3 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap active:scale-95 sm:max-w-[180px]",
                    campaignOpen
                      ? "bg-slate-700 border-slate-600 text-white"
                      : selectedCampaign
                        ? "bg-blue-600/20 border-blue-500/40 text-blue-300 hover:bg-blue-600/30"
                        : "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700"
                  )}
                >
                  <Layers size={13} className="opacity-60 shrink-0" />
                  <span className="hidden sm:inline truncate">{selectedCampaign ? selectedCampaign.name : "Campanhas"}</span>
                  <ChevronDown size={13} className={cn("hidden sm:block opacity-30 shrink-0 transition-transform", campaignOpen ? "rotate-180" : "")} />
                </button>
                {campaignOpen && (
                  <div className="absolute right-0 mt-3 w-64 bg-slate-950 border border-slate-700/60 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] py-2 z-[100]">
                    <button
                      onClick={() => { setSelectedCampaign(null); setCampaignOpen(false); }}
                      className={cn(
                        "w-full text-left px-4 py-2 text-xs font-medium transition-colors flex items-center justify-between",
                        !selectedCampaign ? "bg-blue-600/20 text-blue-400" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                      )}
                    >
                      Todas as campanhas
                      {!selectedCampaign && <Check size={12} />}
                    </button>
                    <div className="my-1 border-t border-slate-800" />
                    {metaData.campaigns.map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setSelectedCampaign({ id: c.id, name: c.name }); setCampaignOpen(false); }}
                        className={cn(
                          "w-full text-left px-4 py-2 text-xs font-medium transition-colors flex items-center justify-between gap-2",
                          selectedCampaign?.id === c.id ? "bg-blue-600/20 text-blue-400" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                        )}
                      >
                        <span className="truncate">{c.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full border uppercase",
                            c.status === "ACTIVE"
                              ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                              : "text-slate-500 bg-slate-800 border-slate-700"
                          )}>{c.status === "ACTIVE" ? "Ativa" : "Inativa"}</span>
                          {selectedCampaign?.id === c.id && <Check size={12} />}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Period selector */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setDaysOpen(!daysOpen); setCampaignOpen(false); }}
                className={cn(
                  "flex items-center gap-2 px-2 sm:px-3 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap active:scale-95",
                  daysOpen
                    ? "bg-slate-700 border-slate-600 text-white"
                    : "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700"
                )}
              >
                <Calendar size={13} className="opacity-60 shrink-0" />
                <span className="hidden sm:inline">{currentPeriodLabel}</span>
                <ChevronDown size={13} className={cn("hidden sm:block opacity-30 transition-transform", daysOpen ? "rotate-180" : "")} />
              </button>
              {daysOpen && (
                <div className="absolute right-0 mt-3 w-48 bg-slate-950 border border-slate-700/60 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] py-2 z-[100]">
                  {PERIOD_OPTIONS.map(opt => (
                    <button
                      key={opt.days}
                      onClick={() => { setDays(opt.days); setDaysOpen(false); }}
                      className={cn(
                        "w-full text-left px-4 py-2 text-xs font-medium transition-colors flex items-center justify-between",
                        days === opt.days ? "bg-blue-600/20 text-blue-400" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                      )}
                    >
                      {opt.label}
                      {days === opt.days && <Check size={12} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                <p className="text-slate-400 text-sm font-medium animate-pulse">Carregando métricas...</p>
              </div>
            </div>
          ) : (
            <>
              {view === "meta" && renderMeta()}
              {view === "google" && renderGoogle()}
              {view === "ga4" && renderGA4()}
              {view === "overview" && renderOverview()}
              {view === "detalhes" && renderDetalhes()}
            </>
          )}
        </div>

      </div>
    </div>
  );
}
