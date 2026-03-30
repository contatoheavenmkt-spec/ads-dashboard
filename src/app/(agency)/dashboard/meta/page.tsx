"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PerformanceChart } from "@/components/charts/performance-chart";
import { FunnelChart } from "@/components/charts/funnel-chart";
import { TopCampaignsDonut } from "@/components/charts/top-campaigns-donut";
import { CampaignsTable } from "@/components/dashboard/campaigns-table";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Loader2, LayoutDashboard } from "lucide-react";

interface MetricsData {
  timeSeries: { date: string; spend: number; impressions: number; clicks: number; purchases: number; leads: number; messages: number; conversions: number; revenue: number }[];
  totals: {
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


export default function DashboardPage() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Integration | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null);

  useEffect(() => {
    fetch("/api/integrations")
      .then((r) => r.json())
      .then((ints: Integration[]) => {
        setIntegrations(ints.filter(i => i.platform === "meta"));
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ days: String(days) });
    if (selectedAccount) params.set("adAccountId", selectedAccount.adAccountId);
    if (selectedCampaign) params.set("campaignId", selectedCampaign.id);

    fetch(`/api/metrics?${params}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [days, selectedAccount, selectedCampaign]);

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
      <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">

        {/* Top KPIs */}
        <div className={`grid gap-4 ${t && t.revenue > 0 ? "grid-cols-1 md:grid-cols-3 lg:grid-cols-5" : "grid-cols-1 md:grid-cols-3 lg:grid-cols-3"}`}>
          <KpiCard 
            title="Investimento" 
            value={formatCurrency(t?.spend ?? 0)} 
            change={5.2} 
            sparklineColor="#3b82f6" 
            sparklineData={data?.timeSeries.map(d => d.spend) ?? []}
          />
          {t && t.revenue > 0 && (
            <KpiCard 
              title="Faturamento" 
              value={formatCurrency(t?.revenue ?? 0)} 
              change={12.4} 
              sparklineColor="#10b981" 
              sparklineData={data?.timeSeries.map(d => d.revenue) ?? []}
            />
          )}
          <KpiCard 
            title={t && t.purchases > 0 ? "Vendas" : t && t.messages > 0 ? "Conversas" : t && t.leads > 0 ? "Leads" : "Conversões"}
            value={formatNumber(t?.conversions ?? 0)} 
            change={8.1} 
            sparklineColor="#f59e0b"
            sparklineData={data?.timeSeries.map(d => d.conversions) ?? []}
          />
          {t && t.revenue > 0 && (
            <KpiCard 
              title="ROAS Médio" 
              value={`${(t?.roas ?? 0).toFixed(2)}x`} 
              change={2.3} 
              sparklineColor="#a855f7" 
              sparklineData={data?.timeSeries.map(d => d.spend > 0 ? (d.revenue ?? 0) / d.spend : 0) ?? []}
            />
          )}
          <KpiCard 
            title={t && t.purchases > 0 ? "CPA Médio" : "Custo p/ Conversa"}
            value={formatCurrency(t?.cpa ?? 0)} 
            change={-4.1} 
            sparklineColor="#60a5fa" 
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

