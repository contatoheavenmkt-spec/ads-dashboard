"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { GaugeChart } from "@/components/dashboard/gauge-chart";
import { PerformanceChart } from "@/components/charts/performance-chart";
import { RegionList, RegionMap } from "@/components/dashboard/region-heatmap";
import { Pie } from "react-chartjs-2";
import { formatNumber, formatCurrency } from "@/lib/utils";
import { Loader2, Search, Target, MousePointer2 } from "lucide-react";
import { KeywordsTable } from "@/components/dashboard/keywords-table";
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


interface DemographicBreakdown { label: string; impressions: number; clicks: number }
interface AdCreative { id: string; name: string; thumbnail: string | null; impressions: number; clicks: number; purchases: number; leads: number; messages: number; conversions: number; spend: number; status: string; isMessaging: boolean }
interface TimeSeries { date: string; spend: number; revenue: number; impressions: number; clicks: number; purchases: number; leads: number; messages: number; conversions: number }

const GENDER_COLORS = ["#3b82f6", "#93c5fd", "#1e40af"];
const AGE_COLORS = ["#1e3a8a", "#1e40af", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe"];

const FALLBACK_GENDER = { labels: ["Feminino", "Masculino", "Desconhecido"], data: [62, 37.8, 0.2] };
const FALLBACK_AGE = { labels: ["45-54", "25-34", "35-44", "18-24", "63+", "55-64"], data: [31.4, 25, 17.2, 14.2, 8, 4.2] };

export default function DetalhesPage() {
  const [days, setDays] = useState(30);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<any | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [metaData, setMetaData] = useState<{ totals: any; timeSeries: TimeSeries[]; campaigns: any[] } | null>(null);
  const [googleData, setGoogleData] = useState<{ totals: any; timeSeries: TimeSeries[]; keywords: any[]; campaigns: any[] } | null>(null);
  const [ga4Data, setGa4Data] = useState<{ totals: any; regions: { name: string; value: number }[]; demographics?: any } | null>(null);
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [demographics, setDemographics] = useState<{ gender: DemographicBreakdown[]; age: DemographicBreakdown[] }>({ gender: [], age: [] });

  useEffect(() => {
    fetch("/api/integrations")
      .then((r) => r.json())
      .then((ints: any[]) => {
        setIntegrations(ints);
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ days: String(days) });
    if (selectedAccount) params.set("adAccountId", selectedAccount.adAccountId);
    
    // Se a campanha for selecionada, mandamos para a API correspondente
    const metaParams = new URLSearchParams(params);
    if (selectedCampaign) metaParams.set("campaignId", selectedCampaign.id);

    Promise.all([
      fetch(`/api/metrics?${metaParams}`).then(r => r.json()).catch(() => null),
      fetch(`/api/meta/creatives?${metaParams}`).then(r => r.json()).catch(() => ({ ads: [] })),
      fetch(`/api/meta/demographics?${metaParams}`).then(r => r.json()).catch(() => ({ gender: [], age: [] })),
      fetch(`/api/google/metrics?${params}`).then(r => r.json()).catch(() => null),
      fetch(`/api/ga4/metrics?${params}`).then(r => r.json()).catch(() => null),
    ]).then(([meta, creativesRes, demo, google, ga4]) => {
      setMetaData(meta);
      setCreatives(creativesRes?.ads ?? []);
      setDemographics(demo);
      setGoogleData(google);
      setGa4Data(ga4);
    }).finally(() => setLoading(false));
  }, [days, selectedAccount, selectedCampaign]);

  const mtRaw = metaData?.totals;
  const filterMt = selectedCampaign && metaData ? metaData.campaigns.find((c: any) => c.id === selectedCampaign.id) : null;
  const mt = filterMt ? {
    ...filterMt,
    revenue: (filterMt as any).revenue || 0,
  } : mtRaw;

  const gtRaw = googleData?.totals;
  const gt = gtRaw; // Para Google, mantemos o total da conta se o filtro for Meta
  const g4t = ga4Data?.totals;
  const convRate = mt && mt.clicks > 0 ? Math.round((mt.conversions / mt.clicks) * 1000) / 10 : 0;

  // Demographics
  const totalGI = demographics.gender.reduce((a, b) => a + b.impressions, 0) || 1;
  const gLabels = demographics.gender.length > 0 ? demographics.gender.map(g => g.label) : FALLBACK_GENDER.labels;
  const gData = demographics.gender.length > 0 ? demographics.gender.map(g => Math.round((g.impressions / totalGI) * 100)) : FALLBACK_GENDER.data;

  const totalAI = demographics.age.reduce((a, b) => a + b.impressions, 0) || 1;
  const aLabels = demographics.age.length > 0 ? demographics.age.map(a => a.label) : FALLBACK_AGE.labels;
  const aData = demographics.age.length > 0 ? demographics.age.map(a => Math.round((a.impressions / totalAI) * 100)) : FALLBACK_AGE.data;

  if (loading && !metaData) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          <p className="text-slate-400 text-sm font-medium animate-pulse">Carregando detalhamento...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header
        title="Detalhamento Geral"
        subtitle={`Resumo Multiplataforma | ${selectedAccount ? selectedAccount.name : "Todas as Fontes"}`}
        days={days}
        onDaysChange={setDays}
        accounts={integrations}
        selectedAccount={selectedAccount}
        onAccountChange={setSelectedAccount}
        campaigns={metaData?.campaigns || []}
        selectedCampaign={selectedCampaign}
        onCampaignChange={setSelectedCampaign}
        onDownload={() => {
          const headers = ["Data", "Investimento", "Conversões", "Vendas", "Conversas"];
          const rows = metaData?.timeSeries.map(d => [
            d.date,
            d.spend.toFixed(2),
            d.conversions,
            d.purchases,
            d.messages
          ]) || [];
          const csv = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
          const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `detalhamento_geral.csv`;
          a.click();
        }}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">

        {/* ═══ Row 1: Gauge | Line | Gênero | Faixa Etária ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Gauge + KPIs */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="glass-panel flex-1 rounded-2xl p-6 flex flex-col items-center justify-center">
              <GaugeChart
                value={convRate}
                label="Taxa de Conversão"
                sublabel={`${(mt?.conversions ?? 0).toLocaleString('pt-BR')} conv.`}
                color="#3b82f6"
              />
            </div>
            <div className={`glass-panel rounded-2xl p-4 space-y-2 ${mt?.revenue > 0 ? "" : "border-slate-800/50"}`}>
              <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500">
                <span>Investimento</span>
                <span className="text-white">{formatCurrency(mt?.spend ?? 0)}</span>
              </div>
              
              {/* WhatsApp Metric */}
              {(mt?.messages > 0 || mt?.leads > 0) && (
                <div className="pt-1 border-t border-white/5 space-y-1">
                  <div className="flex justify-between text-[10px] font-bold uppercase text-blue-400">
                    <span>Conversas</span>
                    <span>{formatNumber(mt?.messages + mt?.leads)}</span>
                  </div>
                  <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500">
                    <span>Custo p/ Conversa</span>
                    <span className="text-white">{formatCurrency(mt?.messages + mt?.leads > 0 ? mt.spend / (mt.messages + mt.leads) : 0)}</span>
                  </div>
                </div>
              )}

              {/* Purchase Metric */}
              {mt?.purchases > 0 && (
                <div className="pt-1 border-t border-white/5 space-y-1">
                  <div className="flex justify-between text-[10px] font-bold uppercase text-emerald-400">
                    <span>Vendas (Compras)</span>
                    <span>{formatNumber(mt?.purchases)}</span>
                  </div>
                  <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500">
                    <span>Custo p/ Venda</span>
                    <span className="text-white">{formatCurrency(mt?.purchases > 0 ? mt.spend / mt.purchases : 0)}</span>
                  </div>
                </div>
              )}

              {!mt?.messages && !mt?.leads && !mt?.purchases && mt?.conversions > 0 && (
                <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500 pt-1 border-t border-white/5">
                  <span>Conversões</span>
                  <span className="text-white">{formatNumber(mt?.conversions)}</span>
                </div>
              )}
              {(mt?.revenue > 0 || mt?.roas > 0) && (
                <>
                  <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500 pt-1 border-t border-white/5">
                    <span>Receita</span>
                    <span className="text-white">{formatCurrency(mt?.revenue ?? 0)}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500">
                    <span>ROAS</span>
                    <span className="text-emerald-400">{(mt?.roas ?? 0).toFixed(2)}x</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Line Chart */}
          <div className="lg:col-span-4 glass-panel rounded-2xl p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-1 bg-blue-500 rounded"></div>
                <span className="text-[9px] font-bold text-slate-400 uppercase">
                  {mt?.purchases > 0 ? "Vendas" : mt?.messages > 0 ? "Conversas" : mt?.leads > 0 ? "Leads" : "Conversões"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-1 bg-emerald-400 rounded"></div>
                <span className="text-[9px] font-bold text-slate-400 uppercase">Custo por Conv.</span>
              </div>
            </div>
            <div className="flex-1 min-h-[220px]">
              <PerformanceChart 
                data={metaData?.timeSeries ?? []} 
                metrics={["conversions", "spend"]} 
                customLabels={{ conversions: mt?.purchases > 0 ? "Vendas" : mt?.messages > 0 ? "Conversas" : mt?.leads > 0 ? "Leads" : "Conversões" }}
              />
            </div>
          </div>

          {/* Gênero */}
          <div className="lg:col-span-2 glass-panel rounded-2xl p-5 flex flex-col items-center">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest mb-3 w-full text-center">Gênero</h3>
            <div className="w-full aspect-square relative max-w-[120px]">
              <Pie
                data={{ labels: gLabels, datasets: [{ data: gData, backgroundColor: GENDER_COLORS, borderWidth: 0 }] }}
                options={{ cutout: '65%', plugins: { legend: { display: false } } }}
              />
              <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                <span className="text-sm font-black text-white">{gData[0]}%</span>
                <span className="text-[7px] font-bold text-slate-400">Fem.</span>
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
          </div>

          {/* Faixa Etária */}
          <div className="lg:col-span-3 glass-panel rounded-2xl p-5 flex flex-col items-center">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest mb-3 w-full text-center">Faixa Etária</h3>
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
          </div>

        </div>

        {/* ═══ Row 2: Anúncios Meta (FULL WIDTH) ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-12 glass-panel rounded-2xl p-6 flex flex-col">
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
                            <span className="text-[8px] text-slate-600 font-bold uppercase tracking-widest italic">Signal lost</span>
                          </div>
                        )}
                        <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${ad.status === "ACTIVE" ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" : "bg-slate-500"}`}></div>
                        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
                      </div>
                      <div className="mt-3 space-y-2 px-1">
                        <div className="flex justify-between items-center">
                            <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Reach</span>
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
                  Data Stream Empty - No Creatives Found
                </div>
              )}
            </div>

            {creatives.length > 0 && (
              <div className="mt-4 flex justify-between items-center text-[10px] font-bold text-white/10 uppercase tracking-[0.2em] border-t border-white/5 pt-4">
                <span>Displaying Node Cluster {Math.min(creatives.length, 7)} / {creatives.length}</span>
                <div className="flex gap-6 pointer-events-auto">
                  <button className="hover:text-white transition-colors cursor-pointer">&lt;</button>
                  <button className="hover:text-white transition-colors cursor-pointer">&gt;</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══ Row 3: Região & Mapa Geográfico (SPLIT) ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 h-[480px]">
            <RegionList data={ga4Data?.regions ?? []} title="Market Reach" />
          </div>
          <div className="lg:col-span-8 h-[480px]">
            <RegionMap data={ga4Data?.regions ?? []} title="Geographic Intelligence" />
          </div>
        </div>

        {/* ═══ Row 3: Keywords (Google Ads) ═══ */}
        {googleData?.keywords && (
          <div className="grid grid-cols-1 gap-6">
            <KeywordsTable keywords={googleData.keywords} />
          </div>
        )}

        {/* ═══ Row 4: Painéis laterais — Google Ads + GA4 ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Google Ads — painel completo fictício */}
          <div className="lg:col-span-6 glass-panel rounded-2xl p-6 flex flex-col border border-cyan-500/10">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-3 h-3 rounded-full bg-cyan-400"></div>
              <h3 className="text-sm font-bold text-slate-200">Google Ads</h3>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { l: "Investimento", v: formatCurrency(gt?.spend ?? 0) },
                { l: "Conversões", v: formatNumber(gt?.conversions ?? 0) },
                { l: "ROAS", v: gt?.revenue > 0 ? `${(gt?.roas ?? 0).toFixed(2)}x` : null, c: "text-emerald-400" },
                { l: "CPC Médio", v: formatCurrency(gt?.cpc ?? 0) },
                { l: "CTR", v: `${(gt?.ctr ?? 0).toFixed(2)}%` },
                { l: "IQ Médio", v: `${(gt?.qualityScoreAvg ?? 0).toFixed(1)}/10` },
              ].filter(k => k.v !== null).map(k => (
                <div key={k.l} className="bg-slate-800/40 rounded-xl p-3">
                  <p className="text-[8px] font-bold text-slate-500 uppercase mb-0.5">{k.l}</p>
                  <p className={`text-sm font-black ${k.c ?? "text-white"}`}>{k.v}</p>
                </div>
              ))}
            </div>

            {/* Mini chart */}
            <div className="h-[140px] w-full">
              <PerformanceChart data={googleData?.timeSeries ?? []} metrics={["clicks", "spend"]} />
            </div>
            <div className="flex justify-center gap-4 mt-2">
              <div className="flex items-center gap-1 text-[8px] font-bold text-slate-500 uppercase">
                <span className="w-2 h-0.5 bg-cyan-500 rounded"></span> Cliques
              </div>
              <div className="flex items-center gap-1 text-[8px] font-bold text-slate-500 uppercase">
                <span className="w-2 h-0.5 bg-blue-500 rounded"></span> Investimento
              </div>
            </div>
          </div>

          {/* GA4 — painel completo fictício */}
          <div className="lg:col-span-6 glass-panel rounded-2xl p-6 flex flex-col border border-orange-500/10">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-3 h-3 rounded-full bg-orange-400"></div>
              <h3 className="text-sm font-bold text-slate-200">Google Analytics 4</h3>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { l: "Sessões", v: formatNumber(g4t?.sessions ?? 0) },
                { l: "Usuários", v: formatNumber(g4t?.users ?? 0) },
                { l: "Engajamento", v: `${g4t?.engagementRate ?? 0}%`, c: "text-emerald-400" },
                { l: "Novos Usuários", v: formatNumber(g4t?.newUsers ?? 0) },
                { l: "Eventos/Sessão", v: String(g4t?.eventsPerSession ?? 0) },
                { l: "Conversões", v: formatNumber(g4t?.conversions ?? 0) },
              ].map(k => (
                <div key={k.l} className="bg-slate-800/40 rounded-xl p-3">
                  <p className="text-[8px] font-bold text-slate-500 uppercase mb-0.5">{k.l}</p>
                  <p className={`text-base font-black ${k.c ?? "text-white"}`}>{k.v}</p>
                </div>
              ))}
            </div>

            {/* Mini Pie channels + sessions gauge */}
            <div className="flex gap-4 items-center">
              <div className="w-[100px] aspect-square relative flex-shrink-0">
                <Pie
                  data={{
                    labels: ['Organic', 'Direct', 'Social', 'Paid'],
                    datasets: [{ data: [45, 30, 15, 10], backgroundColor: ['#f97316', '#fb923c', '#fdba74', '#fed7aa'], borderWidth: 0 }]
                  }}
                  options={{ cutout: '65%', plugins: { legend: { display: false } } }}
                />
                <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                  <span className="text-[10px] font-black text-white">45%</span>
                  <span className="text-[6px] font-bold text-slate-400 uppercase">Organic</span>
                </div>
              </div>
              <div className="flex-1 space-y-1.5">
                {[
                  { l: "Organic", c: "#f97316", v: "45%" },
                  { l: "Direct", c: "#fb923c", v: "30%" },
                  { l: "Social", c: "#fdba74", v: "15%" },
                  { l: "Paid", c: "#fed7aa", v: "10%" },
                ].map(ch => (
                  <div key={ch.l} className="flex justify-between items-center text-[9px] font-bold text-slate-400 uppercase">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ch.c }}></div>
                      {ch.l}
                    </div>
                    <span className="text-white">{ch.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
