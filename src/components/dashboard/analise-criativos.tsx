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
  tipo: "vencedor" | "sem_resultado" | "caro" | "fadiga" | "media" | "sem_amostra";
  rotulo: string;
  porque: string;
  cor: string;
  borda: string;
};

/**
 * O resultado que importa para ESTE anúncio, em ordem de valor:
 * venda > conversa iniciada > lead. CTR não entra aqui: clique é meio, não
 * fim, e um anúncio de CTR baixo com custo por conversa excelente é um bom
 * anúncio.
 */
type TipoResultado = "venda" | "conversa" | "lead" | "nenhum";

function tipoDoAnuncio(ad: AdAnalisado): { tipo: TipoResultado; qtd: number } {
  if (ad.purchases > 0) return { tipo: "venda", qtd: ad.purchases };
  if (ad.messages > 0) return { tipo: "conversa", qtd: ad.messages };
  if (ad.leads > 0) return { tipo: "lead", qtd: ad.leads };
  return { tipo: "nenhum", qtd: 0 };
}

const NOME_RESULTADO: Record<TipoResultado, { singular: string; plural: string }> = {
  venda: { singular: "venda", plural: "vendas" },
  conversa: { singular: "conversa", plural: "conversas" },
  lead: { singular: "lead", plural: "leads" },
  nenhum: { singular: "resultado", plural: "resultados" },
};

/**
 * Referências POR TIPO de resultado, ponderadas pelo conjunto exibido.
 *
 * Comparar tudo numa média única mentiria: custo por venda e custo por
 * conversa são moedas diferentes, e um anúncio de venda sempre "perderia" de
 * um de mensagem. Cada anúncio é medido contra a média dos que perseguem o
 * MESMO resultado.
 */
interface Referencias {
  custoPorTipo: Partial<Record<TipoResultado, number>>;
  /** O resultado dominante do conjunto: é o que cobramos de quem tem zero. */
  tipoDominante: TipoResultado;
  ctr: number;
}

function calcularReferencias(creatives: AdAnalisado[]): Referencias {
  const relevantes = creatives.filter((a) => a.impressions >= 1000 || a.spend >= 50);
  const base = relevantes.length >= 2 ? relevantes : creatives;

  const custoPorTipo: Partial<Record<TipoResultado, number>> = {};
  const contagem: Partial<Record<TipoResultado, number>> = {};
  for (const t of ["venda", "conversa", "lead"] as const) {
    const doTipo = base.filter((a) => tipoDoAnuncio(a).tipo === t);
    const gasto = doTipo.reduce((soma, a) => soma + a.spend, 0);
    const qtd = doTipo.reduce((soma, a) => soma + tipoDoAnuncio(a).qtd, 0);
    if (qtd > 0) {
      custoPorTipo[t] = gasto / qtd;
      contagem[t] = qtd;
    }
  }

  // Dominante: vendas mandam se existem; senão o tipo com mais volume.
  const tipoDominante: TipoResultado = custoPorTipo.venda
    ? "venda"
    : (contagem.conversa ?? 0) >= (contagem.lead ?? 0) && custoPorTipo.conversa
      ? "conversa"
      : custoPorTipo.lead
        ? "lead"
        : "nenhum";

  const totalImpr = base.reduce((soma, a) => soma + a.impressions, 0);
  const totalCliques = base.reduce((soma, a) => soma + a.clicks, 0);
  return {
    custoPorTipo,
    tipoDominante,
    ctr: totalImpr > 0 ? (totalCliques / totalImpr) * 100 : 0,
  };
}

/**
 * O veredito, na hierarquia que importa para quem vende por WhatsApp: custo
 * por conversa decide, e custo por venda decide acima de tudo quando há
 * venda. CTR virou diagnóstico dentro do porquê, nunca sentença: clique é
 * meio, não fim.
 */
