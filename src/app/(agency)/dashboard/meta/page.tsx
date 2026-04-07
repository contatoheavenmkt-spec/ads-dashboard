"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PerformanceChart } from "@/components/charts/performance-chart";
import { FunnelChart } from "@/components/charts/funnel-chart";
import { TopCampaignsDonut } from "@/components/charts/top-campaigns-donut";
import { CampaignsTable } from "@/components/dashboard/campaigns-table";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Loader2, LayoutDashboard, Zap } from "lucide-react";
import Link from "next/link";


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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/connections/status")
      .then(r => r.json())
      .then(status => setIsConnected(status?.meta === true))
      .catch(() => setIsConnected(false));
  }, []);

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

    safeFetch(`/api/metrics?${params}`).then((metrics) => {
      if (metrics) setData(metrics);
    }).finally(() => { setLoading(false); setIsRefreshing(false); });
  }, [days, selectedAccount, selectedCampaign, refreshKey]);

  const t = data?.totals;

  if (loading && !data && isConnected !== false) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          <p className="text-slate-400 text-sm font-medium animate-pulse">Carregando métricas em tempo real...</p>
        </div>
      </div>
    );
  }

  if (isConnected === false) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <Header title="Meta Ads" subtitle="Relatório Meta Ads" days={days} onDaysChange={setDays} />
        <div className="flex-1 flex items-start justify-center pt-12">
          <div className="flex flex-col items-center gap-6 text-center max-w-md px-6">
            <img src="/Logo Full.png" alt="Dashfy" className="h-96 object-contain opacity-80" />
            <div className="space-y-2 -mt-32">
              <h2 className="text-xl font-black text-white">Comece do Zero</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                Sua dashboard está vazia. Conecte suas contas de anúncios para começar a visualizar métricas.
              </p>
            </div>
            <div className="flex flex-col gap-3 w-full max-w-xs">
              <Link
                href="/integracoes"
                className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm px-6 py-3.5 rounded-2xl transition-all active:scale-95 shadow-xl shadow-blue-500/20"
              >
                <Zap size={16} />
                Conectar Contas
              </Link>
              <Link
                href="/integracoes/onboarding"
                className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm px-6 py-3.5 rounded-2xl transition-all border border-slate-700"
              >
                Ver Tutorial
              </Link>
            </div>
          </div>
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-6">

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

          return (
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(200px, 1fr))` }}
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
          <div className="glass-panel rounded-xl p-5 lg:col-span-3 flex flex-col relative min-w-0">
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
          <div className="glass-panel rounded-xl p-5 lg:col-span-6 flex flex-col min-w-0">
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
          <div className="glass-panel rounded-xl p-5 lg:col-span-3 flex flex-col min-w-0">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 text-center">Top Campanhas</h2>
            <TopCampaignsDonut
              campaigns={data?.campaigns ?? []}
              conversionLabel={t && t.purchases > 0 ? "VENDAS" : t && t.messages > 0 ? "CONVERSAS" : "CONVERSÕES"}
            />
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

