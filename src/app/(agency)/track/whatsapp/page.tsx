"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2, Loader2, Plus, Power, QrCode, Smartphone,
  Tag, Trash2, TriangleAlert, X,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { cn } from "@/lib/utils";
import { AbasTrack } from "../_components/abas";

interface WorkspaceRef { id: string; name: string }
interface Etiqueta { waLabelId: string; name: string; color: number | null }

interface Instancia {
  id: string;
  label: string;
  phone: string | null;
  state: string;
  desiredState: string;
  qr: string | null;
  pairingCode: string | null;
  isBusiness: boolean;
  lastConnectedAt: string | null;
  lastError: string | null;
  workerVivo: boolean;
  workspace: { id: string; name: string };
  labels: Etiqueta[];
  _count: { conversations: number };
}

const ESTADO: Record<string, { texto: string; cor: string; ponto: string }> = {
  open: { texto: "Conectado", cor: "text-emerald-400", ponto: "bg-emerald-400" },
  connecting: { texto: "Conectando", cor: "text-amber-400", ponto: "bg-amber-400 animate-pulse" },
  qr: { texto: "Aguardando leitura do QR", cor: "text-cyan-400", ponto: "bg-cyan-400 animate-pulse" },
  close: { texto: "Desligado", cor: "text-slate-500", ponto: "bg-slate-600" },
  logged_out: { texto: "Sessão encerrada no aparelho", cor: "text-red-400", ponto: "bg-red-500" },
};

