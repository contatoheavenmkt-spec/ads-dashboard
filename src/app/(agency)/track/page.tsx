"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, Clock, MessageSquare, MousePointerClick,
  TriangleAlert, TrendingUp, Users, XCircle,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { cn, formatCurrency } from "@/lib/utils";
import { TableSkeleton } from "@/components/ui/skeleton";
import { AbasTrack } from "./_components/abas";

interface WorkspaceRef { id: string; name: string; slug: string }

interface Conversa {
  id: string;
  contactName: string | null;
  contactKey: string;
  stage: string;
  matchType: string;
  matchConfidence: string;
  source: string;
  campaignId: string | null;
  gclid: string | null;
  firstMessageAt: string;
  lastMessageAt: string;
  inboundCount: number;
  outboundCount: number;
  saleValue: number | null;
  workspace: { id: string; name: string };
  instance: { label: string };
}

interface Funil {
  cliques: number;
  lead: number;
  respondeu: number;
  qualificado: number;
  venda: number;
  perdido: number;
  faturamento: number;
  taxaCasamento: number;
}

const PILL: Record<string, { bg: string; text: string; label: string }> = {
  lead: { bg: "bg-slate-500/15 border-slate-500/30", text: "text-slate-300", label: "Lead" },
  respondeu: { bg: "bg-blue-500/15 border-blue-500/30", text: "text-blue-400", label: "Respondeu" },
  qualificado: { bg: "bg-amber-500/15 border-amber-500/30", text: "text-amber-400", label: "Qualificado" },
  venda: { bg: "bg-emerald-500/15 border-emerald-500/30", text: "text-emerald-400", label: "Venda" },
  perdido: { bg: "bg-red-500/15 border-red-500/30", text: "text-red-400", label: "Perdido" },
};

const ORIGEM: Record<string, string> = {
  code: "Código na mensagem",
  ctwa: "Anúncio do Meta",
  proximity: "Por proximidade",
  manual: "Manual",
  none: "Sem atribuição",
};

function telefone(d: string): string {
  if (!d.startsWith("55") || d.length < 12) return d;
  const ddd = d.slice(2, 4);
  const r = d.slice(4);
  return r.length === 9 ? `(${ddd}) ${r.slice(0, 5)}-${r.slice(5)}` : `(${ddd}) ${r.slice(0, 4)}-${r.slice(4)}`;
}

