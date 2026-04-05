"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { ArrowLeft, CheckCircle2, Loader2, Plus } from "lucide-react";

interface Integration {
  id: string;
  name: string;
  platform: string;
  adAccountId: string;
  bmName: string | null;
}

export default function NovoWorkspacePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [logo, setLogo] = useState("");
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/integrations").then((r) => r.json()).then(setIntegrations);
  }, []);

  function toggleAccount(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Nome do cliente é obrigatório");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, logo, integrationIds: selected }),
    });
    if (res.ok) {
      router.push("/workspaces");
    } else {
      const data = await res.json();
      setError(data.error ?? "Erro ao criar workspace");
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header title="Novo Cliente" subtitle="Crie um workspace para um novo cliente" />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-5">

          <Link href="/workspaces">
            <button className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-xs font-bold uppercase tracking-wider transition-colors mb-2">
              <ArrowLeft size={14} />
              Voltar
            </button>
          </Link>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Informações */}
            <div className="glass-panel rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
                <h2 className="text-xs font-black text-slate-200 uppercase tracking-widest">Informações do Cliente</h2>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nome do Cliente *</label>
                <input
                  placeholder="Ex: Loja de Roupas Fashion"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">URL do Logo (opcional)</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={logo}
                  onChange={(e) => setLogo(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none transition-colors"
                />
                {logo && (
                  <div className="flex items-center gap-3 mt-2 p-3 bg-slate-800/40 rounded-xl border border-slate-700/50">
                    <img src={logo} alt="Preview" className="w-10 h-10 rounded-lg object-cover border border-slate-700" />
                    <span className="text-xs text-slate-400">Preview do logo</span>
                  </div>
                )}
              </div>
            </div>

            {/* Contas */}
            <div className="glass-panel rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.8)]" />
                  <h2 className="text-xs font-black text-slate-200 uppercase tracking-widest">Contas de Anúncio</h2>
                </div>
                {selected.length > 0 && (
                  <span className="text-[9px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20 uppercase">
                    {selected.length} selecionada{selected.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {integrations.length === 0 ? (
                <div className="flex flex-col items-center py-10 gap-4">
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Nenhuma conta conectada ainda</p>
                  <Link href="/integracoes">
                    <button type="button" className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all">
                      <Plus size={12} />
                      Conectar contas
                    </button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {integrations.map((int) => {
                    const isSelected = selected.includes(int.id);
                    return (
                      <div
                        key={int.id}
                        onClick={() => toggleAccount(int.id)}
                        className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? "border-blue-500/60 bg-blue-500/10"
                            : "border-slate-700/50 bg-slate-800/40 hover:border-slate-600/60"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center border text-xs font-black ${
                            isSelected
                              ? "bg-blue-600/20 border-blue-500/30 text-blue-400"
                              : "bg-slate-800 border-slate-700 text-slate-400"
                          }`}>
                            {int.platform.slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-100">{int.name}</p>
                            <p className="text-[10px] text-slate-500">{int.bmName ?? int.adAccountId}</p>
                          </div>
                        </div>
                        {isSelected && <CheckCircle2 size={16} className="text-blue-400 shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {error && (
              <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-4 py-3 rounded-xl">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all active:scale-95 shadow-lg shadow-blue-500/20"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {saving ? "Criando..." : "Criar Workspace"}
              </button>
              <Link href="/workspaces">
                <button type="button" className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all active:scale-95">
                  Cancelar
                </button>
              </Link>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}
