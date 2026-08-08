"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2, ExternalLink, Loader2, RefreshCw, Send,
  TriangleAlert, Upload, X,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { cn, formatCurrency } from "@/lib/utils";
import { AbasTrack } from "../_components/abas";

interface WorkspaceRef { id: string; name: string }
interface Conta { adAccountId: string; name: string; loginCustomerId: string | null }
interface Acao { id: string; name: string; type: string; status: string; usavel: boolean }

interface Destino {
  id: string;
  stage: string;
  platform: string;
  enabled: boolean;
  conversionActionId: string | null;
  conversionActionName: string | null;
  customerId: string | null;
  sendValue: boolean;
  defaultValue: number | null;
}

const ESTAGIOS: { id: string; nome: string; ajuda: string }[] = [
  {
    id: "respondeu",
    nome: "Lead respondido",
    ajuda: "A conversa engatou: o lead voltou depois do atendente responder. Serve para o Google aprender a trazer gente que conversa, não só quem clica.",
  },
  {
    id: "qualificado",
    nome: "Lead qualificado",
    ajuda: "O atendente marcou como qualificado, por etiqueta ou pela frase combinada.",
  },
  {
    id: "venda",
    nome: "Venda",
    ajuda: "A etiqueta de pago entrou na conversa. É o sinal mais valioso: com ele o Google otimiza por faturamento, não por volume.",
  },
];

