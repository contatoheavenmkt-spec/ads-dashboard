"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PerformanceChart } from "@/components/charts/performance-chart";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Pie } from "react-chartjs-2";
import { Loader2, TrendingUp, Zap } from "lucide-react";
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
  messages?: number; leads?: number; purchases?: number;
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
  const router = useRouter();
  const [days, setDays] = useState(30);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<any | null>(null);
  const [metaData, setMetaData] = useState<{ totals: MetaTotals; timeSeries: TimeSeries[] } | null>(null);
  const [googleData, setGoogleData] = useState<{ totals: GoogleTotals; timeSeries: TimeSeries[] } | null>(null);
  const [ga4Data, setGa4Data] = useState<{ totals: GA4Totals; timeSeries: { date: string; sessions: number; conversions: number }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showWelcome, setShowWelcome] = useState(false);
  const [hasConnectedAccounts, setHasConnectedAccounts] = useState(false);
  const [connectionsChecked, setConnectionsChecked] = useState(false);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then(setIntegrations)
      .catch(() => { });
  }, []);

  useEffect(() => {
    setLoading(true);

    const safeFetch = (url: string): Promise<unknown> => {
      try {
        return fetch(url)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null);
      } catch {
        return Promise.resolve(null);
      }
    };

    // Check onboarding status and connected accounts
    Promise.all([
      fetch("/api/onboarding/status").then(r => r.json()),
      fetch("/api/connections/status").then(r => r.json()),
    ]).then(([onboardingData, connectionsData]) => {
      const connectedCount = connectionsData?.connectedCount ?? 0;
      setHasConnectedAccounts(connectedCount > 0);
      setConnectionsChecked(true);

      if (connectedCount === 0) {
        setShowWelcome(true);
      } else if (!onboardingData.onboardingCompleted) {
        const dismissedBefore = localStorage.getItem("welcomeModalDismissed");
        if (!dismissedBefore) {
          setShowWelcome(true);
        }
      }
    }).catch(() => { setConnectionsChecked(true); });

    // Build API params based on selected account
    const metaAccountId = selectedAccount?.platform === "google" ? null : selectedAccount?.adAccountId ?? null;
    const googleAccountId = selectedAccount?.platform === "google" ? selectedAccount.adAccountId : null;

    const force = refreshKey > 0;
    const metaParams = new URLSearchParams({ days: String(days) });
    if (metaAccountId) metaParams.set("adAccountId", metaAccountId);
    if (force) metaParams.set("force", "1");

    const googleParams = new URLSearchParams({ days: String(days) });
    if (googleAccountId) googleParams.set("adAccountId", googleAccountId);
    if (force) googleParams.set("force", "1");

    const ga4Params = new URLSearchParams({ days: String(days) });
    if (googleAccountId) ga4Params.set("adAccountId", googleAccountId);

    Promise.all([
      safeFetch(`/api/metrics?${metaParams}`),
      safeFetch(`/api/google/metrics?${googleParams}`),
      safeFetch(`/api/ga4/metrics?${ga4Params}`),
    ]).then(([meta, google, ga4]) => {
      setMetaData(meta as typeof metaData);
      setGoogleData(google as typeof googleData);
      setGa4Data(ga4 as typeof ga4Data);
    }).catch(() => { }).finally(() => { setLoading(false); setIsRefreshing(false); });
  }, [days, selectedAccount, refreshKey]);

  // Dismiss modal and save to localStorage (only if has connected accounts)
  const dismissWelcome = () => {
    setShowWelcome(false);
    // Only save to localStorage if user has connected accounts
    // This way modal reappears if they remove all accounts
    if (hasConnectedAccounts) {
      localStorage.setItem("welcomeModalDismissed", "true");
    }
  };

  const mt = metaData?.totals;
  const gt = googleData?.totals;
  const g4t = ga4Data?.totals;

  // Quando uma conta específica está selecionada, mostra só os dados dela
  // Quando nenhuma conta está selecionada, mostra consolidado de todas
  const isGoogleSelected = selectedAccount?.platform === "google";
  const isMetaSelected = selectedAccount && !isGoogleSelected;
  const hasSpecificAccount = !!selectedAccount;

  // Totais: se conta específica selecionada, usa só ela; senão, soma tudo
  const totalSpend = hasSpecificAccount
    ? (isGoogleSelected ? (gt?.spend ?? 0) : (mt?.spend ?? 0))
    : (mt?.spend ?? 0) + (gt?.spend ?? 0);
  const totalRevenue = hasSpecificAccount
    ? (isGoogleSelected ? (gt?.revenue ?? 0) : (mt?.revenue ?? 0))
    : (mt?.revenue ?? 0) + (gt?.revenue ?? 0);
  const totalConversions = hasSpecificAccount
    ? (isGoogleSelected ? (gt?.conversions ?? 0) : (mt?.conversions ?? 0)) + (g4t?.conversions ?? 0)
    : (mt?.conversions ?? 0) + (gt?.conversions ?? 0) + (g4t?.conversions ?? 0);
  const consolidatedCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

  // TimeSeries: se conta específica, usa só ela; senão, merge Meta + Google
  const mergedSeries = (() => {
    if (isGoogleSelected) {
      // Só Google
      return googleData?.timeSeries ?? [];
    }
    if (isMetaSelected) {
      // Só Meta
      return metaData?.timeSeries ?? [];
    }
    // Nenhuma conta específica = soma Meta + Google por data
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

  // Share de plataforma: se conta específica, 100% para aquela plataforma
  const metaShare = hasSpecificAccount
    ? (isMetaSelected ? 100 : 0)
    : (totalSpend > 0 ? Math.round(((mt?.spend ?? 0) / totalSpend) * 100) : 0);
  const googleShare = hasSpecificAccount
    ? (isGoogleSelected ? 100 : 0)
    : (totalSpend > 0 ? Math.round(((gt?.spend ?? 0) / totalSpend) * 100) : 0);
  const ga4Share = 100 - metaShare - googleShare;

  // Só mostra "conectar contas" se de fato não há contas — não quando período está vazio
  if (connectionsChecked && !hasConnectedAccounts) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <Header
          title="Visão Geral"
          subtitle="Consolidado Multi-Plataforma | Meta + Google + GA4"
          days={days}
          onDaysChange={setDays}
        />
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
        subtitle={`Consolidado Multi-Plataforma | ${selectedAccount ? selectedAccount.name : "Meta + Google + GA4"}`}
        days={days}
        onDaysChange={setDays}
        accounts={integrations}
        selectedAccount={selectedAccount}
        onAccountChange={setSelectedAccount}
        onRefresh={() => { setIsRefreshing(true); setRefreshKey(k => k + 1); }}
        isRefreshing={isRefreshing}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* KPIs Consolidados */}
        <div className={`grid gap-4 ${totalRevenue > 0 ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-5" : "grid-cols-2 md:grid-cols-2 lg:grid-cols-4"}`}>
          <KpiCard title="Investimento Total" value={formatCurrency(totalSpend)} sparklineColor="#3b82f6" sparklineData={mergedSeries.map(d => d.spend)} />
          {totalRevenue > 0 && (
            <KpiCard title="Faturamento Total" value={formatCurrency(totalRevenue)} sparklineColor="#10b981" sparklineData={mergedSeries.map(d => d.revenue)} />
          )}
          <KpiCard title="Conversões Totais" value={formatNumber(totalConversions)} sparklineColor="#f59e0b" sparklineData={mergedSeries.map(d => d.conversions)} />
          <KpiCard title="CPA Consolidado" value={formatCurrency(consolidatedCpa)} sparklineColor="#60a5fa" sparklineData={mergedSeries.map(d => d.conversions > 0 ? d.spend / d.conversions : 0)} />
          <KpiCard title="Sessões GA4" value={formatNumber(g4t?.sessions ?? 0)} sparklineColor="#f97316" sparklineData={(ga4Data?.timeSeries ?? []).map(d => d.sessions)} />
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
          {!isGoogleSelected && (
            <Link href="/dashboard/meta" className="glass-panel rounded-2xl p-6 flex flex-col gap-4 hover:border-blue-500/50 border border-transparent transition-all group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img src="/icon-meta.png" alt="Meta Ads" className="w-6 h-6 object-contain" />
                  <span className="text-sm font-bold text-slate-200 group-hover:text-white">Meta Ads</span>
                </div>
                <TrendingUp size={14} className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Investimento</p>
                  <p className="text-base font-black text-white">{formatCurrency(mt?.spend ?? 0)}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">
                    {(mt?.messages ?? 0) > 0 || (mt?.leads ?? 0) > 0 ? "Custo por Lead" : (mt?.purchases ?? 0) > 0 ? "Custo por Venda" : "Custo por Conv."}
                  </p>
                  <p className="text-base font-black text-white">{formatCurrency(mt?.cpa ?? 0)}</p>
                </div>
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
          )}

          {/* Google */}
          {!isMetaSelected && (
            <Link href="/dashboard/google" className="glass-panel rounded-2xl p-6 flex flex-col gap-4 hover:border-cyan-500/50 border border-transparent transition-all group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img src="/icon-google-ads.webp" alt="Google Ads" className="w-6 h-6 object-contain" />
                  <span className="text-sm font-bold text-slate-200 group-hover:text-white">Google Ads</span>
                </div>
                <TrendingUp size={14} className="text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Investimento</p>
                  <p className="text-base font-black text-white">{formatCurrency(gt?.spend ?? 0)}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Custo por Conv.</p>
                  <p className="text-base font-black text-white">{formatCurrency(gt?.cpa ?? 0)}</p>
                </div>
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
          )}

          {/* GA4 */}
          {!isMetaSelected && (
            <Link href="/dashboard/ga4" className="glass-panel rounded-2xl p-6 flex flex-col gap-4 hover:border-orange-500/50 border border-transparent transition-all group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img src="/icon-ga4.png" alt="Google Analytics 4" className="w-6 h-6 object-contain" />
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
          )}

        </div>

      </div>

      {/* Welcome Modal */}
      {showWelcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-panel rounded-2xl p-6 max-w-lg w-full border border-slate-700/50 shadow-2xl">
            <div className="text-center space-y-5">
              {/* Logo */}
              <div className="flex items-center justify-center mx-auto">
                <img src="/Logo Full.png" alt="Dashfy" className="h-10 object-contain" />
              </div>

              {/* Title */}
              <div>
                <h2 className="text-xl font-black text-white mb-2">Bem-vindo à plataforma!</h2>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Centralize dados de Meta Ads, Google Ads e GA4 em um único painel.
                  <br />
                  Conecte suas contas e visualize métricas automaticamente.
                </p>
              </div>

              {/* Steps */}
              <div className="space-y-3 py-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-lg bg-blue-600/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-black text-blue-400">1</span>
                  </div>
                  <p className="text-xs text-slate-300 text-left"><strong className="text-white">Conecte suas contas</strong> de anúncios na área de Integrações</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-lg bg-blue-600/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-black text-blue-400">2</span>
                  </div>
                  <p className="text-xs text-slate-300 text-left"><strong className="text-white">Visualize métricas</strong> de todas as plataformas em tempo real</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-lg bg-blue-600/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-black text-blue-400">3</span>
                  </div>
                  <p className="text-xs text-slate-300 text-left"><strong className="text-white">Compartilhe dashboards</strong> personalizados com seus clientes</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3 pt-2">
                <Link
                  href="/integracoes/onboarding"
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm px-6 py-3.5 rounded-xl transition-all active:scale-95 shadow-xl shadow-blue-500/20"
                  onClick={dismissWelcome}
                >
                  Ver tutorial completo
                </Link>
                <Link
                  href="/integracoes"
                  className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm px-6 py-3.5 rounded-xl transition-all border border-slate-700"
                  onClick={dismissWelcome}
                >
                  Ir para integrações
                </Link>
              </div>

              <p className="text-[10px] text-slate-600 pt-2">
                {!hasConnectedAccounts
                  ? "Conecte suas contas de anúncios para começar a visualizar os dados."
                  : "Este é o seu primeiro acesso. Após conectar as contas, você verá todos os dados aqui."}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
