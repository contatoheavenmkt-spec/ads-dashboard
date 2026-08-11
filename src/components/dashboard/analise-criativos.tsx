"use client";

/**
 * Análise de criativos do Meta.
 *
 * Substitui o carrossel que só mostrava anúncios ativos com thumbnail 64px.
 * O que esta seção responde, na ordem em que um gestor pergunta:
 *
 *  1. O que RODOU no período? (incluindo o que já foi pausado)
 *  2. Qual está vendendo barato e qual está queimando verba, e POR QUÊ?
 *  3. Como era o anúncio de verdade? (clique abre a peça real, não a miniatura)
 *
 * O veredito é determinístico: cada anúncio é comparado com a média da própria
 * conta no período. Sem amostra suficiente o card diz isso, em vez de fingir
 * conclusão com três cliques de dado.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Award, ExternalLink, Eye, Flame, Loader2, MousePointerClick,
  PauseCircle, PlayCircle, TrendingDown, TriangleAlert, X,
} from "lucide-react";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

export interface AdAnalisado {
  id: string;
  name: string;
  thumbnail: string | null;
  impressions: number;
  clicks: number;
  purchases: number;
  leads: number;
  messages: number;
  conversions: number;
  spend: number;
  status: string;
  isMessaging: boolean;
  body: string | null;
  title: string | null;
  permalink: string | null;
  frequency: number;
  ctr: number;
  cpm: number;
  clientName?: string;
  adAccountId?: string;
}

type Veredito = {
  tipo: "vencedor" | "fadiga" | "clique_caro" | "fraco" | "caro" | "media" | "sem_amostra";
  rotulo: string;
  porque: string;
  cor: string;
  borda: string;
};

/**
 * O "porquê deu certo ou errado", em regras explícitas.
 *
 * A referência é a média ponderada da conta no MESMO período: um CTR de 1,2%
 * pode ser ótimo num nicho e péssimo em outro, então comparar com número
 * absoluto mentiria. Amostra pequena não recebe veredito.
 */
function analisar(ad: AdAnalisado, ref: { ctr: number; custoPorResultado: number }): Veredito {
  const amostraOk = ad.impressions >= 1000 || ad.spend >= 50;
  if (!amostraOk) {
    return {
      tipo: "sem_amostra",
      rotulo: "Pouca amostra",
      porque: "Ainda não entregou o suficiente para concluir algo com honestidade.",
      cor: "text-slate-400",
      borda: "border-slate-700",
    };
  }

  const custoPorResultado = ad.conversions > 0 ? ad.spend / ad.conversions : Infinity;
  const ctrRel = ref.ctr > 0 ? ad.ctr / ref.ctr : 1;
  const custoRel =
    ref.custoPorResultado > 0 && custoPorResultado !== Infinity
      ? custoPorResultado / ref.custoPorResultado
      : Infinity;

  // Vencedor: converte mais barato que a média da conta, com volume real.
  if (ad.conversions >= 3 && custoRel <= 0.8) {
    return {
      tipo: "vencedor",
      rotulo: "Vencedor",
      porque: `Converte ${Math.round((1 - custoRel) * 100)}% mais barato que a média da conta. É o ângulo a escalar e a base para as próximas variações.`,
      cor: "text-emerald-400",
      borda: "border-emerald-500/40",
    };
  }

  // Fadiga: as mesmas pessoas viram demais e pararam de reagir.
  if (ad.frequency >= 3.5 && ctrRel < 1) {
    return {
      tipo: "fadiga",
      rotulo: "Fadigado",
      porque: `Cada pessoa viu ${ad.frequency.toFixed(1)} vezes e o CTR está abaixo da média: a audiência saturou. Troca de criativo ou de público costuma resolver.`,
      cor: "text-orange-400",
      borda: "border-orange-500/40",
    };
  }

  // Atrai o clique errado: o anúncio chama, a conversão não vem.
  if (ctrRel >= 1.3 && (custoRel >= 1.5 || ad.conversions === 0)) {
    return {
      tipo: "clique_caro",
      rotulo: "Clique sem conversão",
      porque: `CTR ${Math.round((ctrRel - 1) * 100)}% acima da média, mas a conversão não acompanha: a promessa do anúncio atrai curioso, não comprador. Ângulo e página precisam contar a mesma história.`,
      cor: "text-amber-400",
      borda: "border-amber-500/40",
    };
  }

  // Fraco: não para o dedo.
  if (ctrRel <= 0.6) {
    return {
      tipo: "fraco",
      rotulo: "Criativo fraco",
      porque: `CTR ${Math.round((1 - ctrRel) * 100)}% abaixo da média da conta: o anúncio não está parando o dedo. O gancho dos 3 primeiros segundos é o suspeito de sempre.`,
      cor: "text-red-400",
      borda: "border-red-500/40",
    };
  }

  // Caro: converte, mas acima do que a conta consegue.
  if (ad.conversions > 0 && custoRel >= 1.5) {
    return {
      tipo: "caro",
      rotulo: "Convertendo caro",
      porque: `Cada resultado custa ${Math.round((custoRel - 1) * 100)}% mais que a média da conta. Vale testar variação do criativo antes de matar: o ângulo pode servir com outra execução.`,
      cor: "text-amber-400",
      borda: "border-amber-500/40",
    };
  }

  return {
    tipo: "media",
    rotulo: "Na média",
    porque: "Desempenho em linha com a conta. Não é o problema nem a solução.",
    cor: "text-slate-300",
    borda: "border-slate-700",
  };
}

