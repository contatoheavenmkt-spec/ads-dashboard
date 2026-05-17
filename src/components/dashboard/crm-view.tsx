"use client";

import { useEffect, useState } from "react";
import {
  Loader2, Plus, Search, Trash2, Phone, Mail,
  CheckCircle2, XCircle, Clock, Send, X, LayoutGrid, List,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { TableSkeleton } from "@/components/ui/skeleton";

type LeadStatus = "novo" | "contato" | "negociando" | "vendido" | "perdido";

interface Lead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  campaignId: string | null;
  notes: string | null;
  status: LeadStatus;
  saleValue: number | null;
  closedByUserId: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUSES: { id: LeadStatus | "all"; label: string; color: string; icon?: React.ReactNode }[] = [
  { id: "all", label: "Todos", color: "text-slate-300" },
  { id: "novo", label: "Novos", color: "text-blue-400", icon: <Plus size={12} /> },
  { id: "contato", label: "Em contato", color: "text-amber-400", icon: <Clock size={12} /> },
  { id: "negociando", label: "Negociando", color: "text-purple-400", icon: <Send size={12} /> },
  { id: "vendido", label: "Vendidos", color: "text-emerald-400", icon: <CheckCircle2 size={12} /> },
  { id: "perdido", label: "Perdidos", color: "text-rose-400", icon: <XCircle size={12} /> },
];

const STATUS_PILL: Record<LeadStatus, { bg: string; text: string; label: string }> = {
  novo: { bg: "bg-blue-500/15 border-blue-500/30", text: "text-blue-400", label: "Novo" },
  contato: { bg: "bg-amber-500/15 border-amber-500/30", text: "text-amber-400", label: "Em contato" },
  negociando: { bg: "bg-purple-500/15 border-purple-500/30", text: "text-purple-400", label: "Negociando" },
  vendido: { bg: "bg-emerald-500/15 border-emerald-500/30", text: "text-emerald-400", label: "Vendido" },
  perdido: { bg: "bg-rose-500/15 border-rose-500/30", text: "text-rose-400", label: "Perdido" },
};

interface CrmViewProps {
  workspaceId: string;
}

export function CrmView({ workspaceId }: CrmViewProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [canDelete, setCanDelete] = useState(false);
  const [filterStatus, setFilterStatus] = useState<LeadStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  // Persiste preferência em localStorage por workspace — usuário não precisa
  // reescolher toda vez. SSR safe: começa null, hydrata no useEffect.
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`dashfy.crm.viewMode.${workspaceId}`);
      if (stored === "kanban" || stored === "table") setViewMode(stored);
    } catch {
      // localStorage indisponível — mantém default
    }
  }, [workspaceId]);

  function changeViewMode(mode: "table" | "kanban") {
    setViewMode(mode);
    try {
      localStorage.setItem(`dashfy.crm.viewMode.${workspaceId}`, mode);
    } catch {
      // ignora
    }
  }

  async function loadLeads() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      // Kanban mostra todas as colunas lado a lado — ignora filtro de status.
      if (filterStatus !== "all" && viewMode === "table") params.set("status", filterStatus);
      if (search) params.set("q", search);
      const r = await fetch(`/api/workspaces/${workspaceId}/leads?${params}`);
      if (!r.ok) return;
      const data = (await r.json()) as { leads: Lead[]; canDelete: boolean; leadSources: string[] };
      setLeads(data.leads);
      setCanDelete(data.canDelete);
      setSources(data.leadSources ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, filterStatus, viewMode]);

  // Search com debounce simples
  useEffect(() => {
    const t = setTimeout(() => loadLeads(), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Métricas no topo
  const totalLeads = leads.length;
  const vendidos = leads.filter((l) => l.status === "vendido");
  const totalVendas = vendidos.length;
  const faturamento = vendidos.reduce((s, l) => s + (l.saleValue ?? 0), 0);
  const taxaConversao = totalLeads > 0 ? (totalVendas / totalLeads) * 100 : 0;

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 pb-8 sm:p-6 space-y-4">
      {/* Header de métricas */}
      <div className="grid gap-3 sm:gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <MetricBox label="Total de leads" value={String(totalLeads)} accent="text-blue-400" />
        <MetricBox label="Vendas fechadas" value={String(totalVendas)} accent="text-emerald-400" />
        <MetricBox label="Faturamento" value={formatCurrency(faturamento)} accent="text-emerald-400" />
        <MetricBox label="Taxa de conversão" value={`${taxaConversao.toFixed(1)}%`} accent="text-amber-400" />
      </div>

      {/* Filtros + busca + criar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Filtros de status só fazem sentido no modo Tabela — Kanban já mostra
            todas as colunas lado a lado, filtrar esconde colunas inteiras. */}
        {viewMode === "table" && (
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
        )}
        <div className="flex-1 min-w-[180px] relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone ou email…"
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900/60 border border-slate-800 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none focus:border-blue-500/60"
          />
        </div>
        {/* Toggle Tabela / Kanban */}
        <div className="flex items-center gap-0.5 rounded-lg border border-slate-800 bg-slate-900/60 p-0.5">
          <button
            onClick={() => changeViewMode("table")}
            className={cn(
              "p-1.5 rounded transition-colors",
              viewMode === "table"
                ? "bg-slate-800 text-blue-400"
                : "text-slate-500 hover:text-slate-300",
            )}
            title="Tabela"
          >
            <List size={14} />
          </button>
          <button
            onClick={() => changeViewMode("kanban")}
            className={cn(
              "p-1.5 rounded transition-colors",
              viewMode === "kanban"
                ? "bg-slate-800 text-blue-400"
                : "text-slate-500 hover:text-slate-300",
            )}
            title="Kanban"
          >
            <LayoutGrid size={14} />
          </button>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
        >
          <Plus size={14} />
          Novo lead
        </button>
      </div>

      {/* Tabela ou Kanban */}
      {loading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : leads.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center">
          <p className="text-slate-400 text-sm">
            Nenhum lead {filterStatus !== "all" && viewMode === "table" ? "neste status " : ""}ainda.
          </p>
          <p className="text-slate-500 text-xs mt-1">Clique em <strong>Novo lead</strong> para cadastrar.</p>
        </div>
      ) : viewMode === "kanban" ? (
        <KanbanBoard leads={leads} onCardClick={(l) => setEditing(l)} />
      ) : (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-slate-800 bg-slate-900/40">
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Contato</th>
                  <th className="px-4 py-3">Origem</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Venda</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => setEditing(lead)}
                    className="border-b border-slate-800/50 hover:bg-slate-900/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-slate-200 font-medium">{lead.name}</td>
                    <td className="px-4 py-3 text-slate-400">
                      <div className="flex flex-col gap-0.5">
                        {lead.phone && (
                          <span className="flex items-center gap-1"><Phone size={10} />{lead.phone}</span>
                        )}
                        {lead.email && (
                          <span className="flex items-center gap-1"><Mail size={10} />{lead.email}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400">
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
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {canDelete && (
                        <button
                          onClick={async () => {
                            if (!confirm(`Deletar lead "${lead.name}"?`)) return;
                            await fetch(`/api/workspaces/${workspaceId}/leads/${lead.id}`, { method: "DELETE" });
                            loadLeads();
                          }}
                          className="p-1.5 rounded text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Deletar"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && (
        <LeadFormModal
          workspaceId={workspaceId}
          sources={sources}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); loadLeads(); }}
        />
      )}
      {editing && (
        <LeadFormModal
          workspaceId={workspaceId}
          sources={sources}
          lead={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadLeads(); }}
        />
      )}
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

interface LeadFormModalProps {
  workspaceId: string;
  sources: string[];
  lead?: Lead;
  onClose: () => void;
  onSaved: () => void;
}

function LeadFormModal({ workspaceId, sources, lead, onClose, onSaved }: LeadFormModalProps) {
  const isEditing = !!lead;
  const [name, setName] = useState(lead?.name ?? "");
  const [phone, setPhone] = useState(lead?.phone ?? "");
  const [email, setEmail] = useState(lead?.email ?? "");
  const [source, setSource] = useState(lead?.source ?? "");
  const [notes, setNotes] = useState(lead?.notes ?? "");
  const [status, setStatus] = useState<LeadStatus>(lead?.status ?? "novo");
  const [saleValue, setSaleValue] = useState<string>(lead?.saleValue ? String(lead.saleValue) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    if (!name.trim()) {
      setError("Nome é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name,
        phone: phone || null,
        email: email || null,
        source: source || null,
        notes: notes || null,
        status,
        saleValue: status === "vendido" && saleValue ? Number(saleValue) : null,
      };
      const url = isEditing
        ? `/api/workspaces/${workspaceId}/leads/${lead!.id}`
        : `/api/workspaces/${workspaceId}/leads`;
      const r = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setError(data.error || "Erro ao salvar");
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-950 border border-slate-700 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-slate-950 border-b border-slate-800 px-5 py-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-white">{isEditing ? "Editar lead" : "Novo lead"}</h2>
          <button onClick={onClose} className="p-1 rounded text-slate-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <Field label="Nome *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefone">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </Field>
            <Field label="Email">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </Field>
          </div>

          <Field label="Origem">
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">— Selecione —</option>
              {/* Tags configuráveis pelo dono do workspace em /workspaces/[id].
                  Default: Meta, Google Ads, Indicação. Sempre inclui "Outro"
                  pra permitir cadastro com origem livre. */}
              {sources.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
              <option value="Outro">Outro</option>
            </select>
          </Field>

          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as LeadStatus)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="novo">Novo</option>
              <option value="contato">Em contato</option>
              <option value="negociando">Negociando</option>
              <option value="vendido">Vendido</option>
              <option value="perdido">Perdido</option>
            </select>
          </Field>

          {status === "vendido" && (
            <Field label="Valor da venda (R$)">
              <input
                type="number"
                step="0.01"
                value={saleValue}
                onChange={(e) => setSaleValue(e.target.value)}
                placeholder="0,00"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </Field>
          )}

          <Field label="Observações">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
            />
          </Field>

          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="sticky bottom-0 bg-slate-950 border-t border-slate-800 px-5 py-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
          >
            {saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Cadastrar lead"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

// ─── Kanban Board ────────────────────────────────────────────────────────────

const KANBAN_COLUMNS: { id: LeadStatus; label: string; accent: string }[] = [
  { id: "novo", label: "Novos", accent: "border-blue-500/30 bg-blue-500/5" },
  { id: "contato", label: "Em contato", accent: "border-amber-500/30 bg-amber-500/5" },
  { id: "negociando", label: "Negociando", accent: "border-purple-500/30 bg-purple-500/5" },
  { id: "vendido", label: "Vendidos", accent: "border-emerald-500/30 bg-emerald-500/5" },
  { id: "perdido", label: "Perdidos", accent: "border-rose-500/30 bg-rose-500/5" },
];

function KanbanBoard({
  leads,
  onCardClick,
}: {
  leads: Lead[];
  onCardClick: (l: Lead) => void;
}) {
  const byStatus = KANBAN_COLUMNS.map((col) => ({
    ...col,
    leads: leads.filter((l) => l.status === col.id),
  }));

  return (
    // Scroll horizontal em mobile/tablet, full width em desktop. Min width
    // garante que cada coluna respira (não fica mais estreita que ~240px).
    <div className="overflow-x-auto pb-2 -mx-3 sm:-mx-6 px-3 sm:px-6">
      <div className="flex gap-3 sm:gap-4" style={{ minWidth: `${KANBAN_COLUMNS.length * 260}px` }}>
        {byStatus.map((col) => {
          const total = col.leads.length;
          const colFat = col.id === "vendido"
            ? col.leads.reduce((s, l) => s + (l.saleValue ?? 0), 0)
            : 0;
          return (
            <div
              key={col.id}
              className={cn(
                "flex-1 min-w-[240px] rounded-xl border bg-slate-900/40 p-3 flex flex-col",
                col.accent,
              )}
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-200">
                    {col.label}
                  </h3>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded-full">
                    {total}
                  </span>
                </div>
                {col.id === "vendido" && colFat > 0 && (
                  <span className="text-[10px] font-bold text-emerald-400">
                    {formatCurrency(colFat)}
                  </span>
                )}
              </div>

              {col.leads.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-8 text-[10px] text-slate-600 font-bold uppercase tracking-widest text-center">
                  Sem leads
                </div>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto no-scrollbar">
                  {col.leads.map((lead) => (
                    <button
                      key={lead.id}
                      onClick={() => onCardClick(lead)}
                      className="w-full text-left p-2.5 rounded-lg border border-slate-700/50 bg-slate-800/40 hover:border-slate-600/70 hover:bg-slate-800/60 transition-colors group"
                    >
                      <p className="text-xs font-bold text-slate-100 mb-1 truncate group-hover:text-blue-400 transition-colors">
                        {lead.name}
                      </p>
                      {(lead.phone || lead.email) && (
                        <p className="text-[10px] text-slate-500 truncate">
                          {lead.phone ?? lead.email}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-1.5 gap-2">
                        {lead.source ? (
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider truncate">
                            {lead.source}
                          </span>
                        ) : <span />}
                        {lead.saleValue ? (
                          <span className="text-[10px] font-bold text-emerald-400 shrink-0">
                            {formatCurrency(lead.saleValue)}
                          </span>
                        ) : (
                          <span className="text-[9px] text-slate-600">
                            {new Date(lead.createdAt).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
