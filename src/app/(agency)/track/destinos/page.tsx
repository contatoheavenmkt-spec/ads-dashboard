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
interface DatasetMeta { id: string; nome: string; origem: string; usavel: boolean }

interface Destino {
  id: string;
  stage: string;
  platform: string;
  enabled: boolean;
  conversionActionId: string | null;
  conversionActionName: string | null;
  customerId: string | null;
  datasetId: string | null;
  eventName: string | null;
  temToken: boolean;
  sendValue: boolean;
  defaultValue: number | null;
}

/** O que o Meta entende melhor em cada etapa do funil. */
const EVENTO_SUGERIDO: Record<string, string> = {
  respondeu: "Contact",
  qualificado: "Lead",
  venda: "Purchase",
};

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
  const [plataforma, setPlataforma] = useState<"google" | "meta">("google");
  const [tokenMeta, setTokenMeta] = useState("");
  const [datasetLocal, setDatasetLocal] = useState("");
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [avisoMeta, setAvisoMeta] = useState<string | null>(null);
  const [temTokenConexao, setTemTokenConexao] = useState(false);
  const [contasMeta, setContasMeta] = useState<Conta[]>([]);
  const [testando, setTestando] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState<{ ok: boolean; erro?: string } | null>(null);
  const [mostrarManual, setMostrarManual] = useState(false);

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
      const comDataset = (data.destinos ?? []).find((d: Destino) => d.platform === "meta" && d.datasetId);
      if (comDataset) setDatasetLocal(comDataset.datasetId ?? "");
      setContas(data.contas ?? []);
      setContasMeta(data.contasMeta ?? []);
      if (comAcoes) {
        setAcoes(data.acoes ?? []);
        setAviso(data.avisoAcoes ?? null);
        setContaDeConversao(data.contaDeConversao ?? null);
        setDatasets(data.datasets ?? []);
        setAvisoMeta(data.avisoMeta ?? null);
        setTemTokenConexao(Boolean(data.temTokenDaConexao));
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
    const conta = contas[0];
    setSalvando(stage);
    setErro(null);
    setRecado(null);
    try {
      const res = await fetch("/api/agency/track/destinos", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        // Só a MUDANÇA vai no corpo: a API tem semântica de PATCH, e mandar
        // a linha inteira do estado da tela fazia salvamentos concorrentes
        // reverterem o enabled um do outro com dados velhos.
        body: JSON.stringify({
          workspaceId: ws,
          stage,
          platform: plataforma,
          ...mudanca,
          ...(tokenMeta ? { apiToken: tokenMeta } : {}),
          ...(plataforma === "google" && (mudanca.enabled || mudanca.conversionActionId)
            ? {
                customerId: contaDeConversao ?? conta?.adAccountId ?? undefined,
                loginCustomerId: conta?.loginCustomerId ?? undefined,
              }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar");
      setDestinos((ds) => {
        const outros = ds.filter((d) => !(d.stage === stage && d.platform === plataforma));
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

  async function testarDataset() {
    if (!datasetLocal) return;
    setTestando(true);
    setResultadoTeste(null);
    try {
      const res = await fetch("/api/agency/track/destinos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: ws, datasetId: datasetLocal, apiToken: tokenMeta || undefined }),
      });
      setResultadoTeste(await res.json());
    } catch (e) {
      setResultadoTeste({ ok: false, erro: (e as Error).message });
    } finally {
      setTestando(false);
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
            onChange={(e) => {
              setWs(e.target.value);
              // TUDO que deriva do cliente anterior sai da tela junto com ele.
              // Sem esta limpeza, o datasetLocal do cliente A sobrevivia à
              // troca e um salvamento gravaria o dataset dele no cliente B:
              // conversão de um cliente caindo na conta do outro.
              setAcoes([]);
              setAviso(null);
              setDatasets([]);
              setDatasetLocal("");
              setAvisoMeta(null);
              setResultadoTeste(null);
              setTokenMeta("");
              setContaDeConversao(null);
            }}
            className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-300 focus:border-cyan-500/60 focus:outline-none"
          >
            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <div className="flex gap-1">
            {[
              { id: "google" as const, nome: "Google Ads" },
              { id: "meta" as const, nome: "Meta" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPlataforma(p.id)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs font-bold transition-colors",
                  plataforma === p.id
                    ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-300"
                    : "border-slate-800 text-slate-400 hover:bg-slate-800",
                )}
              >
                {p.nome}
              </button>
            ))}
          </div>
          <button
            onClick={() => carregar(ws, true)}
            disabled={buscandoAcoes || (plataforma === "google" ? contas.length === 0 : contasMeta.length === 0)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          >
            {buscandoAcoes ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {plataforma === "google" ? "Buscar ações de conversão" : "Buscar datasets da BM"}
          </button>
        </div>

        {plataforma === "google" && contas.length === 0 && !loading ? (
          <div className="glass-panel rounded-2xl p-10 text-center">
            <p className="text-sm text-slate-300">Este cliente não tem conta do Google Ads ligada.</p>
            <p className="mt-1 text-xs text-slate-500">
              Conecte em Integrações antes de configurar o envio de conversões.
            </p>
          </div>
        ) : null}

        {plataforma === "google" && aviso ? (
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
          {plataforma === "google" ? (
            <>
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
            </>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-slate-400">
                No Meta não existe link rastreável: quem clica num anúncio de WhatsApp já chega com
                o identificador dentro da própria mensagem, e o Track captura sozinho. O que falta
                configurar é só o destino.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Como a BM deste cliente já está conectada, o sistema busca os datasets sozinho:
                escolha na lista e teste a permissão. Só se o acesso da BM não alcançar o dataset
                é que entra um token de system user, nas opções avançadas.
              </p>
              <a
                href="https://business.facebook.com/events_manager2"
                target="_blank"
                rel="noreferrer noopener"
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300"
              >
                Abrir o Gerenciador de Eventos <ExternalLink size={11} />
              </a>

              <div className="mt-4">
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Dataset
                </label>

                {datasets.length > 0 ? (
                  <select
                    value={datasetLocal}
                    onChange={async (e) => {
                      const v = e.target.value;
                      setDatasetLocal(v);
                      setResultadoTeste(null);
                      if (v) {
                        // Sequencial, e recarrega no fim: se um dos três
                        // falhar, a tela mostra o que REALMENTE ficou no
                        // servidor em vez de mascarar a divergência.
                        for (const et of ESTAGIOS) await salvar(et.id, { datasetId: v });
                        await carregar(ws);
                      }
                    }}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 focus:border-cyan-500/60 focus:outline-none"
                  >
                    <option value="">Escolha o dataset do cliente</option>
                    {datasets.map((ds) => (
                      <option key={ds.id} value={ds.id}>
                        {ds.nome} · {ds.origem}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    {datasetLocal
                      ? `Configurado: ${datasetLocal}`
                      : 'Clique em "Buscar datasets da BM" para listar os do cliente.'}
                  </p>
                )}

                {avisoMeta ? (
                  <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                    <TriangleAlert size={11} className="mt-0.5 shrink-0" />
                    {avisoMeta}
                  </p>
                ) : null}

                {(() => {
                  // O aviso precisa dizer a VERDADE sobre qual credencial o
                  // envio usa: o cron prefere o token salvo na linha. Dizer
                  // "usando o acesso da BM" com um token colado por cima
                  // esconderia exatamente a credencial que pode estar errada.
                  const temTokenSalvo = destinos.some((d) => d.platform === "meta" && d.temToken);
                  if (temTokenSalvo) {
                    return (
                      <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        <span className="inline-flex items-center gap-1.5">
                          <CheckCircle2 size={11} className="text-amber-400" />
                          Usando um token colado manualmente (tem prioridade sobre o acesso da BM).
                        </span>
                        <button
                          onClick={async () => {
                            for (const et of ESTAGIOS) {
                              await salvar(et.id, { apiToken: null } as unknown as Partial<Destino>);
                            }
                            await carregar(ws);
                          }}
                          className="font-semibold text-red-300 underline-offset-2 hover:underline"
                        >
                          Remover token e voltar ao acesso da BM
                        </button>
                      </p>
                    );
                  }
                  if (temTokenConexao && !mostrarManual) {
                    return (
                      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                        <CheckCircle2 size={11} className="text-emerald-500" />
                        Usando o acesso da BM que você já conectou. Nenhum token a colar.
                      </p>
                    );
                  }
                  return null;
                })()}

                {/* Teste real de escrita: listar o dataset não prova permissão,
                    e descobrir isso só quando a venda acontecer é caro. */}
                {datasetLocal ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={testarDataset}
                      disabled={testando}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                    >
                      {testando ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                      Testar permissão
                    </button>
                    {resultadoTeste ? (
                      resultadoTeste.ok ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                          <CheckCircle2 size={12} />
                          Funcionou. O evento de teste aparece no Gerenciador de Eventos e não conta para a campanha.
                        </span>
                      ) : (
                        <span className="inline-flex items-start gap-1 text-[11px] text-red-300">
                          <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                          {resultadoTeste.erro}
                        </span>
                      )
                    ) : null}
                  </div>
                ) : null}

                {/* Saída de emergência: só aparece se for preciso. */}
                <button
                  onClick={() => setMostrarManual((v) => !v)}
                  className="mt-3 text-[11px] text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
                >
                  {mostrarManual ? "Esconder opções avançadas" : "O acesso da BM não alcança este dataset?"}
                </button>

                {mostrarManual ? (
                  <div className="mt-3 grid gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        ID do dataset na mão
                      </label>
                      <input
                        value={datasetLocal}
                        onChange={(e) => setDatasetLocal(e.target.value.replace(/[^0-9]/g, ""))}
                        onBlur={() => {
                          if (datasetLocal) ESTAGIOS.forEach((et) => void salvar(et.id, { datasetId: datasetLocal }));
                        }}
                        inputMode="numeric"
                        placeholder="1234567890123456"
                        className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 font-mono text-xs text-slate-300 placeholder-slate-600 focus:border-cyan-500/60 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Token de system user
                      </label>
                      <input
                        value={tokenMeta}
                        onChange={(e) => setTokenMeta(e.target.value)}
                        onBlur={() => {
                          if (tokenMeta) {
                            ESTAGIOS.forEach((et) => void salvar(et.id, {}));
                            setTokenMeta("");
                          }
                        }}
                        type="password"
                        placeholder={
                          destinos.some((d) => d.platform === "meta" && d.temToken)
                            ? "token salvo (digite para trocar)"
                            : "EAAG..."
                        }
                        className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 font-mono text-xs text-slate-300 placeholder-slate-600 focus:border-cyan-500/60 focus:outline-none"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Guardado no servidor, nunca devolvido ao navegador.
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>

        {loading && destinos.length === 0 ? (
          <div className="glass-panel rounded-2xl p-10 text-center">
            <Loader2 className="mx-auto animate-spin text-slate-600" size={20} />
          </div>
        ) : (
          <div className="space-y-3">
            {ESTAGIOS.map((et) => {
              const d = destinos.find((x) => x.stage === et.id && x.platform === plataforma);
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
                      disabled={salvando === et.id || (!ligado && (plataforma === "google" ? !d?.conversionActionId : !datasetLocal))}
                      title={!ligado && (plataforma === "google" ? !d?.conversionActionId : !datasetLocal) ? "Configure o destino primeiro" : ""}
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
                    {plataforma === "google" ? (
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
                    ) : (
                      <div>
                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Nome do evento no Meta
                        </label>
                        <select
                          value={d?.eventName ?? EVENTO_SUGERIDO[et.id] ?? "Lead"}
                          onChange={(e) => void salvar(et.id, { eventName: e.target.value })}
                          className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 focus:border-cyan-500/60 focus:outline-none"
                        >
                          {["Purchase", "Lead", "Contact", "Schedule", "SubmitApplication"].map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                        <p className="mt-1 text-[11px] text-slate-500">
                          É como o evento aparece no Gerenciador de Eventos e nas campanhas.
                        </p>
                      </div>
                    )}

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
