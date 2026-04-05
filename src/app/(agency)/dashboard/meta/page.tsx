"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PerformanceChart } from "@/components/charts/performance-chart";
import { FunnelChart } from "@/components/charts/funnel-chart";
import { TopCampaignsDonut } from "@/components/charts/top-campaigns-donut";
import { CampaignsTable } from "@/components/dashboard/campaigns-table";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Loader2, LayoutDashboard, Users, PieChart as PieChartIcon } from "lucide-react";
import { Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);

interface MetricsData {
  timeSeries: { date: string; spend: number; impressions: number; reach: number; clicks: number; purchases: number; leads: number; messages: number; conversions: number; revenue: number }[];
  totals: {
    spend: number;
    impressions: number;
    reach: number;
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
  };
  campaigns: { id: string; name: string; accountId: string; objective: string; status: string; spend: number; impressions: number; clicks: number; purchases: number; leads: number; messages: number; conversions: number; cpc: number; cpa: number; roas: number; ctr: number }[];
}

interface Integration {
  id: string;
  adAccountId: string;
  name: string;
  bmId: string | null;
  bmName: string | null;
  platform: string;
}

interface AdCreative {
  id: string; name: string; thumbnail: string | null;
  impressions: number; clicks: number; purchases: number;
  leads: number; messages: number; conversions: number;
  spend: number; status: string; isMessaging: boolean;
}

interface DemographicBreakdown { label: string; impressions: number; clicks: number }

