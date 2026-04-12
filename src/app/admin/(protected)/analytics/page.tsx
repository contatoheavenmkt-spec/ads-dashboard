"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { CheckCircle, Circle, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Overview {
  totalViewsToday: number;
  totalViewsPeriod: number;
  uniqueVisitorsPeriod: number;
  activeNow: number;
  totalErrors: number;
  unresolvedErrors: number;
  errorRate: number;
}

interface ViewsByDay { date: string; views: number; unique: number; }
interface TopPage { path: string; views: number; unique: number; }
interface TopCountry { country: string; views: number; }
interface ErrorItem {
  id: string; path: string; errorType: string; errorMessage: string;
  statusCode: number | null; resolved: boolean; fixSuggestion: string | null;
  createdAt: string;
}
interface ActiveUser {
  sessionId: string; userId: string | null; userEmail: string | null;
  userName: string | null; path: string | null; country: string | null; lastSeen: string;
}
interface RevenueRanking {
  userId: string; email: string; name: string | null;
  plan: string; totalPaid: number; joinedAt: string;
}
interface ErrorByType { errorType: string; count: number; }

interface AnalyticsData {
  overview: Overview;
  viewsByDay: ViewsByDay[];
  topPages: TopPage[];
  topCountries: TopCountry[];
  recentErrors: ErrorItem[];
  activeUsers: ActiveUser[];
  revenueRanking: RevenueRanking[];
  errorsByType: ErrorByType[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countryFlag(code: string) {
  if (!code || code.length !== 2) return "🌍";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 - 65 + c.charCodeAt(0)));
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function fmtDatetime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function planColor(plan: string) {
  const map: Record<string, string> = {
    trial: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    start: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    plus: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    premium: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  };
  return map[plan] ?? "text-slate-400 bg-slate-700/50 border-slate-600";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, dot }: { label: string; value: string | number; sub?: string; dot?: boolean }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{label}</p>
      <div className="flex items-center gap-2">
        {dot && <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />}
        <p className="text-2xl font-black text-white leading-none">{value}</p>
      </div>
      {sub && <p className="text-[10px] text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-slate-800 rounded-xl" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => <div key={i} className="h-24 bg-slate-900/60 rounded-2xl border border-slate-800/60" />)}
      </div>
      <div className="h-64 bg-slate-900/60 rounded-2xl border border-slate-800/60" />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminAnalyticsPage() {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorFilter, setErrorFilter] = useState<"all" | "unresolved" | "resolved">("all");
  const [expandedError, setExpandedError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/analytics?period=${period}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function resolveError(id: string) {
    setResolvingId(id);
    try {
      await fetch(`/api/admin/errors/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolved: true }),
      });
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          recentErrors: prev.recentErrors.map((e) => e.id === id ? { ...e, resolved: true } : e),
        };
      });
    } finally {
      setResolvingId(null);
    }
  }

  if (loading) return <Skeleton />;
  if (!data) return (
    <div className="p-6 text-slate-400 text-sm">Erro ao carregar analytics.</div>
  );

  const { overview, viewsByDay, topPages, topCountries, recentErrors, activeUsers, revenueRanking } = data;
  const maxPageViews = topPages[0]?.views ?? 1;
  const maxCountryViews = topCountries[0]?.views ?? 1;

  const filteredErrors = recentErrors.filter((e) => {
    if (errorFilter === "unresolved") return !e.resolved;
    if (errorFilter === "resolved") return e.resolved;
    return true;
  });

  const periods: Array<"7d" | "30d" | "90d"> = ["7d", "30d", "90d"];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white">Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">Monitoramento em tempo real da plataforma</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-900/60 border border-slate-800/60 rounded-xl p-1 gap-1">
            {periods.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  period === p
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : "90 dias"}
              </button>
            ))}
          </div>
          <button
            onClick={fetchData}
            className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/60 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Visualizações Hoje" value={overview.totalViewsToday.toLocaleString("pt-BR")} />
        <KpiCard label={`Visualizações (${period})`} value={overview.totalViewsPeriod.toLocaleString("pt-BR")} />
        <KpiCard label="Visitantes Únicos" value={overview.uniqueVisitorsPeriod.toLocaleString("pt-BR")} sub={`no período de ${period}`} />
        <KpiCard label="Ativos Agora" value={overview.activeNow} dot={true} sub="últimos 5 minutos" />
        <KpiCard label="Total de Erros" value={overview.totalErrors} sub={`${overview.unresolvedErrors} não resolvidos`} />
        <KpiCard label="Taxa de Erros" value={`${overview.errorRate.toFixed(2)}%`} sub="erros / visualizações" />
      </div>

      {/* Line Chart */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Visualizações por Dia</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={viewsByDay} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDate}
              tick={{ fill: "#64748b", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.15)", borderRadius: 12, fontSize: 12 }}
              labelFormatter={(label) => fmtDate(String(label))}
              labelStyle={{ color: "#94a3b8" }}
            />
            <Line type="monotone" dataKey="views" stroke="#3b82f6" strokeWidth={2} dot={false} name="Total" />
            <Line type="monotone" dataKey="unique" stroke="#64748b" strokeWidth={1.5} dot={false} name="Únicos" strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 bg-blue-500" /><span className="text-[10px] text-slate-500">Total</span></div>
          <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 bg-slate-500 border-dashed" style={{ borderTop: "1.5px dashed #64748b", background: "none" }} /><span className="text-[10px] text-slate-500">Únicos</span></div>
        </div>
      </div>

      {/* Top Pages + Countries */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Pages */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Top 10 Páginas</h2>
          {topPages.length === 0 ? (
            <p className="text-slate-600 text-xs font-medium py-4 text-center">Sem dados no período</p>
          ) : (
            <div className="space-y-2.5">
              {topPages.map((page, i) => (
                <div key={page.path} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-slate-600 w-4 shrink-0">{i + 1}</span>
                      <span className="text-[11px] text-slate-300 truncate font-mono">{page.path}</span>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <span className="text-xs font-bold text-white">{page.views.toLocaleString("pt-BR")}</span>
                      <span className="text-[10px] text-slate-500 ml-1">({page.unique} únicos)</span>
                    </div>
                  </div>
                  <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500/70 rounded-full"
                      style={{ width: `${(page.views / maxPageViews) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Countries */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Distribuição por País</h2>
          {topCountries.length === 0 ? (
            <p className="text-slate-600 text-xs font-medium py-4 text-center">Sem dados no período</p>
          ) : (
            <div className="space-y-2.5">
              {topCountries.map((c, i) => (
                <div key={c.country} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-600 w-4">{i + 1}</span>
                      <span className="text-base">{countryFlag(c.country)}</span>
                      <span className="text-[11px] text-slate-300 font-medium">{c.country}</span>
                    </div>
                    <span className="text-xs font-bold text-white">{c.views.toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500/70 rounded-full"
                      style={{ width: `${(c.views / maxCountryViews) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Active Users */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800/60 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Usuários Ativos Agora</h2>
          <span className="ml-auto text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
            {activeUsers.length}
          </span>
        </div>
        {activeUsers.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-600 text-xs font-medium">Nenhum usuário ativo no momento</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-800/40">
              <tr>
                {["Usuário", "Página Atual", "País", "Última Atividade"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {activeUsers.map((u) => (
                <tr key={u.sessionId} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3">
                    <p className="text-[11px] font-medium text-white">{u.userEmail ?? "Anônimo"}</p>
                    {u.userName && <p className="text-[10px] text-slate-500">{u.userName}</p>}
                  </td>
                  <td className="px-5 py-3 text-[11px] text-slate-400 font-mono truncate max-w-[200px]">
                    {u.path ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-sm">
                    {u.country ? <>{countryFlag(u.country)} <span className="text-[11px] text-slate-400 ml-1">{u.country}</span></> : "—"}
                  </td>
                  <td className="px-5 py-3 text-[11px] text-slate-400">{fmtDatetime(u.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Errors */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800/60 flex items-center gap-3 flex-wrap">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Erros do Sistema</h2>
          <div className="ml-auto flex items-center gap-1">
            {(["all", "unresolved", "resolved"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setErrorFilter(f)}
                className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${
                  errorFilter === f
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {f === "all" ? "Todos" : f === "unresolved" ? "Não Resolvidos" : "Resolvidos"}
              </button>
            ))}
          </div>
        </div>
        {filteredErrors.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-600 text-xs font-medium">Nenhum erro encontrado</div>
        ) : (
          <div className="divide-y divide-slate-800/40">
            {filteredErrors.map((err) => (
              <div key={err.id}>
                <div className="px-5 py-3 flex items-center gap-3 hover:bg-slate-800/20 transition-colors">
                  <div className="min-w-0 flex-1 grid grid-cols-5 gap-3 items-center">
                    <div className="col-span-1">
                      <p className="text-[11px] font-mono text-slate-300 truncate">{err.path}</p>
                    </div>
                    <div className="col-span-1">
                      <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
                        {err.errorType}
                      </span>
                    </div>
                    <div className="col-span-1">
                      <p className="text-[11px] text-slate-400 truncate">{err.errorMessage}</p>
                    </div>
                    <div className="col-span-1">
                      <span className="text-[10px] text-slate-500">{err.statusCode ?? "—"}</span>
                      <span className="text-[10px] text-slate-600 ml-2">{fmtDate(err.createdAt)}</span>
                    </div>
                    <div className="col-span-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        err.resolved
                          ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                          : "text-amber-400 bg-amber-500/10 border-amber-500/20"
                      }`}>
                        {err.resolved ? "Resolvido" : "Pendente"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!err.resolved && (
                      <button
                        onClick={() => resolveError(err.id)}
                        disabled={resolvingId === err.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                      >
                        <CheckCircle size={11} />
                        {resolvingId === err.id ? "..." : "Marcar Resolvido"}
                      </button>
                    )}
                    {err.resolved && <CheckCircle size={14} className="text-emerald-500" />}
                    <button
                      onClick={() => setExpandedError(expandedError === err.id ? null : err.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-colors"
                    >
                      {expandedError === err.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  </div>
                </div>
                {expandedError === err.id && err.fixSuggestion && (
                  <div className="px-5 pb-3">
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2">
                      <Circle size={11} className="text-amber-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wide mb-1">Sugestão de Correção</p>
                        <p className="text-[11px] text-amber-200/80">{err.fixSuggestion}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Revenue Ranking */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800/60">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ranking de Receita</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-800/40">
            <tr>
              {["#", "Usuário", "Plano", "Receita Total Estimada", "Desde"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {revenueRanking.map((u, i) => (
              <tr key={u.userId} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-5 py-3 text-[11px] font-bold text-slate-600">{i + 1}</td>
                <td className="px-5 py-3">
                  <p className="text-[11px] font-medium text-white">{u.name ?? u.email}</p>
                  <p className="text-[10px] text-slate-500 truncate">{u.email}</p>
                </td>
                <td className="px-5 py-3">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${planColor(u.plan)}`}>
                    {u.plan}
                  </span>
                </td>
                <td className="px-5 py-3 text-sm font-bold text-white">{fmtCurrency(u.totalPaid)}</td>
                <td className="px-5 py-3 text-[11px] text-slate-400">{fmtDate(u.joinedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
