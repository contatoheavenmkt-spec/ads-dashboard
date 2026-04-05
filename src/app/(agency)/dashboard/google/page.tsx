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
import { KeywordsTable } from "@/components/dashboard/keywords-table";
import { Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);


interface GoogleMetrics {
  timeSeries: { date: string; spend: number; impressions: number; clicks: number; conversions: number; revenue: number }[];
  totals: {
    spend: number; impressions: number; clicks: number; conversions: number; revenue: number;
    cpc: number; cpa: number; roas: number; ctr: number;
    searchImpressionShare: number; qualityScoreAvg: number;
  };
  campaigns: { id: string; name: string; accountId: string; objective: string; status: string; spend: number; impressions: number; clicks: number; conversions: number; cpc: number; cpa: number; roas: number; ctr: number }[];
  keywords: { kw: string; matchType: string; ctr: string; clicks: number; conversions: number }[];
  demographics: {
    gender: { label: string; impressions: number; clicks: number }[];
    age: { label: string; impressions: number; clicks: number }[];
  };
}

export default function GoogleAdsPage() {
  const [data, setData] = useState<GoogleMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<any | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((ints: any[]) => {
        setIntegrations(ints.filter(i => i.platform === "google"));
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    const force = refreshKey > 0;
    const params = new URLSearchParams({ days: String(days) });
    if (selectedAccount) params.set("adAccountId", selectedAccount.adAccountId);
    if (selectedCampaign) params.set("campaignId", selectedCampaign.id);
    if (force) params.set("force", "1");

    fetch(`/api/google/metrics?${params}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => { setLoading(false); setIsRefreshing(false); });
  }, [days, selectedAccount, selectedCampaign, refreshKey]);

  const t = data?.totals;

  if (loading && !data) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-cyan-500 animate-spin" />
          <p className="text-slate-400 text-sm font-medium animate-pulse">Carregando métricas Google Ads...</p>
        </div>
      </div>
    );
  }

  // Se a conta não está conectada, exibir estado "em breve"
  const isConnected = integrations.length > 0;
  if (!isConnected && !loading) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <Header title="Google Ads" subtitle="Relatório Google Ads" days={days} onDaysChange={setDays} accounts={integrations} selectedAccount={selectedAccount} onAccountChange={setSelectedAccount} />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-center max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <LayoutDashboard size={28} className="text-cyan-500/60" />
            </div>
            <div>
              <p className="text-slate-200 font-bold text-sm">Integração Google Ads</p>
              <p className="text-slate-500 text-xs mt-1">A conexão com Google Ads estará disponível em breve. Os dados aparecerão aqui assim que a integração for ativada.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header
        title="Google Ads"
        subtitle={`Relatório Google Ads | ${selectedAccount ? selectedAccount.name : "Conta Principal"}`}
        days={days}
        onDaysChange={setDays}
        accounts={integrations}
        selectedAccount={selectedAccount}
        onAccountChange={setSelectedAccount}
        campaigns={data?.campaigns || []}
        selectedCampaign={selectedCampaign}
        onCampaignChange={setSelectedCampaign}
        onRefresh={() => { setIsRefreshing(true); setRefreshKey(k => k + 1); }}
        isRefreshing={isRefreshing}
        onDownload={() => {
          const headers = ["Data", "Investimento", "Impressões", "Cliques", "Conversões"];
          const rows = data?.timeSeries.map(d => [
            d.date,
            d.spend.toFixed(2),
            d.impressions,
            d.clicks,
            d.conversions
          ]) || [];
          const csv = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
          const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `relatorio_google_ads.csv`;
          a.click();
        }}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* KPIs */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <KpiCard
            title="Investimento"
            value={formatCurrency(t?.spend ?? 0)}
            sparklineColor="#22d3ee"
            sparklineData={data?.timeSeries.map(d => d.spend) ?? []}
          />
          <KpiCard
            title="Conversões"
            value={formatNumber(t?.conversions ?? 0)}
            sparklineColor="#06b6d4"
            sparklineData={data?.timeSeries.map(d => d.conversions) ?? []}
          />
          <KpiCard
            title="CPC Médio"
            value={formatCurrency(t?.cpc ?? 0)}
            sparklineColor="#60a5fa"
            sparklineData={data?.timeSeries.map(d => d.clicks > 0 ? d.spend / d.clicks : 0) ?? []}
          />
          <KpiCard
            title="Custo por Conv."
            value={formatCurrency(t?.cpa ?? 0)}
            sparklineColor="#a855f7"
            sparklineData={data?.timeSeries.map(d => d.conversions > 0 ? d.spend / d.conversions : 0) ?? []}
          />
        </div>

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
              conversionLabel: t && t.revenue > 0 ? "Vendas" : "Conversões",
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
                metrics={["spend", "clicks"]}
              />
            </div>
            <div className="flex justify-center gap-6 mt-4">
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase">
                <span className="w-3 h-1 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.4)]"></span> Cliques
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase">
                <span className="w-3 h-1 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.4)]"></span> Investimento
              </div>
            </div>
          </div>

          {/* Top Campaigns Donut */}
          <div className="glass-panel rounded-xl p-5 lg:col-span-3 flex flex-col">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 text-center">Top Campanhas</h2>
            <TopCampaignsDonut
              campaigns={data?.campaigns ?? []}
              conversionLabel="Conversões"
            />
          </div>
        </div>

        {/* Enriched Data Row: Keywords & Demographics */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Keywords Table */}
          <div className="lg:col-span-7">
            <KeywordsTable keywords={data?.keywords ?? []} />
          </div>

          {/* Demographics */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            {(data?.demographics.gender.length ?? 0) > 0 && (
              <div className="glass-panel rounded-2xl p-6 flex flex-col">
                <div className="flex items-center gap-2 mb-6">
                  <Users size={16} className="text-cyan-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Demografia: Gênero</h3>
                </div>
                <div className="grid grid-cols-2 gap-6 items-center">
                  <div className="aspect-square relative max-w-[140px] mx-auto">
                    <Pie
                      data={{
                        labels: data!.demographics.gender.map(g => g.label),
                        datasets: [{
                          data: data!.demographics.gender.map(g => g.impressions),
                          backgroundColor: ['#22d3ee', '#2563eb', '#1e40af'],
                          borderWidth: 0,
                        }]
                      }}
                      options={{ cutout: '70%', plugins: { legend: { display: false } } }}
                    />
                  </div>
                  <div className="space-y-3">
                    {(() => {
                      const total = data!.demographics.gender.reduce((a, b) => a + b.impressions, 0);
                      return data!.demographics.gender.map((g, i) => (
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

            {(data?.demographics.age.length ?? 0) > 0 && (
              <div className="glass-panel rounded-2xl p-6 flex flex-col">
                <div className="flex items-center gap-2 mb-6">
                  <PieChartIcon size={16} className="text-cyan-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Demografia: Idade</h3>
                </div>
                <div className="space-y-3">
                  {(() => {
                    const total = data!.demographics.age.reduce((acc, curr) => acc + curr.impressions, 0);
                    return data!.demographics.age.map((a, i) => {
                      const percent = total > 0 ? Math.round((a.impressions / total) * 100) : 0;
                      return (
                        <div key={i} className="space-y-1">
                          <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase">
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
              {data?.campaigns?.filter(c => c.status === "ACTIVE").length ?? 0} ATIVAS AGORA
            </span>
          </div>
          <CampaignsTable campaigns={data?.campaigns ?? []} showExport />
        </div>

      </div>
    </div>
  );
}
