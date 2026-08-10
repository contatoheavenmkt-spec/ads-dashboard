"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, MessageSquare, MessagesSquare, Save, Tag, TriangleAlert, X } from "lucide-react";
import { Header } from "@/components/layout/header";
import { cn } from "@/lib/utils";
import { AbasTrack } from "../_components/abas";

interface WorkspaceRef { id: string; name: string }
interface Etiqueta { waLabelId: string; name: string; instanceLabel: string }
interface Frase { text: string; direction: "in" | "out" | "any" }

interface Config {
  qualifiedLabelIds: string[];
  saleLabelIds: string[];
  lostLabelIds: string[];
  qualifiedPhrases: Frase[];
  salePhrases: Frase[];
  respondedMinInbound: number;
  qualifiedMinTrocas: number;
  respondedRequiresOutbound: boolean;
  defaultSaleValue: number | null;
  storeMessageText: boolean;
  messageRetentionDays: number;
  uploadLagHours: number;
  createLeadInCrm: boolean;
}

interface Avisos {
  semNumero: boolean;
  nenhumConectado: boolean;
  semBusiness: boolean;
  semEtiquetas: boolean;
}

export default function TrackConfig() {
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[]>([]);
  const [wsId, setWsId] = useState("");
  const [cfg, setCfg] = useState<Config | null>(null);
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [avisos, setAvisos] = useState<Avisos | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  // A lista de clientes vem da rota de conversas, que já devolve os workspaces
  // da agência sem precisar de um endpoint só para isso.
  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/agency/track/conversas?dias=1");
      const data = await res.json();
      const ws: WorkspaceRef[] = data.workspaces ?? [];
      setWorkspaces(ws);
      if (ws[0]) setWsId(ws[0].id);
      else setCarregando(false);
    })();
  }, []);

  const carregar = useCallback(async (id: string) => {
    if (!id) return;
    setCarregando(true);
    try {
      const res = await fetch(`/api/agency/track/config?workspaceId=${id}`);
      const data = await res.json();
      if (!res.ok) {
        setMsg({ tipo: "erro", texto: data.error ?? "Não foi possível carregar" });
        return;
      }
      setCfg(data.config);
      setEtiquetas(data.etiquetas ?? []);
      setAvisos(data.avisos ?? null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { if (wsId) void carregar(wsId); }, [wsId, carregar]);

  async function salvar() {
    if (!cfg) return;
    setSalvando(true);
    setMsg(null);
    try {
      const res = await fetch("/api/agency/track/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: wsId, config: cfg }),
      });
      const data = await res.json();
      if (!res.ok) setMsg({ tipo: "erro", texto: data.error ?? "Não foi possível salvar" });
      else {
        setCfg(data.config);
        setMsg({ tipo: "ok", texto: "Regras salvas. Valem para as próximas conversas." });
      }
    } finally {
      setSalvando(false);
    }
  }

  function alternarEtiqueta(campo: "saleLabelIds" | "qualifiedLabelIds" | "lostLabelIds", id: string) {
    if (!cfg) return;
    const atual = cfg[campo];
    setCfg({ ...cfg, [campo]: atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id] });
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <Header title="Track" subtitle="O que conta como qualificação e o que conta como venda" />
      <AbasTrack />

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={wsId}
            onChange={(e) => setWsId(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-300 focus:border-cyan-500/60 focus:outline-none"
          >
            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <div className="flex-1" />
          {cfg ? (
            <button
              onClick={salvar}
              disabled={salvando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-40"
            >
              {salvando ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Salvar
            </button>
          ) : null}
        </div>

        {msg ? (
          <div className={cn(
            "flex items-start gap-2 rounded-xl border px-4 py-3 text-xs",
            msg.tipo === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300",
          )}>
            {msg.tipo === "ok" ? <Check size={14} className="mt-0.5" /> : <TriangleAlert size={14} className="mt-0.5" />}
            <span className="flex-1">{msg.texto}</span>
            <button onClick={() => setMsg(null)}><X size={14} /></button>
          </div>
        ) : null}

        {carregando || !cfg ? (
          <div className="glass-panel rounded-2xl p-10 text-center">
            <Loader2 className="mx-auto animate-spin text-slate-600" size={20} />
          </div>
        ) : (
          <>
            {avisos?.semNumero ? (
              <AvisoBloco texto="Nenhum WhatsApp conectado neste cliente. Conecte um número na aba WhatsApp para as etiquetas aparecerem aqui." />
            ) : avisos?.nenhumConectado ? (
              <AvisoBloco texto="O número existe mas não está conectado. As etiquetas do aparelho só aparecem depois da conexão." />
            ) : avisos?.semBusiness ? (
              <AvisoBloco texto="O número conectado é WhatsApp pessoal, que não tem etiquetas. Use as frases combinadas abaixo, ou troque para o WhatsApp Business." />
            ) : avisos?.semEtiquetas ? (
              <AvisoBloco texto="Nenhuma etiqueta encontrada ainda. Elas chegam quando o aparelho sincroniza; criar ou renomear uma etiqueta no celular costuma acelerar isso." />
            ) : null}

            <Secao
              titulo="O que conta como VENDA"
              subtitulo="É isto que vira conversão no Google Ads e ensina a campanha a buscar mais gente parecida."
              destaque
            >
              <ListaEtiquetas
                etiquetas={etiquetas}
                marcadas={cfg.saleLabelIds}
                onAlternar={(id) => alternarEtiqueta("saleLabelIds", id)}
                cor="emerald"
              />
              <Frases
                frases={cfg.salePhrases}
                onMudar={(f) => setCfg({ ...cfg, salePhrases: f })}
                exemplo="parabéns pela sua compra"
                direcaoPadrao="out"
              />
            </Secao>

            <Secao
              titulo="O que conta como QUALIFICADO"
              subtitulo="Lead que engajou de verdade. É o sinal que o Google mais aproveita, porque acontece em volume."
            >
              {/* O caminho automático vem primeiro de propósito: é o que
                  funciona sem depender de ninguém lembrar de marcar nada. */}
              <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
                <div className="flex items-start gap-2">
                  <MessagesSquare size={14} className="mt-0.5 shrink-0 text-amber-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-200">
                      Automático: quem conversou de verdade
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                      Sem ninguém marcar nada. Uma troca é o cliente escrever e você responder.
                      Cinco mensagens seguidas dele sem resposta não contam: isso é lead ansioso,
                      não conversa.
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {[0, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => setCfg({ ...cfg, qualifiedMinTrocas: n })}
                          className={cn(
                            "rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors",
                            cfg.qualifiedMinTrocas === n
                              ? "border-amber-500/50 bg-amber-500/20 text-amber-300"
                              : "border-slate-700 text-slate-400 hover:bg-slate-800",
                          )}
                        >
                          {n === 0 ? "Desligado" : `${n} trocas`}
                        </button>
                      ))}
                    </div>

                    <p className="mt-2 text-[11px] text-slate-500">
                      {cfg.qualifiedMinTrocas === 0
                        ? "Desligado: só qualifica pelo que for marcado à mão abaixo."
                        : `Conversa com ${cfg.qualifiedMinTrocas} idas e voltas vira qualificado sozinha.`}
                    </p>
                  </div>
                </div>
              </div>

              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Ou quando você marcar
              </p>
              <ListaEtiquetas
                etiquetas={etiquetas}
                marcadas={cfg.qualifiedLabelIds}
                onAlternar={(id) => alternarEtiqueta("qualifiedLabelIds", id)}
                cor="amber"
              />
              <Frases
                frases={cfg.qualifiedPhrases}
                onMudar={(f) => setCfg({ ...cfg, qualifiedPhrases: f })}
                exemplo="quanto custa"
                direcaoPadrao="in"
              />
            </Secao>

            <Secao titulo="O que conta como PERDIDO" subtitulo="Não gera conversão. Serve para limpar o funil.">
              <ListaEtiquetas
                etiquetas={etiquetas}
                marcadas={cfg.lostLabelIds}
                onAlternar={(id) => alternarEtiqueta("lostLabelIds", id)}
                cor="red"
              />
            </Secao>

            <Secao titulo="Ajustes finos" subtitulo="Valores padrão funcionam bem; mexa só se precisar.">
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
                <Campo label="Mensagens do lead para contar como engajado">
                  <input
                    type="number" min={1} max={20}
                    value={cfg.respondedMinInbound}
                    onChange={(e) => setCfg({ ...cfg, respondedMinInbound: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 focus:border-cyan-500/60 focus:outline-none"
                  />
                </Campo>
                <Campo label="Valor padrão da venda (R$)" ajuda="Usado quando a venda não traz valor próprio.">
                  <input
                    type="number" min={0} step="0.01"
                    value={cfg.defaultSaleValue ?? ""}
                    onChange={(e) => setCfg({ ...cfg, defaultSaleValue: e.target.value === "" ? null : Number(e.target.value) })}
                    placeholder="sem valor"
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 focus:border-cyan-500/60 focus:outline-none"
                  />
                </Campo>
                <Campo
                  label="Esperar antes de enviar (horas)"
                  ajuda="Conversão enviada cedo demais é recusada porque o Google ainda não processou o clique."
                >
                  <input
                    type="number" min={0} max={72}
                    value={cfg.uploadLagHours}
                    onChange={(e) => setCfg({ ...cfg, uploadLagHours: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 focus:border-cyan-500/60 focus:outline-none"
                  />
                </Campo>
                <Campo label="Guardar conversa por (dias)" ajuda="Depois disso o texto das mensagens é apagado.">
                  <input
                    type="number" min={7} max={365}
                    value={cfg.messageRetentionDays}
                    onChange={(e) => setCfg({ ...cfg, messageRetentionDays: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 focus:border-cyan-500/60 focus:outline-none"
                  />
                </Campo>
              </div>

              <div className="mt-4 space-y-2">
                <Chave
                  ativo={cfg.respondedRequiresOutbound}
                  onMudar={(v) => setCfg({ ...cfg, respondedRequiresOutbound: v })}
                  titulo="Exigir resposta do atendente"
                  descricao="Lead falando sozinho não conta como engajado. Recomendado: sem isso, mandaríamos ao Google leads que ninguém atendeu."
                />
                <Chave
                  ativo={cfg.createLeadInCrm}
                  onMudar={(v) => setCfg({ ...cfg, createLeadInCrm: v })}
                  titulo="Criar lead no CRM automaticamente"
                  descricao="Cada conversa rastreada vira um lead na aba CRM, com o status acompanhando o funil."
                />
                <Chave
                  ativo={cfg.storeMessageText}
                  onMudar={(v) => setCfg({ ...cfg, storeMessageText: v })}
                  titulo="Guardar o texto das mensagens"
                  descricao="Necessário para as frases combinadas funcionarem. Desligue se preferir não armazenar conteúdo de conversa."
                />
              </div>
            </Secao>
          </>
        )}
      </div>
    </div>
  );
}

function Secao({
  titulo, subtitulo, destaque, children,
}: {
  titulo: string; subtitulo: string; destaque?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={cn("glass-panel rounded-2xl p-5", destaque && "ring-1 ring-emerald-500/20")}>
      <h2 className="text-sm font-bold text-slate-200">{titulo}</h2>
      <p className="mb-4 mt-0.5 text-[11px] leading-relaxed text-slate-500">{subtitulo}</p>
      {children}
    </div>
  );
}

function AvisoBloco({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
      <TriangleAlert size={14} className="mt-0.5 shrink-0" />
      <span>{texto}</span>
    </div>
  );
}

function ListaEtiquetas({
  etiquetas, marcadas, onAlternar, cor,
}: {
  etiquetas: Etiqueta[]; marcadas: string[]; onAlternar: (id: string) => void; cor: "emerald" | "amber" | "red";
}) {
  if (etiquetas.length === 0) {
    return <p className="mb-3 text-[11px] text-slate-600">Nenhuma etiqueta disponível ainda.</p>;
  }
  const ativo = {
    emerald: "border-emerald-500/50 bg-emerald-500/15 text-emerald-300",
    amber: "border-amber-500/50 bg-amber-500/15 text-amber-300",
    red: "border-red-500/50 bg-red-500/15 text-red-300",
  }[cor];

  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {etiquetas.map((e) => {
        const on = marcadas.includes(e.waLabelId);
        return (
          <button
            key={`${e.waLabelId}-${e.instanceLabel}`}
            onClick={() => onAlternar(e.waLabelId)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors",
              on ? ativo : "border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-800",
            )}
          >
            {on ? <Check size={11} /> : <Tag size={11} />}
            {e.name}
          </button>
        );
      })}
    </div>
  );
}

function Frases({
  frases, onMudar, exemplo, direcaoPadrao,
}: {
  frases: Frase[]; onMudar: (f: Frase[]) => void; exemplo: string; direcaoPadrao: "in" | "out";
}) {
  const [nova, setNova] = useState("");

  function adicionar() {
    const t = nova.trim();
    if (t.length < 3) return;
    onMudar([...frases, { text: t, direction: direcaoPadrao }]);
    setNova("");
  }

  return (
    <div className="border-t border-slate-800 pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
        <MessageSquare size={11} />
        Ou quando alguém escrever
      </p>
      {frases.length > 0 ? (
        <div className="mb-2 space-y-1.5">
          {frases.map((f, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
              <span className="flex-1 text-[11px] text-slate-300">&quot;{f.text}&quot;</span>
              <select
                value={f.direction}
                onChange={(e) => {
                  const copia = [...frases];
                  copia[i] = { ...f, direction: e.target.value as Frase["direction"] };
                  onMudar(copia);
                }}
                className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-400"
              >
                <option value="out">o atendente</option>
                <option value="in">o cliente</option>
                <option value="any">qualquer um</option>
              </select>
              <button onClick={() => onMudar(frases.filter((_, j) => j !== i))} className="text-slate-600 hover:text-red-400">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <input
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") adicionar(); }}
          placeholder={`ex: ${exemplo}`}
          className="flex-1 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-[11px] text-slate-300 placeholder-slate-600 focus:border-cyan-500/60 focus:outline-none"
        />
        <button
          onClick={adicionar}
          disabled={nova.trim().length < 3}
          className="rounded-lg border border-slate-700 px-3 py-2 text-[11px] font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-40"
        >
          Adicionar
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-slate-600">
        Acento e maiúscula não importam. A frase precisa aparecer na mensagem de quem você escolheu.
      </p>
    </div>
  );
}

function Campo({ label, ajuda, children }: { label: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</label>
      {children}
      {ajuda ? <p className="mt-1 text-[10px] leading-relaxed text-slate-600">{ajuda}</p> : null}
    </div>
  );
}

function Chave({
  ativo, onMudar, titulo, descricao,
}: {
  ativo: boolean; onMudar: (v: boolean) => void; titulo: string; descricao: string;
}) {
  return (
    <button
      onClick={() => onMudar(!ativo)}
      className="flex w-full items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-left transition-colors hover:bg-slate-900/70"
    >
      <span
        className={cn(
          "mt-0.5 flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors",
          ativo ? "bg-emerald-500" : "bg-slate-700",
        )}
      >
        <span className={cn("h-3 w-3 rounded-full bg-white transition-transform", ativo && "translate-x-3")} />
      </span>
      <span className="flex-1">
        <span className="block text-[11px] font-semibold text-slate-200">{titulo}</span>
        <span className="mt-0.5 block text-[10px] leading-relaxed text-slate-500">{descricao}</span>
      </span>
    </button>
  );
}