export default function DashboardPage() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Integration | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null);
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [demographics, setDemographics] = useState<{ gender: DemographicBreakdown[]; age: DemographicBreakdown[] }>({ gender: [], age: [] });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => {
        if (!r.ok) return null;
        return r.text().then((text) => {
          if (!text) return null;
          try { return JSON.parse(text); } catch { return null; }
        });
      })
      .then((allAccounts: any[] | null) => {
        if (allAccounts) {
          const metaAccounts = allAccounts.filter(a => a.platform === "meta");
          setIntegrations(metaAccounts);
        }
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    const force = refreshKey > 0;
    const params = new URLSearchParams({ days: String(days) });
    if (selectedAccount) params.set("adAccountId", selectedAccount.adAccountId);
    if (selectedCampaign) params.set("campaignId", selectedCampaign.id);
    if (force) params.set("force", "1");

    const safeFetch = (url: string) =>
      fetch(url).then(r => r.ok ? r.json() : null).catch(() => null);

    Promise.all([
      safeFetch(`/api/metrics?${params}`),
      safeFetch(`/api/meta/creatives?${params}`),
      safeFetch(`/api/meta/demographics?${params}`),
    ]).then(([metrics, creativesRes, demoRes]) => {
      if (metrics) setData(metrics);
      setCreatives(creativesRes?.ads ?? []);
      if (demoRes) setDemographics(demoRes);
    }).finally(() => { setLoading(false); setIsRefreshing(false); });
  }, [days, selectedAccount, selectedCampaign, refreshKey]);

  const t = data?.totals;

  if (loading && !data) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          <p className="text-slate-400 text-sm font-medium animate-pulse">Carregando métricas em tempo real...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header
        title="Meta Ads"
        subtitle={`Relatório Meta Ads | ${selectedAccount ? selectedAccount.name : "Todas as Contas"}`}
        days={days}
        onDaysChange={setDays}
        accounts={integrations as any}
        selectedAccount={selectedAccount as any}
        onAccountChange={(acc) => {
          setSelectedAccount(acc as any);
          setSelectedCampaign(null);
        }}
        campaigns={data?.campaigns || []}
        selectedCampaign={selectedCampaign}
        onCampaignChange={setSelectedCampaign}
        onRefresh={() => { setIsRefreshing(true); setRefreshKey(k => k + 1); }}
        isRefreshing={isRefreshing}
        onDownload={() => {
          const headers = ["Data", "Investimento", "Impressões", "Cliques", "Conversões", "Vendas", "Conversas"];
          const rows = data?.timeSeries.map(d => [
            d.date,
            d.spend.toFixed(2),
            d.impressions,
            d.clicks,
            d.conversions,
            d.purchases,
            d.messages + d.leads
          ]) || [];
          const csv = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
          const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `relatorio_meta_${selectedAccount?.name || "geral"}.csv`;
          a.click();
        }}
      />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Top KPIs */}
        {(() => {
          const hasMessages = t && t.messages > 0;
          const hasPurchases = t && t.purchases > 0;
          const hasRevenue = t && t.revenue > 0;

          const kpis = [
            {
              title: "Investimento",
              value: formatCurrency(t?.spend ?? 0),
              color: "#3b82f6",
              data: data?.timeSeries.map(d => d.spend) ?? [],
            },
            {
              title: "Impressões",
              value: formatNumber(t?.impressions ?? 0),
              color: "#f59e0b",
              data: data?.timeSeries.map(d => d.impressions) ?? [],
            },
            {
              title: "Alcance",
              value: formatNumber(t?.reach ?? 0),
              color: "#a855f7",
              data: data?.timeSeries.map(d => d.reach) ?? [],
            },
            {
              title: "Cliques",
              value: formatNumber(t?.clicks ?? 0),
              color: "#06b6d4",
              data: data?.timeSeries.map(d => d.clicks) ?? [],
            },
            ...(hasMessages ? [{
              title: "Mensagens Iniciadas",
              value: formatNumber(t?.messages ?? 0),
              color: "#10b981",
              data: data?.timeSeries.map(d => d.messages) ?? [],
            }] : []),
            ...(hasPurchases ? [{
              title: "Vendas",
              value: formatNumber(t?.purchases ?? 0),
              color: "#f97316",
              data: data?.timeSeries.map(d => d.purchases) ?? [],
            }] : []),
            ...(hasRevenue ? [{
              title: "Faturamento",
              value: formatCurrency(t?.revenue ?? 0),
              color: "#22c55e",
              data: data?.timeSeries.map(d => d.revenue) ?? [],
            }] : []),
          ];

          const cols = kpis.length;

          return (
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(160px, 1fr))` }}
            >
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
          );
        })()}

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[400px]">
          {/* Funnel */}
          <div className="glass-panel rounded-xl p-5 lg:col-span-3 flex flex-col relative">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 text-center">Funil de Conversão</h2>
            <FunnelChart data={{
              impressions: t?.impressions ?? 0,
              clicks: t?.clicks ?? 0,
              conversions: t?.conversions ?? 0,
              revenue: t?.revenue ?? 0,
              conversionLabel: t && t.purchases > 0 ? "Vendas" : t && t.messages > 0 ? "Conversas" : t && t.leads > 0 ? "Leads" : "Conversões"
            }} />
          </div>

          {/* Line Chart */}
          <div className="glass-panel rounded-xl p-5 lg:col-span-6 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center w-full">Performance ao Longo do Tempo</h2>
            </div>
            <div className="flex-1 w-full min-h-[300px]">
              <PerformanceChart
                data={data?.timeSeries ?? []}
                metrics={["spend", "revenue"]}
              />
            </div>
            <div className="flex justify-center gap-6 mt-4">
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase">
                <span className="w-3 h-1 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"></span> Faturamento
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase">
                <span className="w-3 h-1 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]"></span> Investimento
              </div>
            </div>
          </div>

          {/* Donut */}
          <div className="glass-panel rounded-xl p-5 lg:col-span-3 flex flex-col">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 text-center">Top Campanhas</h2>
            <TopCampaignsDonut
              campaigns={data?.campaigns ?? []}
              conversionLabel={t && t.purchases > 0 ? "VENDAS" : t && t.messages > 0 ? "CONVERSAS" : "CONVERSÕES"}
            />
          </div>
        </div>

        {/* Creative Matrix — Capas dos Anúncios */}
        {creatives.length > 0 && (
          <div className="glass-panel rounded-2xl p-6 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-black text-white/80 uppercase tracking-[0.2em]">Creative Matrix</h3>
                <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20 uppercase">Meta Ads</span>
              </div>
              <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 uppercase tracking-widest">
                {creatives.filter(a => a.status === "ACTIVE").length} ATIVOS
              </span>
            </div>
            <div className="overflow-x-auto no-scrollbar pb-4">
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
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
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
            </div>
          </div>
        )}

        {/* Demographics */}
        {(demographics.gender.length > 0 || demographics.age.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {demographics.gender.length > 0 && (
              <div className="glass-panel rounded-2xl p-6 flex flex-col">
                <div className="flex items-center gap-2 mb-6">
                  <Users size={16} className="text-blue-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Demografia: Gênero</h3>
                </div>
                <div className="grid grid-cols-2 gap-6 items-center">
                  <div className="aspect-square relative max-w-[140px] mx-auto">
                    <Pie
                      data={{
                        labels: demographics.gender.map(g => g.label),
                        datasets: [{
                          data: demographics.gender.map(g => g.impressions),
                          backgroundColor: ["#2563eb", "#93c5fd", "#1e40af"],
                          borderWidth: 0,
                        }]
                      }}
                      options={{ cutout: "70%", plugins: { legend: { display: false } } }}
                    />
                  </div>
                  <div className="space-y-3">
                    {demographics.gender.map((g, i) => {
                      const total = demographics.gender.reduce((a, b) => a + b.impressions, 0);
                      return (
                        <div key={i} className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ["#2563eb", "#93c5fd", "#1e40af"][i] }}></div>
                            {g.label}
                          </div>
                          <span className="text-white">{total > 0 ? Math.round((g.impressions / total) * 100) : 0}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {demographics.age.length > 0 && (
              <div className="glass-panel rounded-2xl p-6 flex flex-col">
                <div className="flex items-center gap-2 mb-6">
                  <PieChartIcon size={16} className="text-blue-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Demografia: Faixa Etária</h3>
                </div>
                <div className="space-y-3">
                  {demographics.age.map((a, i) => {
                    const total = demographics.age.reduce((acc, curr) => acc + curr.impressions, 0);
                    const percent = total > 0 ? Math.round((a.impressions / total) * 100) : 0;
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase">
                          <span>{a.label}</span>
                          <span>{percent}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${percent}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Active Campaigns Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <LayoutDashboard size={16} className="text-blue-500" />
              Campanhas em Execução
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                {data?.campaigns?.filter(c => c.status === "ACTIVE").length ?? 0} ATIVAS AGORA
              </span>
            </div>
          </div>
          <CampaignsTable
            campaigns={data?.campaigns ?? []}
            showExport
          />
        </div>

      </div>
    </div>
  );
}

