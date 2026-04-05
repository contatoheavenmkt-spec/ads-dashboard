"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PerformanceChart } from "@/components/charts/performance-chart";
import { FunnelChart } from "@/components/charts/funnel-chart";
import { TopCampaignsDonut } from "@/components/charts/top-campaigns-donut";
import { formatNumber } from "@/lib/utils";
import { Loader2, LayoutDashboard, Users, PieChart as PieChartIcon } from "lucide-react";
import { Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);


interface GA4Metrics {
  timeSeries: { date: string; sessions: number; users: number; newUsers: number; pageviews: number; engagedSessions: number; events: number; conversions: number }[];
  totals: {
    sessions: number; users: number; newUsers: number; pageviews: number;
    engagedSessions: number; events: number; conversions: number;
    engagementRate: number; eventsPerSession: number; pagesPerSession: number; newUserRate: number;
  };
  events: { event: string; count: number; sessions: number; conversion: string }[];
  regions: { name: string; value: number }[];
  channels: Record<string, { label: string; value: number; color: string }>;
  languages: { label: string; value: number; color: string }[];
  demographics: {
    gender: { label: string; impressions: number; clicks: number }[];
    age: { label: string; impressions: number; clicks: number }[];
  };
}

export default function GA4Page() {
  const [data, setData] = useState<GA4Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/ga4/metrics?days=${days}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [days]);

  const t = data?.totals;

  if (loading && !data) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
          <p className="text-slate-400 text-sm font-medium animate-pulse">Carregando métricas GA4...</p>
        </div>
      </div>
    );
  }

  // Se não há dados reais, exibir estado "em breve"
  const hasData = data && (data.timeSeries.length > 0 || (data.totals?.sessions ?? 0) > 0);
  if (!hasData) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <Header title="Google Analytics 4" subtitle="Métricas de Audiência e Comportamento" days={days} onDaysChange={setDays} />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-center max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <LayoutDashboard size={28} className="text-orange-500/60" />
            </div>
            <div>
              <p className="text-slate-200 font-bold text-sm">Integração Google Analytics 4</p>
              <p className="text-slate-500 text-xs mt-1">A conexão com GA4 estará disponível em breve. Os dados aparecerão aqui assim que a integração for ativada.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Mapeia timeSeries GA4 para o formato do PerformanceChart
  const chartSeries = (data?.timeSeries ?? []).map(d => ({
    date: d.date,
    spend: d.sessions,
    revenue: d.engagedSessions,
    impressions: d.pageviews,
    clicks: d.users,
    conversions: d.conversions,
  }));

  // Mapeia eventos como "campanhas" pro donut de top eventos
  const eventsAsCampaigns = (data?.events ?? []).map(e => ({
    id: e.event,
    name: e.event,
    conversions: e.count,
  }));

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header
        title="Google Analytics 4"
        subtitle="Métricas de Audiência e Comportamento"
        days={days}
        onDaysChange={setDays}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard
            title="Sessões"
            value={formatNumber(t?.sessions ?? 0)}
            sparklineColor="#f97316"
            sparklineData={data?.timeSeries.map(d => d.sessions) ?? []}
          />
          <KpiCard
            title="Usuários"
            value={formatNumber(t?.users ?? 0)}
            sparklineColor="#fb923c"
            sparklineData={data?.timeSeries.map(d => d.users) ?? []}
          />
          <KpiCard
            title="Novos Usuários"
            value={formatNumber(t?.newUsers ?? 0)}
            sparklineColor="#fdba74"
            sparklineData={data?.timeSeries.map(d => d.newUsers) ?? []}
          />
          <KpiCard
            title="Engajamento"
            value={`${t?.engagementRate ?? 0}%`}
            sparklineColor="#fbbf24"
            sparklineData={data?.timeSeries.map(d =>
              d.sessions > 0 ? (d.engagedSessions / d.sessions) * 100 : 0
            ) ?? []}
          />
          <KpiCard
            title="Eventos / Sessão"
            value={String(t?.eventsPerSession ?? 0)}
            sparklineColor="#fde68a"
            sparklineData={data?.timeSeries.map(d =>
              d.sessions > 0 ? d.events / d.sessions : 0
            ) ?? []}
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[400px]">
          {/* Funnel (Sessões → Engajadas → Conversões) */}
          <div className="glass-panel rounded-xl p-5 lg:col-span-3 flex flex-col relative">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 text-center">Funil de Audiência</h2>
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

          {/* Line Chart */}
          <div className="glass-panel rounded-xl p-5 lg:col-span-6 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center w-full">Audiência ao Longo do Tempo</h2>
            </div>
            <div className="flex-1 w-full min-h-[300px]">
              <PerformanceChart
                data={chartSeries}
                metrics={["spend", "clicks"]}
              />
            </div>
            <div className="flex justify-center gap-6 mt-4">
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase">
                <span className="w-3 h-1 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.4)]"></span> Sessões
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase">
                <span className="w-3 h-1 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]"></span> Usuários
              </div>
            </div>
          </div>

          {/* Top Events Donut */}
          <div className="glass-panel rounded-xl p-5 lg:col-span-3 flex flex-col">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 text-center">Top Eventos</h2>
            <TopCampaignsDonut campaigns={eventsAsCampaigns} />
          </div>
        </div>

        {/* Demographics Row */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 glass-panel rounded-2xl p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-6">
              <Users size={16} className="text-orange-500" />
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Demografia: Gênero</h3>
            </div>
            <div className="grid grid-cols-2 gap-6 items-center">
              <div className="aspect-square relative max-w-[160px] mx-auto">
                <Pie
                  data={{
                    labels: data?.demographics.gender.map(g => g.label) ?? [],
                    datasets: [{
                      data: data?.demographics.gender.map(g => g.impressions) ?? [],
                      backgroundColor: ['#f97316', '#fb923c', '#fdba74'],
                      borderWidth: 0,
                    }]
                  }}
                  options={{ cutout: '70%', plugins: { legend: { display: false } } }}
                />
              </div>
              <div className="space-y-4">
                {data?.demographics.gender.map((g, i) => (
                  <div key={i} className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ['#f97316', '#fb923c', '#fdba74'][i] }}></div>
                      {g.label}
                    </div>
                    <span className="text-white">{Math.round((g.impressions / data.demographics.gender.reduce((a,b) => a+b.impressions, 0)) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 glass-panel rounded-2xl p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-6">
              <PieChartIcon size={16} className="text-orange-500" />
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Demografia: Idade</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              {data?.demographics.age.map((a, i) => {
                const total = data.demographics.age.reduce((acc, curr) => acc + curr.impressions, 0);
                const percent = Math.round((a.impressions / total) * 100);
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase">
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
              })}
            </div>
          </div>
        </div>

        {/* Events Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <LayoutDashboard size={16} className="text-orange-500" />
              Eventos de Conversão
            </h2>
            <span className="text-[10px] font-bold text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded-full border border-orange-500/20">
              {data?.events?.length ?? 0} EVENTOS RASTREADOS
            </span>
          </div>
          <div className="glass-panel rounded-xl overflow-hidden flex flex-col border-none shadow-2xl">
            <table className="w-full text-left text-sm whitespace-nowrap">
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
                {(data?.events ?? []).map((e, idx) => {
                  const maxCount = Math.max(...(data?.events ?? []).map(ev => ev.count), 1);
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
}
