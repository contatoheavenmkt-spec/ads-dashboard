"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, Filter, ChevronRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface Account {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  subscription: { plan: string; status: string; trialEndsAt: string | null; currentPeriodEnd: string | null } | null;
  _count: { metaConnections: number; googleConnections: number };
}

const PLAN_COLORS: Record<string, string> = {
  trial: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  start: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  plus: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  premium: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
};
const STATUS_COLORS: Record<string, string> = {
  active: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  trialing: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  expired: "text-red-400 bg-red-500/10 border-red-500/20",
  canceled: "text-slate-400 bg-slate-700/50 border-slate-600/50",
};

function Badge({ text, color }: { text: string; color?: string }) {
  return (
    <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide", color ?? "text-slate-400 bg-slate-800 border-slate-700")}>
      {text}
    </span>
  );
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
    if (search) params.set("search", search);
    if (plan) params.set("plan", plan);
    if (status) params.set("status", status);
    const res = await fetch(`/api/admin/accounts?${params}`).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setAccounts(data.users);
      setTotal(data.total);
    }
    setLoading(false);
  }, [search, plan, status, offset]);

  useEffect(() => { setOffset(0); }, [search, plan, status]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <Users size={20} className="text-blue-400" />
            Contas
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} usuários cadastrados</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por email ou nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-all"
          />
        </div>
        <div className="relative">
          <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="bg-slate-800/60 border border-slate-700/60 rounded-xl pl-8 pr-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-blue-500/50 transition-all appearance-none"
          >
            <option value="">Todos os planos</option>
            <option value="trial">Trial</option>
            <option value="start">Start</option>
            <option value="plus">Plus</option>
            <option value="premium">Premium</option>
          </select>
        </div>
        <div className="relative">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-blue-500/50 transition-all appearance-none"
          >
            <option value="">Todos os status</option>
            <option value="active">Ativo</option>
            <option value="trialing">Trial</option>
            <option value="expired">Expirado</option>
            <option value="canceled">Cancelado</option>
          </select>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-slate-800/50 border-b border-slate-700/50">
            <tr>
              {["Usuário", "Plano", "Status", "Integrações", "Cadastro", ""].map((h) => (
                <th key={h} className="px-5 py-3.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-600 text-sm">Carregando...</td></tr>
            ) : accounts.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-600 text-sm">Nenhuma conta encontrada</td></tr>
            ) : accounts.map((acc) => (
              <tr key={acc.id} className="hover:bg-slate-800/30 transition-colors group">
                <td className="px-5 py-3.5">
                  <p className="font-semibold text-white">{acc.name ?? "—"}</p>
                  <p className="text-[11px] text-slate-500">{acc.email}</p>
                </td>
                <td className="px-5 py-3.5">
                  <Badge text={acc.subscription?.plan ?? "sem plano"} color={PLAN_COLORS[acc.subscription?.plan ?? ""] ?? "text-slate-400 bg-slate-800 border-slate-700"} />
                </td>
                <td className="px-5 py-3.5">
                  <Badge text={acc.subscription?.status ?? "—"} color={STATUS_COLORS[acc.subscription?.status ?? ""] ?? "text-slate-400 bg-slate-800 border-slate-700"} />
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    {acc._count.metaConnections > 0 && (
                      <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded-md font-bold">
                        Meta ×{acc._count.metaConnections}
                      </span>
                    )}
                    {acc._count.googleConnections > 0 && (
                      <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-1.5 py-0.5 rounded-md font-bold">
                        Google ×{acc._count.googleConnections}
                      </span>
                    )}
                    {acc._count.metaConnections === 0 && acc._count.googleConnections === 0 && (
                      <span className="text-slate-700">Nenhuma</span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3.5 text-[11px] text-slate-400">
                  {new Date(acc.createdAt).toLocaleDateString("pt-BR")}
                </td>
                <td className="px-5 py-3.5">
                  <a
                    href={`/admin/accounts/${acc.id}`}
                    className="flex items-center gap-1 text-[11px] text-slate-600 group-hover:text-blue-400 transition-colors font-medium"
                  >
                    Ver <ChevronRight size={13} />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {total > LIMIT && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>Mostrando {offset + 1}–{Math.min(offset + LIMIT, total)} de {total}</span>
          <div className="flex gap-2">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium"
            >
              Anterior
            </button>
            <button
              disabled={offset + LIMIT >= total}
              onClick={() => setOffset(offset + LIMIT)}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