const STATUS_ROTULO: Record<string, { texto: string; cor: string }> = {
  ACTIVE: { texto: "Ativo", cor: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  PAUSED: { texto: "Pausado", cor: "text-slate-400 bg-slate-700/40 border-slate-600" },
  ADSET_PAUSED: { texto: "Conjunto pausado", cor: "text-slate-400 bg-slate-700/40 border-slate-600" },
  CAMPAIGN_PAUSED: { texto: "Campanha pausada", cor: "text-slate-400 bg-slate-700/40 border-slate-600" },
  ARCHIVED: { texto: "Arquivado", cor: "text-slate-500 bg-slate-800/40 border-slate-700" },
};

export function AnaliseCriativos({
  creatives,
  workspaceIdParam,
  agregadoSemConta,
}: {
  creatives: AdAnalisado[];
  workspaceIdParam?: string | null;
  /** true quando a visão é "Todas as Fontes": mostra o dono de cada anúncio. */
  agregadoSemConta: boolean;
}) {
  const [filtro, setFiltro] = useState<"rodaram" | "ativos" | "pausados">("rodaram");
  const [aberto, setAberto] = useState<AdAnalisado | null>(null);

  // Referência da análise: média ponderada DO CONJUNTO exibido no período.
  const ref = useMemo(() => {
    const relevantes = creatives.filter((a) => a.impressions >= 1000 || a.spend >= 50);
    const base = relevantes.length >= 2 ? relevantes : creatives;
    const totalImpr = base.reduce((s, a) => s + a.impressions, 0);
    const totalCliques = base.reduce((s, a) => s + a.clicks, 0);
    const totalGasto = base.reduce((s, a) => s + a.spend, 0);
    const totalConv = base.reduce((s, a) => s + a.conversions, 0);
    return {
      ctr: totalImpr > 0 ? (totalCliques / totalImpr) * 100 : 0,
      custoPorResultado: totalConv > 0 ? totalGasto / totalConv : 0,
    };
  }, [creatives]);

  const analisados = useMemo(
    () => creatives.map((ad) => ({ ad, veredito: analisar(ad, ref) })),
    [creatives, ref],
  );

  const visiveis = useMemo(() => {
    if (filtro === "ativos") return analisados.filter((x) => x.ad.status === "ACTIVE");
    if (filtro === "pausados") return analisados.filter((x) => x.ad.status !== "ACTIVE");
    return analisados;
  }, [analisados, filtro]);

  const ativos = analisados.filter((x) => x.ad.status === "ACTIVE").length;
  const pausados = analisados.length - ativos;
  const vencedores = analisados.filter((x) => x.veredito.tipo === "vencedor");
  const problemas = analisados.filter((x) =>
    ["fadiga", "clique_caro", "fraco", "caro"].includes(x.veredito.tipo),
  );

  return (
    <div className="glass-panel flex flex-col rounded-2xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white/80">
            Análise de criativos
          </h3>
          <span className="rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-400">
            Meta Ads
          </span>
        </div>
        <div className="flex gap-1">
          {[
            { id: "rodaram" as const, label: `Rodaram no período (${analisados.length})` },
            { id: "ativos" as const, label: `Ativos (${ativos})` },
            { id: "pausados" as const, label: `Pausados (${pausados})` },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
                filtro === f.id
                  ? "border-slate-600 bg-slate-800 text-white"
                  : "border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-800",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* O resumo que responde "e aí, o que faço?" antes dos cards. */}
      {(vencedores.length > 0 || problemas.length > 0) && (
        <div className="mb-5 grid gap-2 sm:grid-cols-2">
          {vencedores.length > 0 && (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                <Award size={12} /> O que está funcionando
              </p>
              {vencedores.slice(0, 3).map(({ ad }) => (
                <button
                  key={ad.id}
                  onClick={() => setAberto(ad)}
                  className="block w-full truncate text-left text-[11px] text-slate-300 hover:text-white"
                >
                  • {ad.name}
                  <span className="text-emerald-400">
                    {" "}({formatCurrency(ad.conversions > 0 ? ad.spend / ad.conversions : 0)}/resultado)
                  </span>
                </button>
              ))}
            </div>
          )}
          {problemas.length > 0 && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                <TriangleAlert size={12} /> O que precisa de atenção
              </p>
              {problemas.slice(0, 3).map(({ ad, veredito }) => (
                <button
                  key={ad.id}
                  onClick={() => setAberto(ad)}
                  className="block w-full truncate text-left text-[11px] text-slate-300 hover:text-white"
                >
                  • {ad.name} <span className={veredito.cor}>({veredito.rotulo})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {visiveis.length === 0 ? (
        <div className="py-16 text-center text-xs text-slate-500">
          Nenhum anúncio {filtro === "ativos" ? "ativo" : filtro === "pausados" ? "pausado" : "com entrega"} no período.
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          {visiveis.map(({ ad, veredito }) => {
            const st = STATUS_ROTULO[ad.status] ?? STATUS_ROTULO.PAUSED;
            const custoResultado = ad.conversions > 0 ? ad.spend / ad.conversions : null;
            return (
              <button
                key={ad.id}
                onClick={() => setAberto(ad)}
                className={cn(
                  "group flex flex-col overflow-hidden rounded-xl border bg-slate-900/40 text-left transition-transform hover:scale-[1.01]",
                  veredito.borda,
                )}
                title="Clique para ver o anúncio real"
              >
                <div className="relative aspect-[4/5] w-full overflow-hidden bg-slate-800">
                  {ad.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ad.thumbnail}
                      alt={ad.name}
                      className="h-full w-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-widest text-slate-600">
                      sem imagem
                    </div>
                  )}
                  <div className="absolute left-2 top-2 flex flex-col gap-1">
                    <span className={cn("rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase", st.cor)}>
                      {st.texto}
                    </span>
                    {agregadoSemConta && ad.clientName ? (
                      <span className="rounded-md border border-cyan-500/30 bg-cyan-950/80 px-1.5 py-0.5 text-[9px] font-bold text-cyan-300">
                        {ad.clientName}
                      </span>
                    ) : null}
                  </div>
                  <span className="absolute bottom-2 right-2 rounded-md bg-black/70 p-1 text-white/70 opacity-0 transition-opacity group-hover:opacity-100">
                    <Eye size={12} />
                  </span>
                </div>

                <div className="space-y-1.5 p-3">
                  <p className="truncate text-[11px] font-semibold text-slate-200">{ad.name}</p>
                  <p className={cn("text-[10px] font-bold uppercase tracking-wider", veredito.cor)}>
                    {veredito.rotulo}
                  </p>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 border-t border-slate-800 pt-1.5 text-[10px]">
                    <span className="text-slate-500">Gasto</span>
                    <span className="text-right font-semibold text-slate-300">{formatCurrency(ad.spend)}</span>
                    <span className="text-slate-500">{ad.isMessaging ? "Conversas" : ad.purchases > 0 ? "Vendas" : "Resultados"}</span>
                    <span className="text-right font-semibold text-slate-300">{formatNumber(ad.conversions)}</span>
                    <span className="text-slate-500">Custo/result.</span>
                    <span className="text-right font-semibold text-slate-300">
                      {custoResultado !== null ? formatCurrency(custoResultado) : "—"}
                    </span>
                    <span className="text-slate-500">CTR</span>
                    <span className="text-right font-semibold text-slate-300">{ad.ctr.toFixed(2)}%</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {aberto ? (
        <ModalAnuncio
          ad={aberto}
          veredito={analisar(aberto, ref)}
          workspaceIdParam={workspaceIdParam}
          onFechar={() => setAberto(null)}
        />
      ) : null}
    </div>
  );
}

/** O anúncio como foi ao ar: preview real do Meta, métricas e o porquê. */
function ModalAnuncio({
  ad,
  veredito,
  workspaceIdParam,
  onFechar,
}: {
  ad: AdAnalisado;
  veredito: Veredito;
  workspaceIdParam?: string | null;
  onFechar: () => void;
}) {
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [carregandoPreview, setCarregandoPreview] = useState(true);
  const [erroPreview, setErroPreview] = useState<string | null>(null);

  const buscarPreview = useCallback(async () => {
    if (!ad.adAccountId) {
      setErroPreview("Sem conta associada ao anúncio.");
      setCarregandoPreview(false);
      return;
    }
    try {
      const q = new URLSearchParams({ adId: ad.id, adAccountId: ad.adAccountId });
      if (workspaceIdParam) q.set("workspaceId", workspaceIdParam);
      const res = await fetch(`/api/meta/ad-preview?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao buscar o preview");
      setIframeUrl(data.iframeUrl);
    } catch (e) {
      setErroPreview((e as Error).message);
    } finally {
      setCarregandoPreview(false);
    }
  }, [ad.id, ad.adAccountId, workspaceIdParam]);

  useEffect(() => { void buscarPreview(); }, [buscarPreview]);

  const st = STATUS_ROTULO[ad.status] ?? STATUS_ROTULO.PAUSED;
  const custoResultado = ad.conversions > 0 ? ad.spend / ad.conversions : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onFechar}
    >
      <div
        className="glass-panel flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-800 p-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-bold text-white">{ad.name}</h3>
              <span className={cn("rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase", st.cor)}>
                {st.texto}
              </span>
              {ad.clientName ? (
                <span className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-bold text-cyan-300">
                  {ad.clientName}
                </span>
              ) : null}
            </div>
            <p className={cn("mt-1 text-[11px] font-bold uppercase tracking-wider", veredito.cor)}>
              {veredito.rotulo}
            </p>
          </div>
          <button onClick={onFechar} className="ml-3 text-slate-500 hover:text-slate-200">
            <X size={18} />
          </button>
        </div>

        <div className="grid flex-1 gap-0 overflow-y-auto md:grid-cols-2">
          {/* O anúncio de verdade, como quem rolou o feed viu. */}
          <div className="flex min-h-[420px] items-center justify-center bg-slate-950/60 p-3">
            {carregandoPreview ? (
              <Loader2 className="animate-spin text-slate-600" size={22} />
            ) : iframeUrl ? (
              <iframe
                src={iframeUrl}
                className="h-[560px] w-full max-w-[340px] rounded-lg border-0 bg-white"
                title={`Anúncio: ${ad.name}`}
                sandbox="allow-scripts allow-same-origin allow-popups"
              />
            ) : (
              <div className="px-6 text-center">
                {ad.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ad.thumbnail} alt={ad.name} className="mx-auto mb-3 max-h-[420px] rounded-lg" />
                ) : null}
                <p className="text-[11px] text-slate-500">{erroPreview}</p>
              </div>
            )}
          </div>

          <div className="space-y-4 p-4">
            <div className={cn("rounded-xl border p-3", veredito.borda)}>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Por que este veredito
              </p>
              <p className="text-xs leading-relaxed text-slate-200">{veredito.porque}</p>
            </div>

            {(ad.title || ad.body) && (
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  O texto do anúncio (o ângulo)
                </p>
                {ad.title ? <p className="text-xs font-semibold text-slate-200">{ad.title}</p> : null}
                {ad.body ? (
                  <p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-slate-400">
                    {ad.body.length > 500 ? `${ad.body.slice(0, 500)}…` : ad.body}
                  </p>
                ) : null}
              </div>
            )}

            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Números do período
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Metrica icone={<PlayCircle size={12} />} rotulo="Impressões" valor={formatNumber(ad.impressions)} />
                <Metrica icone={<MousePointerClick size={12} />} rotulo="Cliques" valor={`${formatNumber(ad.clicks)} (${ad.ctr.toFixed(2)}%)`} />
                <Metrica icone={<TrendingDown size={12} />} rotulo="Gasto" valor={formatCurrency(ad.spend)} />
                <Metrica
                  icone={<Award size={12} />}
                  rotulo={ad.isMessaging ? "Conversas" : ad.purchases > 0 ? "Vendas" : "Resultados"}
                  valor={`${formatNumber(ad.conversions)}${custoResultado !== null ? ` (${formatCurrency(custoResultado)} cada)` : ""}`}
                />
                <Metrica icone={<Flame size={12} />} rotulo="Frequência" valor={`${ad.frequency.toFixed(1)}x por pessoa`} />
                <Metrica icone={<PauseCircle size={12} />} rotulo="CPM" valor={formatCurrency(ad.cpm)} />
              </div>
            </div>

            {ad.permalink ? (
              <a
                href={ad.permalink}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300"
              >
                Abrir o post no Instagram <ExternalLink size={11} />
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Metrica({ icone, rotulo, valor }: { icone: React.ReactNode; rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-2">
      <p className="mb-0.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
        {icone} {rotulo}
      </p>
      <p className="text-[11px] font-semibold text-slate-200">{valor}</p>
    </div>
  );
}
