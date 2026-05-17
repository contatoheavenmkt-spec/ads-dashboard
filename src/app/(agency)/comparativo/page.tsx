"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2, ArrowUpDown, ExternalLink, TrendingUp, AlertCircle,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { TableSkeleton } from "@/components/ui/skeleton";

interface ComparativoRow {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  hasMeta: boolean;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  purchases: number;
  messages: number;
  revenue: number;
  cpa: number;
  roas: number;
  error?: boolean;
}

type SortKey = "name" | "spend" | "conversions" | "revenue" | "cpa" | "roas";
type SortDir = "asc" | "desc";

const DAY_OPTIONS = [7, 15, 30, 90];

export default function ComparativoPage() {
  const [rows, setRows] = useState<ComparativoRow[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/agency/comparativo?days=${days}`)
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((data) => setRows(data.rows ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [days]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  const sorted = [...rows].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "name") cmp = a.workspaceName.localeCompare(b.workspaceName);
    else cmp = (a[sortKey] as number) - (b[sortKey] as number);
    return sortDir === "asc" ? cmp : -cmp;
  });

  // Totais agregados pra cards do topo.
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalConversions = rows.reduce((s, r) => s + r.conversions, 0);
  const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header title="Comparativo de clientes" subtitle="Performance lado a lado de todos os workspaces" />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">

        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Período:</span>
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                "px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider border transition-colors",
                days === d
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800",
              )}
            >
              {d === 7 ? "7 dias" : d === 15 ? "15 dias" : d === 30 ? "30 dias" : "90 dias"}
            </button>
          ))}
        </div>

        {/* Totais agregados */}
        <div className="grid gap-3 sm:gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <MetricCard label="Investimento total" value={formatCurrency(totalSpend)} accent="text-blue-400" />
          <MetricCard label="Faturamento total" value={formatCurrency(totalRevenue)} accent="text-emerald-400" />
          <MetricCard label="Conversões" value={formatNumber(totalConversions)} accent="text-amber-400" />
          <MetricCard label="ROAS médio" value={`${avgRoas.toFixed(2)}x`} accent="text-emerald-400" />
        </div>

        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : rows.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center">
            <p className="text-slate-400 text-sm">Nenhum workspace encontrado.</p>
            <p className="text-slate-500 text-xs mt-1">
              Crie workspaces em <Link href="/workspaces" className="text-blue-400 hover:underline">Workspaces</Link> e conecte contas Meta para ver o comparativo.
            </p>
          </div>
        ) : (
          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-800 bg-slate-900/40">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                    <SortableHeader label="Cliente" active={sortKey === "name"} dir={sortDir} onClick={() => toggleSort("name")} />
                    <SortableHeader label="Investimento" align="right" active={sortKey === "spend"} dir={sortDir} onClick={() => toggleSort("spend")} />
                    <SortableHeader label="Conversões" align="right" active={sortKey === "conversions"} dir={sortDir} onClick={() => toggleSort("conversions")} />
                    <SortableHeader label="Faturamento" align="right" active={sortKey === "revenue"} dir={sortDir} onClick={() => toggleSort("revenue")} />
                    <SortableHeader label="CPA" align="right" active={sortKey === "cpa"} dir={sortDir} onClick={() => toggleSort("cpa")} />
                    <SortableHeader label="ROAS" align="right" active={sortKey === "roas"} dir={sortDir} onClick={() => toggleSort("roas")} />
                    <th className="px-3 py-3 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.workspaceId} className="border-b border-slate-800/40 hover:bg-slate-900/50 transition-colors">
                      <td className="px-3 py-3 text-slate-200 font-bold">
                        <div className="flex items-center gap-2">
                          <span>{r.workspaceName}</span>
                          {r.error && <AlertCircle size={11} className="text-rose-400" />}
                          {!r.hasMeta && <span className="text-[9px] text-slate-600 uppercase tracking-wider">Sem Meta</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-slate-300">{formatCurrency(r.spend)}</td>
                      <td className="px-3 py-3 text-right text-slate-300">{formatNumber(r.conversions)}</td>
                      <td className="px-3 py-3 text-right text-emerald-400 font-semibold">
                        {r.revenue > 0 ? formatCurrency(r.revenue) : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-300">
                        {r.cpa > 0 ? formatCurrency(r.cpa) : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold">
                        {r.roas > 0 ? (
                          <span className={cn(
                            "inline-flex items-center gap-1",
                            r.roas >= 2 ? "text-emerald-400" : r.roas >= 1 ? "text-amber-400" : "text-rose-400",
                          )}>
                            {r.roas >= 2 && <TrendingUp size={10} />}
                            {r.roas.toFixed(2)}x
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/workspace/${r.workspaceSlug}`}
                          className="inline-flex p-1.5 rounded text-slate-600 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                          title="Abrir dashboard"
                        >
                          <ExternalLink size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="glass-panel rounded-xl p-4">
      <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-1">{label}</p>
      <p className={cn("text-2xl font-bold", accent)}>{value}</p>
    </div>
  );
}

function SortableHeader({
  label, align, active, dir, onClick,
}: {
  label: string;
  align?: "left" | "right";
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <th className={cn("px-3 py-3 cursor-pointer select-none", align === "right" ? "text-right" : "text-left")} onClick={onClick}>
      <div className={cn("inline-flex items-center gap-1", align === "right" ? "justify-end" : "")}>
        {label}
        <ArrowUpDown
          size={9}
          className={cn(
            "transition-colors",
            active ? (dir === "desc" ? "text-blue-400" : "text-blue-400 rotate-180") : "text-slate-700",
          )}
        />
      </div>
    </th>
  );
}