export default function TrackVisaoGeral() {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[]>([]);
  const [funil, setFunil] = useState<Funil | null>(null);
  const [envios, setEnvios] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [ws, setWs] = useState("all");
  const [dias, setDias] = useState(30);
  const [stage, setStage] = useState("all");

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ dias: String(dias) });
      if (ws !== "all") q.set("workspaceId", ws);
      if (stage !== "all") q.set("stage", stage);
      const res = await fetch(`/api/agency/track/conversas?${q}`);
      const data = await res.json();
      setConversas(data.conversas ?? []);
      setWorkspaces(data.workspaces ?? []);
      setFunil(data.funil ?? null);
      setEnvios(data.envios ?? {});
    } finally {
      setLoading(false);
    }
  }, [ws, dias, stage]);

  useEffect(() => { void carregar(); }, [carregar]);

  const etapas = useMemo(() => {
    if (!funil) return [];
    return [
      { id: "cliques", label: "Cliques no anúncio", valor: funil.cliques, cor: "bg-cyan-500", icone: MousePointerClick },
      { id: "lead", label: "Viraram conversa", valor: funil.lead, cor: "bg-slate-400", icone: MessageSquare },
      { id: "respondeu", label: "Engajaram", valor: funil.respondeu, cor: "bg-blue-500", icone: Users },
      { id: "qualificado", label: "Qualificados", valor: funil.qualificado, cor: "bg-amber-500", icone: Clock },
      { id: "venda", label: "Vendas", valor: funil.venda, cor: "bg-emerald-500", icone: CheckCircle2 },
    ];
  }, [funil]);

  const maior = etapas[0]?.valor ?? 1;

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <Header title="Track" subtitle="Do clique no anúncio até a venda no WhatsApp" />
      <AbasTrack />

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:space-y-6 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={ws}
            onChange={(e) => setWs(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-300 focus:border-cyan-500/60 focus:outline-none"
          >
            <option value="all">Todos os clientes</option>
            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
            className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-300 focus:border-cyan-500/60 focus:outline-none"
          >
            {[7, 15, 30, 60, 90].map((d) => <option key={d} value={d}>Últimos {d} dias</option>)}
          </select>
          <div className="flex-1" />
          {envios.failed ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold text-red-300">
              <XCircle size={12} />
              {envios.failed} conversão(ões) não subiram
            </span>
          ) : null}
          {envios.pending ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold text-amber-300">
              <Clock size={12} />
              {envios.pending} na fila
            </span>
          ) : null}
          {envios.sent ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-300">
              <CheckCircle2 size={12} />
              {envios.sent} enviadas ao Google
            </span>
          ) : null}
        </div>

        {loading && !funil ? (
          <TableSkeleton rows={6} cols={5} />
        ) : !funil || funil.cliques + funil.lead === 0 ? (
          <VazioInicial />
        ) : (
          <>
            <div className="glass-panel rounded-2xl p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-200">
                <TrendingUp size={14} className="text-cyan-400" />
                Funil
                <span className="ml-auto text-xs font-normal text-slate-500">
                  {formatCurrency(funil.faturamento)} em vendas registradas
                </span>
              </h2>
              <div className="space-y-2.5">
                {etapas.map((e, i) => {
                  const anterior = i > 0 ? etapas[i - 1].valor : null;
                  const conv = anterior && anterior > 0 ? (e.valor / anterior) * 100 : null;
                  const Icone = e.icone;
                  return (
                    <div key={e.id} className="flex items-center gap-3">
                      <div className="flex w-40 shrink-0 items-center gap-1.5 text-xs text-slate-400">
                        <Icone size={12} className="shrink-0" />
                        {e.label}
                      </div>
                      <div className="h-7 flex-1 overflow-hidden rounded-lg bg-slate-900/60">
                        <div
                          className={cn("flex h-full items-center px-2.5 transition-all", e.cor)}
                          style={{ width: `${maior > 0 ? Math.max((e.valor / maior) * 100, e.valor > 0 ? 6 : 0) : 0}%` }}
                        >
                          <span className="text-[11px] font-bold text-slate-950">{e.valor}</span>
                        </div>
                      </div>
                      <div className="w-16 shrink-0 text-right text-[11px] text-slate-500">
                        {conv !== null ? `${conv.toFixed(0)}%` : ""}
                      </div>
                    </div>
                  );
                })}
              </div>

              {funil.cliques >= 10 && funil.taxaCasamento < 40 ? (
                <p className="mt-4 flex items-start gap-1.5 border-t border-slate-800 pt-3 text-[11px] text-amber-300">
                  <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                  Só {funil.taxaCasamento.toFixed(0)}% dos cliques viraram conversa rastreada. Costuma ser
                  gente apagando a mensagem pronta antes de enviar: uma mensagem mais curta melhora isso.
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {["all", "lead", "respondeu", "qualificado", "venda", "perdido"].map((s) => (
                <button
                  key={s}
                  onClick={() => setStage(s)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors",
                    stage === s
                      ? "border-slate-600 bg-slate-800 text-white"
                      : "border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-800",
                  )}
                >
                  {s === "all" ? "Todas" : PILL[s]?.label ?? s}
                </button>
              ))}
            </div>

            {loading ? (
              <TableSkeleton rows={5} cols={6} />
            ) : conversas.length === 0 ? (
              <div className="glass-panel rounded-2xl p-10 text-center text-sm text-slate-400">
                Nenhuma conversa neste filtro.
              </div>
            ) : (
              <div className="glass-panel overflow-hidden rounded-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-slate-800 bg-slate-900/40">
                      <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="px-4 py-3">Cliente</th>
                        <th className="px-4 py-3">Contato</th>
                        <th className="px-4 py-3">Origem</th>
                        <th className="px-4 py-3">Estágio</th>
                        <th className="px-4 py-3 text-right">Msgs</th>
                        <th className="px-4 py-3 text-right">Venda</th>
                        <th className="px-4 py-3">Última</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {conversas.map((c) => {
                        const pill = PILL[c.stage] ?? PILL.lead;
                        return (
                          <tr key={c.id} className="hover:bg-slate-900/40">
                            <td className="px-4 py-3 text-slate-400">{c.workspace.name}</td>
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-200">{c.contactName || "Sem nome"}</p>
                              <p className="text-[11px] text-slate-500">{telefone(c.contactKey)}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-slate-300">{ORIGEM[c.matchType] ?? c.matchType}</span>
                              {c.matchConfidence === "low" ? (
                                <span
                                  className="ml-1.5 inline-flex items-center gap-1 text-[10px] text-amber-500"
                                  title="Atribuição por proximidade: não é enviada ao Google automaticamente"
                                >
                                  <TriangleAlert size={9} />
                                  baixa
                                </span>
                              ) : null}
                              {c.campaignId ? (
                                <p className="text-[10px] text-slate-600">campanha {c.campaignId}</p>
                              ) : null}
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", pill.bg, pill.text)}>
                                {pill.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-slate-400">
                              {c.inboundCount}/{c.outboundCount}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-emerald-400">
                              {c.saleValue ? formatCurrency(c.saleValue) : <span className="text-slate-600">-</span>}
                            </td>
                            <td className="px-4 py-3 text-slate-500">
                              {new Date(c.lastMessageAt).toLocaleDateString("pt-BR")}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function VazioInicial() {
  return (
    <div className="glass-panel rounded-2xl p-12 text-center">
      <MousePointerClick size={28} className="mx-auto mb-3 text-slate-600" />
      <p className="text-sm text-slate-300">Nenhum dado ainda.</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-500">
        Para o Track começar a medir, faltam três passos: criar um link de rastreio e usá-lo como
        URL final do anúncio, conectar o WhatsApp que atende, e dizer qual etiqueta significa venda.
      </p>
      <div className="mt-4 flex items-center justify-center gap-2">
        <a href="/track/links" className="rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-500">
          Criar link
        </a>
        <a href="/track/whatsapp" className="rounded-lg border border-slate-700 px-3.5 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800">
          Conectar WhatsApp
        </a>
      </div>
    </div>
  );
}