export default function TrackDestinos() {
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[]>([]);
  const [ws, setWs] = useState("");
  const [destinos, setDestinos] = useState<Destino[]>([]);
  const [acoes, setAcoes] = useState<Acao[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [contaDeConversao, setContaDeConversao] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [buscandoAcoes, setBuscandoAcoes] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async (workspaceId: string, comAcoes = false) => {
    setLoading(true);
    if (comAcoes) setBuscandoAcoes(true);
    try {
      const q = new URLSearchParams();
      if (workspaceId) q.set("workspaceId", workspaceId);
      if (comAcoes) q.set("acoes", "1");
      const res = await fetch(`/api/agency/track/destinos?${q}`);
      const data = await res.json();
      setWorkspaces(data.workspaces ?? []);
      setDestinos(data.destinos ?? []);
      setContas(data.contas ?? []);
      if (comAcoes) {
        setAcoes(data.acoes ?? []);
        setAviso(data.avisoAcoes ?? null);
        setContaDeConversao(data.contaDeConversao ?? null);
      }
      if (!workspaceId && data.workspaces?.[0]) setWs(data.workspaces[0].id);
    } catch {
      setErro("Não consegui carregar a configuração.");
    } finally {
      setLoading(false);
      setBuscandoAcoes(false);
    }
  }, []);

  useEffect(() => { void carregar(ws); }, [carregar, ws]);

  async function salvar(stage: string, mudanca: Partial<Destino>) {
    const atual = destinos.find((d) => d.stage === stage);
    const conta = contas[0];
    setSalvando(stage);
    setErro(null);
    setRecado(null);
    try {
      const res = await fetch("/api/agency/track/destinos", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: ws,
          stage,
          enabled: mudanca.enabled ?? atual?.enabled ?? false,
          conversionActionId: mudanca.conversionActionId ?? atual?.conversionActionId ?? null,
          conversionActionName: mudanca.conversionActionName ?? atual?.conversionActionName ?? null,
          customerId: contaDeConversao ?? conta?.adAccountId ?? null,
          loginCustomerId: conta?.loginCustomerId ?? null,
          sendValue: mudanca.sendValue ?? atual?.sendValue ?? false,
          defaultValue: mudanca.defaultValue ?? atual?.defaultValue ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar");
      setDestinos((ds) => {
        const outros = ds.filter((d) => d.stage !== stage);
        return [...outros, data.destino];
      });
      if (data.pendentesParaBackfill > 0) {
        setRecado(
          `${data.pendentesParaBackfill} evento(s) que já aconteceram entraram na fila e sobem na próxima passada do envio (até 5 minutos).`,
        );
      }
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(null);
    }
  }

  const usaveis = acoes.filter((a) => a.usavel);

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <Header title="Track" subtitle="Para onde cada etapa do funil é enviada" />
      <AbasTrack />

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {erro ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span className="flex-1">{erro}</span>
            <button onClick={() => setErro(null)}><X size={14} /></button>
          </div>
        ) : null}
        {recado ? (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
            <span className="flex-1">{recado}</span>
            <button onClick={() => setRecado(null)}><X size={14} /></button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={ws}
            onChange={(e) => { setWs(e.target.value); setAcoes([]); setAviso(null); }}
            className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-300 focus:border-cyan-500/60 focus:outline-none"
          >
            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <button
            onClick={() => carregar(ws, true)}
            disabled={buscandoAcoes || contas.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          >
            {buscandoAcoes ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Buscar ações de conversão
          </button>
        </div>

        {contas.length === 0 && !loading ? (
          <div className="glass-panel rounded-2xl p-10 text-center">
            <p className="text-sm text-slate-300">Este cliente não tem conta do Google Ads ligada.</p>
            <p className="mt-1 text-xs text-slate-500">
              Conecte em Integrações antes de configurar o envio de conversões.
            </p>
          </div>
        ) : null}

        {aviso ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <p>{aviso}</p>
              <a
                href="https://ads.google.com/aw/conversions"
                target="_blank"
                rel="noreferrer noopener"
                className="mt-1.5 inline-flex items-center gap-1 font-semibold text-amber-300 hover:text-amber-200"
              >
                Abrir Conversões no Google Ads <ExternalLink size={11} />
              </a>
            </div>
          </div>
        ) : null}

        {/* Explica de uma vez o que a tela pede, porque "importação de cliques"
            não é óbvio para quem não vive dentro do Google Ads. */}
        <div className="glass-panel rounded-2xl p-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-200">
            <Upload size={14} className="text-cyan-400" />
            Antes de ligar
          </h2>
          <p className="text-xs leading-relaxed text-slate-400">
            No Google Ads, a ação que recebe venda vinda de fora precisa ser do tipo
            <span className="text-slate-200"> Importação de cliques</span> (Ferramentas &gt;
            Conversões &gt; Nova &gt; Importar &gt; Cliques). Uma ação normal de tag do site
            recusa o envio, e o erro só apareceria horas depois, quando a venda já tivesse
            acontecido. Por isso a lista abaixo mostra só as que servem.
          </p>
          {contaDeConversao ? (
            <p className="mt-2 text-[11px] text-slate-500">
              As conversões vão para a conta <span className="font-mono text-slate-400">{contaDeConversao}</span>,
              que é a conta de conversão resolvida para este cliente.
            </p>
          ) : null}
        </div>

        {loading && destinos.length === 0 ? (
          <div className="glass-panel rounded-2xl p-10 text-center">
            <Loader2 className="mx-auto animate-spin text-slate-600" size={20} />
          </div>
        ) : (
          <div className="space-y-3">
            {ESTAGIOS.map((et) => {
              const d = destinos.find((x) => x.stage === et.id);
              const ligado = d?.enabled ?? false;
              return (
                <div key={et.id} className="glass-panel rounded-2xl p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-200">{et.nome}</h3>
                        {ligado ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                            <Send size={9} /> Enviando
                          </span>
                        ) : (
                          <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                            Desligado
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{et.ajuda}</p>
                    </div>
                    <button
                      onClick={() => salvar(et.id, { enabled: !ligado })}
                      disabled={salvando === et.id || (!ligado && !d?.conversionActionId)}
                      title={!ligado && !d?.conversionActionId ? "Escolha a ação de conversão primeiro" : ""}
                      className={cn(
                        "shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                        ligado
                          ? "border border-slate-700 text-slate-300 hover:bg-slate-800"
                          : "bg-emerald-600 text-white hover:bg-emerald-500",
                      )}
                    >
                      {salvando === et.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : ligado ? "Desligar" : "Ligar envio"}
                    </button>
                  </div>

                  <div className="mt-4 space-y-3 border-t border-slate-800 pt-4">
                    <div>
                      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Ação de conversão no Google Ads
                      </label>
                      {usaveis.length > 0 ? (
                        <select
                          value={d?.conversionActionId ?? ""}
                          onChange={(e) => {
                            const acao = usaveis.find((a) => a.id === e.target.value);
                            void salvar(et.id, {
                              conversionActionId: acao?.id ?? null,
                              conversionActionName: acao?.name ?? null,
                            });
                          }}
                          className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 focus:border-cyan-500/60 focus:outline-none"
                        >
                          <option value="">Escolha uma ação</option>
                          {usaveis.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-[11px] text-slate-500">
                          {d?.conversionActionName
                            ? `Configurada: ${d.conversionActionName}`
                            : "Clique em \"Buscar ações de conversão\" para listar as da conta."}
                        </p>
                      )}
                    </div>

                    {et.id === "venda" ? (
                      <div className="flex flex-wrap items-end gap-4">
                        <label className="flex items-center gap-2 text-xs text-slate-400">
                          <input
                            type="checkbox"
                            checked={d?.sendValue ?? false}
                            onChange={(e) => void salvar(et.id, { sendValue: e.target.checked })}
                            className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-900"
                          />
                          Enviar o valor da venda junto
                        </label>
                        {d?.sendValue ? (
                          <p className="text-[11px] text-slate-500">
                            Sem valor na conversa, sobe o padrão definido nas Regras
                            {d.defaultValue ? ` (${formatCurrency(d.defaultValue)})` : ""}.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