function analisar(ad: AdAnalisado, ref: Referencias): Veredito {
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

  const { tipo, qtd } = tipoDoAnuncio(ad);
  const nome = NOME_RESULTADO[tipo];
  const ctrRel = ref.ctr > 0 ? ad.ctr / ref.ctr : 1;

  // Zero resultado com gasto relevante: o problema mais acionável que existe,
  // e o motor antigo nem tinha este veredito (julgava por CTR).
  if (tipo === "nenhum") {
    const nomeDominante = NOME_RESULTADO[ref.tipoDominante];
    const refDominante = ref.custoPorTipo[ref.tipoDominante];
    const gastoRelevante = refDominante ? ad.spend >= refDominante * 2 : ad.spend >= 50;
    if (gastoRelevante) {
      const diagnostico =
        ctrRel >= 1.2
          ? "O anúncio atrai clique, então o problema está depois dele: oferta, página ou o convite para chamar."
          : ctrRel <= 0.6
            ? "E o CTR baixo diz que o criativo nem chama atenção: é o primeiro a refazer."
            : "O criativo clica na média, mas ninguém vira conversa: o convite para chamar é o suspeito.";
      return {
        tipo: "sem_resultado",
        rotulo: `Gasta sem ${nomeDominante.singular}`,
        porque:
          `${formatCurrency(ad.spend)} gastos no período e nenhuma ${nomeDominante.singular} gerada` +
          (refDominante
            ? `, o suficiente para ${Math.floor(ad.spend / refDominante)} pelo custo médio da conta. `
            : ". ") +
          diagnostico,
        cor: "text-red-400",
        borda: "border-red-500/40",
      };
    }
    return {
      tipo: "media",
      rotulo: "Sem resultado ainda",
      porque: "Gasto ainda pequeno para condenar. Vale observar mais alguns dias.",
      cor: "text-slate-300",
      borda: "border-slate-700",
    };
  }

  const custo = ad.spend / qtd;
  const refCusto = ref.custoPorTipo[tipo];
  const custoRel = refCusto ? custo / refCusto : 1;
  // Venda é mais rara que conversa: exigir 3 esconderia vencedor real.
  const minimo = tipo === "venda" ? 2 : 3;

  // Vencedor: gera o resultado que importa mais barato que os irmãos.
  if (qtd >= minimo && custoRel <= 0.8) {
    return {
      tipo: "vencedor",
      rotulo: "Vencedor",
      porque:
        `${qtd} ${qtd === 1 ? nome.singular : nome.plural} a ${formatCurrency(custo)} cada, ` +
        `${Math.round((1 - custoRel) * 100)}% mais barato que a média dos anúncios de ${nome.singular} da conta. ` +
        `É o ângulo a escalar e a base para as próximas variações.`,
      cor: "text-emerald-400",
      borda: "border-emerald-500/40",
    };
  }

  // Caro: gera, mas acima do que a conta consegue. O CTR entra como
  // diagnóstico do PORQUÊ, não como sentença.
  if (custoRel >= 1.5) {
    const diagnostico =
      ctrRel >= 1.2
        ? "O CTR alto mostra que o anúncio chama, mas atrai gente que não vira: promessa e oferta não estão contando a mesma história."
        : ctrRel <= 0.6
          ? "O CTR baixo encarece tudo: pouca gente clica, e o leilão cobra por isso. Criativo novo tende a resolver."
          : "Criativo e clique estão na média: o custo alto vem de público ou lance.";
    return {
      tipo: "caro",
      rotulo:
        tipo === "venda" ? "Vendendo caro" : tipo === "conversa" ? "Conversa cara" : "Lead caro",
      porque:
        `Cada ${nome.singular} custa ${formatCurrency(custo)}, ${Math.round((custoRel - 1) * 100)}% acima ` +
        `da média da conta. ${diagnostico}`,
      cor: "text-amber-400",
      borda: "border-amber-500/40",
    };
  }

  // Fadiga só importa quando o custo já sente o desgaste.
  if (ad.frequency >= 3.5 && custoRel >= 1.15) {
    return {
      tipo: "fadiga",
      rotulo: "Fadigando",
      porque:
        `Cada pessoa viu ${ad.frequency.toFixed(1)} vezes e o custo por ${nome.singular} já está ` +
        `${Math.round((custoRel - 1) * 100)}% acima da média: a audiência está saturando. ` +
        `Criativo novo ou público novo antes que encareça mais.`,
      cor: "text-orange-400",
      borda: "border-orange-500/40",
    };
  }

  return {
    tipo: "media",
    rotulo: "Na média",
    porque: `${qtd} ${qtd === 1 ? nome.singular : nome.plural} a ${formatCurrency(custo)} cada, em linha com a conta. Não é o problema nem a solução.`,
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

  // Referências POR TIPO de resultado (venda/conversa/lead), ponderadas.
  const ref = useMemo(() => calcularReferencias(creatives), [creatives]);

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
    ["sem_resultado", "caro", "fadiga"].includes(x.veredito.tipo),
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
                    {" "}(
                    {formatCurrency(tipoDoAnuncio(ad).qtd > 0 ? ad.spend / tipoDoAnuncio(ad).qtd : 0)}
                    /{NOME_RESULTADO[tipoDoAnuncio(ad).tipo].singular})
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
                    {(() => {
                      const { tipo, qtd } = tipoDoAnuncio(ad);
                      const nome = NOME_RESULTADO[tipo];
                      const rotulo = qtd === 1 ? nome.singular : nome.plural;
                      return (
                        <>
                          <span className={tipo === "venda" ? "font-bold text-emerald-500" : "text-slate-500"}>
                            {rotulo.charAt(0).toUpperCase() + rotulo.slice(1)}
                          </span>
                          <span className={cn("text-right font-semibold", tipo === "venda" ? "text-emerald-400" : "text-slate-200")}>
                            {formatNumber(qtd)}
                          </span>
                          <span className="text-slate-500">Custo/{nome.singular}</span>
                          <span className="text-right font-semibold text-slate-200">
                            {qtd > 0 ? formatCurrency(ad.spend / qtd) : "—"}
                          </span>
                        </>
                      );
                    })()}
                    <span className="text-slate-500">Gasto</span>
                    <span className="text-right font-semibold text-slate-300">{formatCurrency(ad.spend)}</span>
                    <span className="text-slate-500">CTR</span>
                    <span className="text-right text-slate-400">{ad.ctr.toFixed(2)}%</span>
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
