"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2, Plus, Search, Phone, Mail, Users,
  CheckCircle2, XCircle, Clock, Send, ExternalLink,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { cn, formatCurrency } from "@/lib/utils";

type LeadStatus = "novo" | "contato" | "negociando" | "vendido" | "perdido";

interface Lead {
  id: string;
  workspaceId: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  status: LeadStatus;
  saleValue: number | null;
  createdAt: string;
  workspace: { id: string; name: string; slug: string };
}

interface WorkspaceRef {
  id: string;
  name: string;
  slug: string;
}

const STATUSES: { id: LeadStatus | "all"; label: string; icon?: React.ReactNode }[] = [
  { id: "all", label: "Todos" },
  { id: "novo", label: "Novos", icon: <Plus size={12} /> },
  { id: "contato", label: "Em contato", icon: <Clock size={12} /> },
  { id: "negociando", label: "Negociando", icon: <Send size={12} /> },
  { id: "vendido", label: "Vendidos", icon: <CheckCircle2 size={12} /> },
  { id: "perdido", label: "Perdidos", icon: <XCircle size={12} /> },
];

const STATUS_PILL: Record<LeadStatus, { bg: string; text: string; label: string }> = {
  novo: { bg: "bg-blue-500/15 border-blue-500/30", text: "text-blue-400", label: "Novo" },
  contato: { bg: "bg-amber-500/15 border-amber-500/30", text: "text-amber-400", label: "Em contato" },
  negociando: { bg: "bg-purple-500/15 border-purple-500/30", text: "text-purple-400", label: "Negociando" },
  vendido: { bg: "bg-emerald-500/15 border-emerald-500/30", text: "text-emerald-400", label: "Vendido" },
  perdido: { bg: "bg-rose-500/15 border-rose-500/30", text: "text-rose-400", label: "Perdido" },
};

export default function AgencyCrmPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<LeadStatus | "all">("all");
  const [filterWorkspaceId, setFilterWorkspaceId] = useState<string | "all">("all");
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterWorkspaceId !== "all") params.set("workspaceId", filterWorkspaceId);
      if (search) params.set("q", search);

      const r = await fetch(`/api/agency/leads?${params}`);
      if (!r.ok) return;
      const data = (await r.json()) as { leads: Lead[]; workspaces: WorkspaceRef[] };
      setLeads(data.leads);
      setWorkspaces(data.workspaces);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterWorkspaceId]);

  useEffect(() => {
    const t = setTimeout(() => load(), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Métricas no topo
  const totalLeads = leads.length;
  const vendidos = leads.filter((l) => l.status === "vendido");
  const faturamento = vendidos.reduce((s, l) => s + (l.saleValue ?? 0), 0);
  const taxaConv = totalLeads > 0 ? (vendidos.length / totalLeads) * 100 : 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header title="CRM consolidado" subtitle="Leads de todos os seus clientes" />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">

        {/* Métricas */}
        <div className="grid gap-3 sm:gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <MetricBox label="Total de leads" value={String(totalLeads)} accent="text-blue-400" />
          <MetricBox label="Vendas fechadas" value={String(vendidos.length)} accent="text-emerald-400" />
          <MetricBox label="Faturamento total" value={formatCurrency(faturamento)} accent="text-emerald-400" />
          <MetricBox label="Taxa de conversão" value={`${taxaConv.toFixed(1)}%`} accent="text-amber-400" />
        </div>

        {/* Filtros de status (chips) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUSES.map((s) => (
            <button
              key={s.id}
              onClick={() => setFilterStatus(s.id)}
              className={cn(
                "px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider border transition-colors flex items-center gap-1.5",
                filterStatus === s.id
                  ? "bg-slate-800 border-slate-600 text-white"
                  : "bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800",
              )}
            >
              {s.icon}
              {s.label}
            </button>
          ))}
        </div>

        {/* Filtros: workspace dropdown + busca */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-slate-500" />
            <select
              value={filterWorkspaceId}
              onChange={(e) => setFilterWorkspaceId(e.target.value as string | "all")}
              className="px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-lg text-xs font-medium text-slate-300 focus:outline-none focus:border-blue-500/60"
            >
              <option value="all">Todos os clientes</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[180px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, telefone ou email…"
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900/60 border border-slate-800 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none focus:border-blue-500/60"
            />
          </div>
        </div>

        {/* Tabela */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : leads.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center">
            <p className="text-slate-400 text-sm">
              Nenhum lead {filterStatus !== "all" ? "neste status " : ""}{filterWorkspaceId !== "all" ? "neste cliente " : ""}ainda.
            </p>
            <p className="text-slate-500 text-xs mt-1">Crie ou edite leads entrando em cada workspace.</p>
          </div>
        ) : (
          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-800 bg-slate-900/40">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Lead</th>
                    <th className="px-4 py-3">Contato</th>
                    <th className="px-4 py-3">Origem</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Venda</th>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr
                      key={lead.id}
                      className="border-b border-slate-800/50 hover:bg-slate-900/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/workspace/${lead.workspace.slug}`}
                          className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 font-bold transition-colors"
                        >
                          {lead.workspace.name}
                          <ExternalLink size={10} className="opacity-60" />
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-200 font-medium">{lead.name}</td>
                      <td className="px-4 py-3 text-slate-400">
                        <div className="flex flex-col gap-0.5">
                          {lead.phone && <span className="flex items-center gap-1"><Phone size={10} />{lead.phone}</span>}
                          {lead.email && <span className="flex items-center gap-1"><Mail size={10} />{lead.email}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {lead.source ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-800 border border-slate-700 text-slate-300">
                            {lead.source}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                          STATUS_PILL[lead.status].bg,
                          STATUS_PILL[lead.status].text,
                        )}>
                          {STATUS_PILL[lead.status].label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-emerald-400 font-semibold">
                        {lead.saleValue ? formatCurrency(lead.saleValue) : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(lead.createdAt).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/workspace/${lead.workspace.slug}`}
                          className="p-1.5 rounded text-slate-600 hover:text-blue-400 hover:bg-blue-500/10 transition-colors inline-flex"
                          title="Abrir no workspace"
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

function MetricBox({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="glass-panel rounded-xl p-4">
      <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-1">{label}</p>
      <p className={cn("text-2xl font-bold", accent)}>{value}</p>
    </div>
  );
}