export default function TrackWhatsApp() {
  const [instancias, setInstancias] = useState<Instancia[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/agency/track/whatsapp");
      const data = await res.json();
      setInstancias(data.instancias ?? []);
      setWorkspaces(data.workspaces ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  /*
   * Recarrega de perto sempre que existe algo EM TRANSIÇÃO, e não só quando o
   * QR já está na tela.
   *
   * A versão anterior ligava o polling apenas em `qr` e `connecting`, o que
   * criava um impasse: ao clicar em Conectar o estado ainda é `close` (o
   * painel só grava `desiredState`, quem age é o worker), então o polling
   * nunca ligava, e o QR que chegava ao banco 20 segundos depois não era
   * buscado por ninguém. A tela ficava presa em "Desligado" para sempre.
   *
   * Agora a condição inclui "quero ligado mas ainda não está aberto", que é
   * exatamente a janela entre o clique e o worker responder.
   */
  const emTransicao = instancias.some(
    (i) =>
      i.state === "qr" ||
      i.state === "connecting" ||
      (i.desiredState === "on" && i.state !== "open"),
  );
  useEffect(() => {
    if (!emTransicao) return;
    const t = setInterval(() => void carregar(), 3000);
    return () => clearInterval(t);
  }, [emTransicao, carregar]);

  async function acao(id: string, acao: "conectar" | "desconectar" | "deslogar") {
    setOcupado(id);
    setErro(null);
    setAviso(null);
    try {
      const res = await fetch(`/api/agency/track/whatsapp/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acao }),
      });
      const data = await res.json();
      if (!res.ok) setErro(data.error ?? "Não foi possível executar a ação");
      else setAviso(data.mensagem ?? null);
      await carregar();
    } finally {
      setOcupado(null);
    }
  }

  async function remover(inst: Instancia) {
    if (!confirm(`Remover o número "${inst.label}" de ${inst.workspace.name}?`)) return;
    setOcupado(inst.id);
    try {
      const res = await fetch(`/api/agency/track/whatsapp/${inst.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) setErro(data.error ?? "Não foi possível remover");
      await carregar();
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <Header title="Track" subtitle="Números de WhatsApp que alimentam o rastreio" />
      <AbasTrack />

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {erro ? <Alerta tipo="erro" texto={erro} onFechar={() => setErro(null)} /> : null}
        {aviso ? <Alerta tipo="info" texto={aviso} onFechar={() => setAviso(null)} /> : null}

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            O Track só observa: não envia mensagem, não marca online e não responde por você.
          </p>
          <button
            onClick={() => setCriando(true)}
            disabled={workspaces.length === 0}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-40"
          >
            <Plus size={14} />
            Adicionar número
          </button>
        </div>

        {loading ? (
          <div className="glass-panel rounded-2xl p-10 text-center">
            <Loader2 className="mx-auto animate-spin text-slate-600" size={20} />
          </div>
        ) : instancias.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center">
            <Smartphone size={28} className="mx-auto mb-3 text-slate-600" />
            <p className="text-sm text-slate-300">Nenhum número conectado.</p>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-500">
              Conecte o WhatsApp que atende os leads. É dele que o Track vai ler as etiquetas
              (a etiqueta &quot;Pago&quot; é o que vira venda no Google Ads).
            </p>
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
            {instancias.map((inst) => {
              /*
               * "Desligado" com o envio ligado seria mentira: o painel só
               * grava a intenção, e quem sobe a sessão é o worker, que leva
               * até 20 segundos para responder. Nessa janela o certo é dizer
               * que está subindo, senão parece que o clique não funcionou.
               */
              const subindo = inst.desiredState === "on" && inst.state === "close";
              const est = subindo
                ? { texto: "Subindo a sessão", cor: "text-amber-400", ponto: "bg-amber-400 animate-pulse" }
                : ESTADO[inst.state] ?? ESTADO.close;
              const ligado = inst.desiredState === "on";
              return (
                <div key={inst.id} className="glass-panel flex flex-col rounded-2xl p-4">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-200">{inst.label}</p>
                      <p className="truncate text-[11px] text-slate-500">{inst.workspace.name}</p>
                    </div>
                    <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold", est.cor)}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", est.ponto)} />
                      {est.texto}
                    </span>
                  </div>

                  {inst.phone ? (
                    <p className="mb-2 font-mono text-xs text-slate-400">+{inst.phone}</p>
                  ) : null}

                  {/* Etiqueta só existe no WhatsApp Business. Sem avisar, o
                      cliente ficaria procurando uma lista que nunca aparece. */}
                  {inst.state === "open" && !inst.isBusiness ? (
                    <p className="mb-2 flex items-start gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-300">
                      <TriangleAlert size={11} className="mt-0.5 shrink-0" />
                      Este é um WhatsApp pessoal, que não tem etiquetas. O funil vai depender só das
                      frases combinadas. Para usar etiqueta, é preciso o WhatsApp Business.
                    </p>
                  ) : null}

                  {inst.state === "open" && inst.isBusiness && inst.labels.length > 0 ? (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {inst.labels.slice(0, 6).map((l) => (
                        <span
                          key={l.waLabelId}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[10px] text-slate-300"
                        >
                          <Tag size={8} />
                          {l.name}
                        </span>
                      ))}
                      {inst.labels.length > 6 ? (
                        <span className="text-[10px] text-slate-600">+{inst.labels.length - 6}</span>
                      ) : null}
                    </div>
                  ) : null}

                  {inst.qr ? (
                    <div className="mb-3 rounded-xl bg-white p-3">
                      <Image src={inst.qr} alt="QR code para conectar o WhatsApp" width={220} height={220} className="mx-auto h-auto w-full max-w-[220px]" unoptimized />
                      <p className="mt-2 text-center text-[10px] leading-relaxed text-slate-600">
                        WhatsApp &gt; Aparelhos conectados &gt; Conectar aparelho
                      </p>
                    </div>
                  ) : null}

                  {inst.pairingCode ? (
                    <div className="mb-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-center">
                      <p className="font-mono text-lg font-bold tracking-widest text-cyan-300">{inst.pairingCode}</p>
                      <p className="mt-1 text-[10px] text-cyan-200/70">Digite este código no WhatsApp</p>
                    </div>
                  ) : null}

                  {inst.lastError ? (
                    <p className="mb-2 text-[11px] text-red-400">{inst.lastError}</p>
                  ) : null}

                  {/* Worker morto com sessão marcada como aberta é o pior caso:
                      parece tudo bem e não chega lead nenhum. */}
                  {ligado && inst.state === "open" && !inst.workerVivo ? (
                    <p className="mb-2 flex items-start gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-300">
                      <TriangleAlert size={11} className="mt-0.5 shrink-0" />
                      A sessão consta conectada, mas o serviço do Track não dá sinal há mais de dois
                      minutos. Provavelmente nenhuma mensagem está sendo registrada.
                    </p>
                  ) : null}

                  <p className="mb-3 mt-auto text-[11px] text-slate-500">
                    {inst._count.conversations} conversa(s) rastreada(s)
                  </p>

                  <div className="flex items-center gap-1.5">
                    {ligado ? (
                      <button
                        onClick={() => acao(inst.id, "desconectar")}
                        disabled={ocupado === inst.id}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                      >
                        {ocupado === inst.id ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />}
                        Desligar
                      </button>
                    ) : (
                      <button
                        onClick={() => acao(inst.id, "conectar")}
                        disabled={ocupado === inst.id}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
                      >
                        {ocupado === inst.id ? <Loader2 size={13} className="animate-spin" /> : <QrCode size={13} />}
                        Conectar
                      </button>
                    )}
                    {inst.state === "open" ? (
                      <button
                        onClick={() => acao(inst.id, "deslogar")}
                        disabled={ocupado === inst.id}
                        title="Encerrar a sessão no aparelho (vai precisar de QR novo)"
                        className="rounded-lg border border-slate-800 p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                      >
                        <CheckCircle2 size={13} />
                      </button>
                    ) : null}
                    <button
                      onClick={() => remover(inst)}
                      disabled={ocupado === inst.id}
                      title="Remover"
                      className="rounded-lg border border-slate-800 p-2 text-slate-600 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {criando ? (
        <ModalNovo
          workspaces={workspaces}
          onFechar={() => setCriando(false)}
          onCriado={() => { setCriando(false); void carregar(); }}
          onErro={setErro}
        />
      ) : null}
    </div>
  );
}

function Alerta({ tipo, texto, onFechar }: { tipo: "erro" | "info"; texto: string; onFechar: () => void }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl border px-4 py-3 text-xs",
        tipo === "erro"
          ? "border-red-500/30 bg-red-500/10 text-red-300"
          : "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
      )}
    >
      <TriangleAlert size={14} className="mt-0.5 shrink-0" />
      <span className="flex-1">{texto}</span>
      <button onClick={onFechar} className="opacity-60 hover:opacity-100"><X size={14} /></button>
    </div>
  );
}

function ModalNovo({
  workspaces, onFechar, onCriado, onErro,
}: {
  workspaces: WorkspaceRef[];
  onFechar: () => void;
  onCriado: () => void;
  onErro: (e: string) => void;
}) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [label, setLabel] = useState("Principal");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    try {
      const res = await fetch("/api/agency/track/whatsapp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, label }),
      });
      const data = await res.json();
      if (!res.ok) onErro(data.error ?? "Não foi possível adicionar");
      else onCriado();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onFechar}>
      <div className="glass-panel w-full max-w-md rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-base font-bold text-white">Adicionar número</h2>
        <p className="mb-5 text-xs text-slate-500">
          Depois de criar, clique em Conectar e leia o QR no celular que atende.
        </p>

        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Cliente</label>
        <select
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 focus:border-blue-500/60 focus:outline-none"
        >
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>

        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Apelido</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Principal"
          className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 focus:border-blue-500/60 focus:outline-none"
        />

        <div className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-200">
          Use de preferência um número dedicado ou secundário no começo. A conexão é feita por
          biblioteca não oficial, e o WhatsApp pode bloquear um número novo demais.
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onFechar} className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando || !workspaceId}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-40"
          >
            {salvando ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}
