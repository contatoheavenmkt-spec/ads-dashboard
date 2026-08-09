"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Brain, ChevronDown, ChevronRight, Loader2, ShieldCheck,
  Settings, Sparkles, ThumbsDown, TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { cn, formatCurrency } from "@/lib/utils";
import { AbasTrack } from "../_components/abas";

interface WorkspaceRef { id: string; name: string }
interface Politica { workspaceId: string; enabled: boolean; targetCpa: number | null }

interface Sugestao {
  id: string;
  ruleCode: string;
  severity: string;
  status: string;
  scope: string;
  entityName: string;
  campaignId: string | null;
  titulo: string;
  porque: string;
  evidencia: Record<string, unknown> | null;
  impactoEstimado: number | null;
  createdAt: string;
  vencida: boolean;
  workspaceNome: string;
  motivoRejeicao: string | null;
  acao: { tipo?: string } | null;
}

const SEVERIDADE: Record<string, { cor: string; label: string }> = {
  critica: { cor: "border-red-500/40 bg-red-500/10 text-red-300", label: "Crítica" },
  alta: { cor: "border-amber-500/40 bg-amber-500/10 text-amber-300", label: "Alta" },
  media: { cor: "border-blue-500/40 bg-blue-500/10 text-blue-300", label: "Média" },
  baixa: { cor: "border-slate-600 bg-slate-800/60 text-slate-400", label: "Baixa" },
};

const ACAO_LABEL: Record<string, string> = {
  pausar_campanha: "Pausar a campanha",
  pausar_anuncio: "Pausar o anúncio",
  pausar_palavra: "Pausar a palavra-chave",
  negativar_termo: "Adicionar palavra negativa",
  ajustar_orcamento: "Ajustar o orçamento diário",
};

const ROTULO_EVIDENCIA: Record<string, string> = {
  custo: "Custo no período",
  cliques: "Cliques",
  conversoes: "Conversões (Google)",
  conversoesDeclaradas: "Conversões (Google)",
  cpaAtual: "CPA atual",
  cpaReal: "CPA por venda real",
  cpaDeclarado: "CPA no relatório",
  metaCpa: "Meta de CPA",
  leadsReais: "Conversas no WhatsApp",
  vendasReais: "Vendas fechadas",
  vendas: "Vendas fechadas",
  faturamento: "Faturamento",
  qualificados: "Qualificados",
  janelaDias: "Janela analisada (dias)",
  ctr: "CTR do anúncio",
  ctrGrupo: "CTR médio do grupo",
  impressoes: "Impressões",
  perdaPorOrcamento: "Impressões perdidas por orçamento",
  orcamentoAtual: "Orçamento atual",
  orcamentoProposto: "Orçamento proposto",
  termo: "Termo de busca",
  semelhanca: "Semelhança com as palavras",
  mediaWorkspace: "Média de fechamento do cliente",
};

function formatarValor(chave: string, valor: unknown): string {
  if (valor === null || valor === undefined) return "-";
  if (typeof valor === "number") {
    if (["custo", "cpaAtual", "cpaReal", "cpaDeclarado", "metaCpa", "faturamento"].includes(chave)) {
      return formatCurrency(valor);
    }
    if (["orcamentoAtual", "orcamentoProposto"].includes(chave)) {
      return formatCurrency(valor / 1_000_000);
    }
    if (["ctr", "ctrGrupo", "perdaPorOrcamento", "semelhanca", "mediaWorkspace"].includes(chave)) {
      return `${(valor * 100).toFixed(1)}%`;
    }
    return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }
  if (Array.isArray(valor)) return valor.join(", ");
  return String(valor);
}

