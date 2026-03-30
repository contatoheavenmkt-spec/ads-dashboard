"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PerformanceChart } from "@/components/charts/performance-chart";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Pie } from "react-chartjs-2";
import { Loader2, TrendingUp } from "lucide-react";
import Link from "next/link";
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

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Title, Filler);


interface MetaTotals {
  spend: number; impressions: number; clicks: number; conversions: number; revenue: number;
  cpc: number; cpa: number; roas: number; ctr: number;
}
interface GoogleTotals {
  spend: number; impressions: number; clicks: number; conversions: number; revenue: number;
  cpc: number; cpa: number; roas: number; ctr: number; qualityScoreAvg: number;
}
interface GA4Totals {
  sessions: number; users: number; newUsers: number; pageviews: number;
  engagedSessions: number; events: number; conversions: number;
  engagementRate: number; eventsPerSession: number;
}

interface TimeSeries {
  date: string; spend: number; revenue: number; impressions: number; clicks: number; conversions: number;
}

export default function DashboardOverviewPage() {
  const [days, setDays] = useState(30);
  const [metaData, setMetaData] = useState<{ totals: MetaTotals; timeSeries: TimeSeries[] } | null>(null);
  const [googleData, setGoogleData] = useState<{ totals: GoogleTotals; timeSeries: TimeSeries[] } | null>(null);
  const [ga4Data, setGa4Data] = useState<{ totals: GA4Totals; timeSeries: { date: string; sessions: number; conversions: number }[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/metrics?days=${days}`).then(r => r.json()).catch(() => null),
      fetch(`/api/google/metrics?days=${days}`).then(r => r.json()).catch(() => null),
      fetch(`/api/ga4/metrics?days=${days}`).then(r => r.json()).catch(() => null),
    ]).then(([meta, google, ga4]) => {
      setMetaData(meta);
      setGoogleData(google);
      setGa4Data(ga4);
    }).finally(() => setLoading(false));
  }, [days]);

  const mt = metaData?.totals;
  const gt = googleData?.totals;
  const g4t = ga4Data?.totals;

  // Totais consolidados
  const totalSpend = (mt?.spend ?? 0) + (gt?.spend ?? 0);
  const totalRevenue = (mt?.revenue ?? 0) + (gt?.revenue ?? 0);
  const totalConversions = (mt?.conversions ?? 0) + (gt?.conversions ?? 0) + (g4t?.conversions ?? 0);
  const consolidatedRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const consolidatedCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

  // Merge timeSeries: soma Meta + Google por data
  const mergedSeries = (() => {
    const map = new Map<string, TimeSeries>();
    for (const d of metaData?.timeSeries ?? []) {
      map.set(d.date, { ...d });
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
        map.set(d.date, { ...d });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  })();

  // Share de plataforma por investimento
  const metaShare = totalSpend > 0 ? Math.round(((mt?.spend ?? 0) / totalSpend) * 100) : 0;
  const googleShare = totalSpend > 0 ? Math.round(((gt?.spend ?? 0) / totalSpend) * 100) : 0;
  const ga4Share = 100 - metaShare - googleShare;

  if (loading && !metaData && !googleData) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          <p className="text-slate-400 text-sm font-medium animate-pulse">Carregando visão consolidada...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header
        title="Visão Geral"
        subtitle="Consolidado Multi-Plataforma | Meta + Google + GA4"
        days={days}
        onDaysChange={setDays}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">

        {/* KPIs Consolidados */}
        <div className={`grid gap-4 ${totalRevenue > 0 ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-6" : "grid-cols-2 md:grid-cols-2 lg:grid-cols-4"}`}>
          <KpiCard title="Investimento Total" value={formatCurrency(totalSpend)} change={5.8} sparklineColor="#3b82f6" sparklineData={mergedSeries.map(d => d.spend)} />
          {totalRevenue > 0 && (
            <KpiCard title="Faturamento Total" value={formatCurrency(totalRevenue)} change={11.2} sparklineColor="#10b981" sparklineData={mergedSeries.map(d => d.revenue)} />
          )}
          <KpiCard title="Conversões Totais" value={formatNumber(totalConversions)} change={9.4} sparklineColor="#f59e0b" sparklineData={mergedSeries.map(d => d.conversions)} />
          {totalRevenue > 0 && (
            <KpiCard title="ROAS Consolidado" value={`${consolidatedRoas.toFixed(2)}x`} change={3.1} sparklineColor="#a855f7" sparklineData={mergedSeries.map(d => d.spend > 0 ? d.revenue / d.spend : 0)} />
          )}
          <KpiCard title="Sessões GA4" value={formatNumber(g4t?.sessions ?? 0)} change={7.6} sparklineColor="#f97316" sparklineData={(ga4Data?.timeSeries ?? []).map(d => d.sessions)} />
          <KpiCard title="CPA Consolidado" value={formatCurrency(consolidatedCpa)} change={-3.2} sparklineColor="#60a5fa" sparklineData={mergedSeries.map(d => d.conversions > 0 ? d.spend / d.conversions : 0)} />
        </div>

        {/* Performance + Share */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Combined Performance Chart */}
          <div className="lg:col-span-7 glass-panel rounded-2xl p-6 flex flex-col">
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
            <div className="flex-1 min-h-[260px]">
              <PerformanceChart data={mergedSeries} metrics={["spend", "revenue"]} />
            </div>
          </div>

          {/* Share de Plataforma */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="glass-panel rounded-2xl p-6 flex flex-col items-center flex-1">
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

        {/* Cards de plataforma com links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Meta */}
          <Link href="/dashboard/meta" className="glass-panel rounded-2xl p-6 flex flex-col gap-4 hover:border-blue-500/50 border border-transparent transition-all group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center">
                  <div className="w-4 h-4 rounded-full bg-blue-500"></div>
                </div>
                <span className="text-sm font-bold text-slate-200 group-hover:text-white">Meta Ads</span>
              </div>
              <TrendingUp size={14} className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className={`grid gap-3 ${mt && mt.revenue > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Investimento</p>
                <p className="text-base font-black text-white">{formatCurrency(mt?.spend ?? 0)}</p>
              </div>
              {mt && mt.revenue > 0 && (
                <div>
                  <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">ROAS</p>
                  <p className="text-base font-black text-emerald-400">{(mt?.roas ?? 0).toFixed(2)}x</p>
                </div>
              )}
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Conversões</p>
                <p className="text-base font-black text-white">{formatNumber(mt?.conversions ?? 0)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">CTR</p>
                <p className="text-base font-black text-white">{(mt?.ctr ?? 0).toFixed(2)}%</p>
              </div>
            </div>
            <div className="text-[9px] font-bold text-blue-400 uppercase tracking-wider group-hover:text-blue-300">Ver detalhes →</div>
          </Link>

          {/* Google */}
          <Link href="/dashboard/google" className="glass-panel rounded-2xl p-6 flex flex-col gap-4 hover:border-cyan-500/50 border border-transparent transition-all group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-600/20 flex items-center justify-center">
                  <div className="w-4 h-4 rounded-full bg-cyan-500"></div>
                </div>
                <span className="text-sm font-bold text-slate-200 group-hover:text-white">Google Ads</span>
              </div>
              <TrendingUp size={14} className="text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className={`grid gap-3 ${gt && gt.revenue > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Investimento</p>
                <p className="text-base font-black text-white">{formatCurrency(gt?.spend ?? 0)}</p>
              </div>
              {gt && gt.revenue > 0 && (
                <div>
                  <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">ROAS</p>
                  <p className="text-base font-black text-emerald-400">{(gt?.roas ?? 0).toFixed(2)}x</p>
                </div>
              )}
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Conversões</p>
                <p className="text-base font-black text-white">{formatNumber(gt?.conversions ?? 0)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">IQ Médio</p>
                <p className="text-base font-black text-white">{(gt?.qualityScoreAvg ?? 0).toFixed(1)}/10</p>
              </div>
            </div>
            <div className="text-[9px] font-bold text-cyan-400 uppercase tracking-wider group-hover:text-cyan-300">Ver detalhes →</div>
          </Link>

          {/* GA4 */}
          <Link href="/dashboard/ga4" className="glass-panel rounded-2xl p-6 flex flex-col gap-4 hover:border-orange-500/50 border border-transparent transition-all group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-orange-600/20 flex items-center justify-center">
                  <div className="w-4 h-4 rounded-full bg-orange-500"></div>
                </div>
                <span className="text-sm font-bold text-slate-200 group-hover:text-white">Google Analytics 4</span>
              </div>
              <TrendingUp size={14} className="text-orange-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Sessões</p>
                <p className="text-base font-black text-white">{formatNumber(g4t?.sessions ?? 0)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Engajamento</p>
                <p className="text-base font-black text-emerald-400">{g4t?.engagementRate ?? 0}%</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Usuários</p>
                <p className="text-base font-black text-white">{formatNumber(g4t?.users ?? 0)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Eventos/Sessão</p>
                <p className="text-base font-black text-white">{g4t?.eventsPerSession ?? 0}</p>
              </div>
            </div>
            <div className="text-[9px] font-bold text-orange-400 uppercase tracking-wider group-hover:text-orange-300">Ver detalhes →</div>
          </Link>

        </div>

      </div>
    </div>
  );
}
