"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import {
  BarChart3,
  ExternalLink,
  Loader2,
  Plus,
  Settings,
  Users,
} from "lucide-react";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  publicAccess: boolean;
  createdAt: string;
  integrations: Array<{
    integration: { id: string; name: string; platform: string };
  }>;
  clients: Array<{ id: string; email: string }>;
}

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then(setWorkspaces)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header
        title="Clientes"
        subtitle="Gerencie os workspaces e dashboards dos seus clientes"
      />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Topbar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
              {workspaces.length} workspace{workspaces.length !== 1 ? "s" : ""} criado{workspaces.length !== 1 ? "s" : ""}
            </span>
          </div>
          <Link href="/workspaces/novo">
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all active:scale-95 shadow-lg shadow-blue-500/20">
              <Plus size={14} />
              Novo Cliente
            </button>
          </Link>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-24 gap-3 text-slate-500">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-xs font-bold uppercase tracking-wider">Carregando clientes...</span>
          </div>

        ) : workspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-5 text-center">
            <div className="w-20 h-20 bg-slate-800/80 rounded-3xl flex items-center justify-center border border-slate-700/50">
              <Users size={32} className="text-slate-500" />
            </div>
            <div>
              <p className="font-black text-slate-100 text-base mb-1.5 uppercase tracking-tight">Nenhum cliente criado</p>
              <p className="text-xs text-slate-400 max-w-xs">
                Crie um workspace para cada cliente e vincule as contas de anúncios
              </p>
            </div>
            <Link href="/workspaces/novo">
              <button className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all active:scale-95">
                <Plus size={14} />
                Criar primeiro cliente
              </button>
            </Link>
          </div>

        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {workspaces.map((ws) => (
              <div
                key={ws.id}
                className="glass-panel rounded-2xl p-5 flex flex-col gap-4 hover:border-slate-600/60 transition-all group"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {ws.logo ? (
                      <img
                        src={ws.logo}
                        alt={ws.name}
                        className="w-11 h-11 rounded-xl object-cover border border-slate-700/50"
                      />
                    ) : (
                      <div className="w-11 h-11 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-lg shadow-blue-500/20">
                        {ws.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h3 className="font-black text-slate-100 text-sm leading-tight">{ws.name}</h3>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">/{ws.slug}</p>
                    </div>
                  </div>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider ${ws.publicAccess
                    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                    : "text-slate-400 bg-slate-800 border-slate-700"
                    }`}>
                    {ws.publicAccess ? "Público" : "Privado"}
                  </span>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/30 flex items-center gap-2">
                    <BarChart3 size={13} className="text-blue-400 shrink-0" />
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Contas</p>
                      <p className="text-sm font-black text-slate-100">{ws.integrations.length}</p>
                    </div>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/30 flex items-center gap-2">
                    <Users size={13} className="text-purple-400 shrink-0" />
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Usuários</p>
                      <p className="text-sm font-black text-slate-100">{ws.clients.length}</p>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-auto">
                  <Link href={`/workspace/${ws.slug}`} className="flex-1">
                    <button className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 text-slate-300 rounded-xl text-[11px] font-bold transition-all active:scale-95">
                      <BarChart3 size={12} />
                      Ver Dashboard
                    </button>
                  </Link>
                  <Link href={`/workspaces/${ws.id}`}>
                    <button className="p-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 text-slate-400 hover:text-blue-400 rounded-xl transition-all" title="Configurações">
                      <Settings size={14} />
                    </button>
                  </Link>
                  <a href={`/cliente/${ws.slug}`} target="_blank" rel="noopener noreferrer">
                    <button className="p-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 text-slate-400 hover:text-emerald-400 rounded-xl transition-all" title="Abrir link do cliente">
                      <ExternalLink size={14} />
                    </button>
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