export default function IaSugestoes() {
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[]>([]);
  const [politicas, setPoliticas] = useState<Politica[]>([]);
  const [loading, setLoading] = useState(true);
  const [ws, setWs] = useState("all");
  const [status, setStatus] = useState("pendente");
  const [aberta, setAberta] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ status });
      if (ws !== "all") q.set("workspaceId", ws);
      const res = await fetch(`/api/agency/ai/sugestoes?${q}`);
      const data = await res.json();
      setSugestoes(data.sugestoes ?? []);
      setWorkspaces(data.workspaces ?? []);
      setPoliticas(data.politicas ?? []);
    } finally {
      setLoading(false);
    }
  }, [ws, status]);

  useEffect(() => { void carregar(); }, [carregar]);

  async function rejeitar(id: string) {
    const motivo = prompt("Por que esta sugestão não faz sentido? (ajuda a calibrar as regras)");
    if (motivo === null) return;
    setOcupada(id);
    try {
      await fetch("/api/agency/ai/sugestoes", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, acao: "rejeitar", motivo }),
      });
      await carregar();
    } finally {
      setOcupada(null);
    }
  }

  const nenhumaLigada = politicas.length === 0 || politicas.every((p) => !p.enabled);
  const totalImpacto = sugestoes.reduce((s, x) => s + (x.impactoEstimado ?? 0), 0);

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <Header title="Track" subtitle="O que a IA encontrou nas campanhas" />
      <AbasTrack />

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {/* Enquanto a escrita não está liberada, a tela precisa dizer isso em
            vez de mostrar um botão de aprovar que não faz nada. */}
        <div className="flex items-start gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-xs text-cyan-200">
          <ShieldCheck size={14} className="mt-0.5 shrink-0" />
          <p>
            <span className="font-semibold">A IA está em modo sugestão.</span> Ela analisa e propõe,
            mas nada é aplicado na conta de anúncios. Acompanhe alguns dias e confira se as propostas
            batem com o que você faria: quando estiver confiante, a gente libera a aplicação com
            aprovação por clique.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={ws}
            onChange={(e) => setWs(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-300 focus:border-cyan-500/60 focus:outline-none"
          >
            <option value="all">Todos os clientes</option>
            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <div className="flex gap-1">
            {[
              { id: "pendente", label: "Pendentes" },
              { id: "rejeitada", label: "Rejeitadas" },
              { id: "expirada", label: "Vencidas" },
              { id: "todas", label: "Todas" },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setStatus(s.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors",
                  status === s.id
                    ? "border-slate-600 bg-slate-800 text-white"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-800",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <Link
            href="/track/ia/config"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-3 py-2 text-[11px] font-semibold text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <Settings size={12} />
            Configurar
          </Link>
          <div className="flex-1" />
          {totalImpacto > 0 ? (
            <span className="text-xs text-slate-400">
              Impacto somado: <span className="font-bold text-emerald-400">{formatCurrency(totalImpacto)}</span>/mês
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className="glass-panel rounded-2xl p-10 text-center">
            <Loader2 className="mx-auto animate-spin text-slate-600" size={20} />
          </div>
        ) : nenhumaLigada ? (
          <div className="glass-panel rounded-2xl p-12 text-center">
            <Brain size={28} className="mx-auto mb-3 text-slate-600" />
            <p className="text-sm text-slate-300">A IA ainda não está ligada para nenhum cliente.</p>
            <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-slate-500">
              Ela cruza o que o Google Ads reporta com as vendas que o Track capturou no WhatsApp,
              e é esse cruzamento que permite dizer coisas como &quot;esta campanha mostra 30
              conversões e não fechou nenhuma venda&quot;.
            </p>
            <Link
              href="/track/ia/config"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500"
            >
              <Settings size={13} />
              Ligar a IA
            </Link>
          </div>
        ) : sugestoes.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center">
            <Sparkles size={28} className="mx-auto mb-3 text-emerald-500/60" />
            <p className="text-sm text-slate-300">Nenhuma sugestão {status === "pendente" ? "pendente" : "neste filtro"}.</p>
            <p className="mt-1 text-xs text-slate-500">
              {status === "pendente"
                ? "Nada gritante nas campanhas analisadas, o que é uma boa notícia."
                : "Mude o filtro para ver outras."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sugestoes.map((s) => {
              const sev = SEVERIDADE[s.severity] ?? SEVERIDADE.baixa;
              const expandida = aberta === s.id;
              return (
                <div key={s.id} className="glass-panel overflow-hidden rounded-2xl">
                  <button
                    onClick={() => setAberta(expandida ? null : s.id)}
                    className="flex w-full items-start gap-3 p-4 text-left hover:bg-slate-900/40"
                  >
                    {expandida ? (
                      <ChevronDown size={14} className="mt-1 shrink-0 text-slate-500" />
                    ) : (
                      <ChevronRight size={14} className="mt-1 shrink-0 text-slate-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", sev.cor)}>
                          {sev.label}
                        </span>
                        <span className="text-[11px] text-slate-500">{s.workspaceNome}</span>
                        {s.vencida && s.status === "pendente" ? (
                          <span className="text-[10px] text-slate-600">(números podem ter mudado)</span>
                        ) : null}
                      </div>
                      <p className="text-sm font-semibold text-slate-200">{s.titulo}</p>
                      {s.acao?.tipo ? (
                        <p className="mt-0.5 text-[11px] text-cyan-400">
                          Proposta: {ACAO_LABEL[s.acao.tipo] ?? s.acao.tipo}
                        </p>
                      ) : null}
                    </div>
                    {s.impactoEstimado ? (
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold text-emerald-400">{formatCurrency(s.impactoEstimado)}</p>
                        <p className="text-[10px] text-slate-500">por mês</p>
                      </div>
                    ) : null}
                  </button>

                  {expandida ? (
                    <div className="border-t border-slate-800 p-4">
                      <p className="text-xs leading-relaxed text-slate-300">{s.porque}</p>

                      {s.evidencia && Object.keys(s.evidencia).length > 0 ? (
                        <div className="mt-3">
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Os números
                          </p>
                          <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                            {Object.entries(s.evidencia).map(([k, v]) => (
                              <div key={k} className="flex justify-between gap-2 border-b border-slate-800/60 py-1">
                                <span className="text-[11px] text-slate-500">{ROTULO_EVIDENCIA[k] ?? k}</span>
                                <span className="text-[11px] font-medium text-slate-300">{formatarValor(k, v)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {s.motivoRejeicao ? (
                        <p className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-[11px] text-slate-400">
                          Rejeitada: {s.motivoRejeicao}
                        </p>
                      ) : null}

                      {s.status === "pendente" ? (
                        <div className="mt-4 flex items-center gap-2">
                          <button
                            onClick={() => rejeitar(s.id)}
                            disabled={ocupada === s.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                          >
                            {ocupada === s.id ? <Loader2 size={13} className="animate-spin" /> : <ThumbsDown size={13} />}
                            Não faz sentido
                          </button>
                          <span className="flex items-center gap-1.5 text-[11px] text-slate-600">
                            <TriangleAlert size={11} />
                            Aplicar na conta ainda não está liberado
                          </span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
