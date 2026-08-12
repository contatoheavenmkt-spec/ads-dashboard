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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Award, ExternalLink, Eye, Flame, Loader2, MousePointerClick,
  PauseCircle, PlayCircle, TrendingDown, X,
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
  /** Nome da conta de anúncios no Meta — o agrupador natural na visão geral. */
  accountName?: string;
}

type Veredito = {
  tipo: "vencedor" | "sem_resultado" | "caro" | "fadiga" | "media" | "sem_amostra";
  rotulo: string;
  /** Versão curta para a linha da lista no celular, onde a coluna é estreita. */
  curto?: string;
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
        curto: "Queima verba",
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
      curto: "Sem resultado",
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
  // Estes voltaram a existir na tela depois que a busca passou a partir de
  // quem ENTREGOU (o filtro antigo de status escondia anúncio reprovado que
  // já tinha gasto verba). Sem rótulo próprio eles cairiam no fallback e
  // apareceriam como "Pausado", que é mentira.
  WITH_ISSUES: { texto: "Com problema", cor: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  DISAPPROVED: { texto: "Reprovado", cor: "text-red-400 bg-red-500/10 border-red-500/30" },
  PENDING_REVIEW: { texto: "Em revisão", cor: "text-sky-400 bg-sky-500/10 border-sky-500/30" },
  IN_PROCESS: { texto: "Processando", cor: "text-sky-400 bg-sky-500/10 border-sky-500/30" },
  PREAPPROVED: { texto: "Pré-aprovado", cor: "text-sky-400 bg-sky-500/10 border-sky-500/30" },
  PENDING_BILLING_INFO: { texto: "Pagamento pendente", cor: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  DELETED: { texto: "Excluído", cor: "text-slate-500 bg-slate-800/40 border-slate-700" },
  DESCONHECIDO: { texto: "Sem status", cor: "text-slate-500 bg-slate-800/40 border-slate-700" },
};

/** Status desconhecido não pode virar "Pausado" — inventa informação. */
const STATUS_PADRAO = STATUS_ROTULO.DESCONHECIDO;

/** Cards por leva (a grade comporta mais que a lista). */
const POR_PAGINA = 10;

export function AnaliseCriativos({
  creatives,
  workspaceIdParam,
  agregadoSemConta,
  mostrarCusto = true,
  periodo,
  avisos,
}: {
  creatives: AdAnalisado[];
  workspaceIdParam?: string | null;
  /** true quando a visão é "Todas as Fontes": agrupa por conta de anúncios. */
  agregadoSemConta: boolean;
  /** false quando o dono escondeu investimento do cliente final: some todo R$. */
  mostrarCusto?: boolean;
  /** Janela sendo exibida. Sem isso "Rodaram (25)" é número sem régua. */
  periodo?: string | null;
  /** Contas cuja busca falhou — dado incompleto tem que ser dito, não escondido. */
  avisos?: { conta: string; erro: string }[];
}) {
  const [filtro, setFiltro] = useState<"rodaram" | "ativos" | "pausados">("rodaram");
  const [aberto, setAberto] = useState<AdAnalisado | null>(null);
  // Quantos cards mostrar de cada vez — 100+ anúncios empilhados viram poluição;
  // o "Mostrar mais" traz o resto só de quem quiser.
  const [limite, setLimite] = useState(POR_PAGINA);
  // Dataset novo (troca de conta/período no Header, sem remontar o componente)
  // volta a paginação pro início — senão um "Mostrar mais" antigo vaza pro
  // cliente seguinte. Ajuste durante o render, padrão oficial do React pra
  // derivar estado de prop sem useEffect.
  const [creativesAnterior, setCreativesAnterior] = useState(creatives);
  if (creativesAnterior !== creatives) {
    setCreativesAnterior(creatives);
    setLimite(POR_PAGINA);
  }

  // Rolou de volta ao topo da lista => recolhe pro tamanho padrão. O
  // IntersectionObserver serve aqui porque quem rola pode ser um container
  // interno (dash do cliente), não a janela — a posição na viewport muda
  // igual. Só arma depois que a sentinela saiu de vista uma vez, senão
  // recolheria no mesmo instante em que o usuário clica em "Ver mais".
  const topoRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (limite <= POR_PAGINA) return;
    const alvo = topoRef.current;
    if (!alvo) return;
    let saiuDeVista = false;
    const io = new IntersectionObserver(([entrada]) => {
      if (!entrada.isIntersecting) { saiuDeVista = true; return; }
      if (saiuDeVista) setLimite(POR_PAGINA);
    });
    io.observe(alvo);
    return () => io.disconnect();
  }, [limite]);

  // Dedupe por id: defesa contra o mesmo anúncio chegar N vezes quando a mesma
  // conta está ligada a mais de um workspace (a rota já deduplica, isto é cinto
  // de segurança pra qualquer outro caminho).
  const unicos = useMemo(() => {
    const vistos = new Map<string, AdAnalisado>();
    for (const ad of creatives) if (!vistos.has(ad.id)) vistos.set(ad.id, ad);
    return [...vistos.values()];
  }, [creatives]);

  // Referências POR TIPO de resultado (venda/conversa/lead), ponderadas.
  const ref = useMemo(() => calcularReferencias(unicos), [unicos]);

  const analisados = useMemo(
    () => unicos.map((ad) => ({ ad, veredito: analisar(ad, ref) })),
    [unicos, ref],
  );

  const visiveis = useMemo(() => {
    if (filtro === "ativos") return analisados.filter((x) => x.ad.status === "ACTIVE");
    if (filtro === "pausados") return analisados.filter((x) => x.ad.status !== "ACTIVE");
    return analisados;
  }, [analisados, filtro]);

  const ativos = analisados.filter((x) => x.ad.status === "ACTIVE").length;
  const pausados = analisados.length - ativos;

  // Agrupado por CONTA de anúncios, dinheiro primeiro: grupos ordenados por
  // gasto total e, dentro deles, anúncios por gasto. A visão "Todas as Fontes"
  // intercalava contas por impressão — parecia bagunça sem dono.
  const grupos = useMemo(() => {
    const porConta = new Map<string, { chave: string; nome: string; itens: { ad: AdAnalisado; veredito: Veredito }[] }>();
    for (const item of visiveis) {
      const chave = item.ad.adAccountId ?? "sem-conta";
      const g = porConta.get(chave) ?? {
        chave,
        nome: item.ad.accountName || item.ad.clientName || "Conta de anúncios",
        itens: [],
      };
      g.itens.push(item);
      porConta.set(chave, g);
    }
    const gastoDe = (itens: { ad: AdAnalisado }[]) => itens.reduce((s, x) => s + x.ad.spend, 0);
    const lista = [...porConta.values()].map((g) => ({
      ...g,
      itens: [...g.itens].sort((a, b) => b.ad.spend - a.ad.spend),
      gasto: gastoDe(g.itens),
    }));
    lista.sort((a, b) => b.gasto - a.gasto);
    return lista;
  }, [visiveis]);

  // Pagina ATRAVÉS dos grupos em sequência: seções inteiras até o limite,
  // a última possivelmente parcial. "Mostrar mais" continua global.
  const comCabecalho = agregadoSemConta && grupos.length > 1;
  let restante = limite;
  const secoes = grupos
    .map((g) => {
      const mostrar = restante > 0 ? g.itens.slice(0, restante) : [];
      restante -= mostrar.length;
      return { ...g, mostrar };
    })
    .filter((s) => s.mostrar.length > 0);

  return (
    <div className="glass-panel flex flex-col rounded-2xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-2.5">
          <h3 className="text-xs font-black uppercase tracking-[0.15em] text-white/80 sm:text-sm sm:tracking-[0.2em]">
            Análise de criativos
          </h3>
          {/* A janela SEMPRE visível: sem ela "Rodaram (25)" é número sem
              régua, e no celular o seletor de período vira só um ícone —
              não dava pra saber se faltava anúncio ou se ele não entregou. */}
          {periodo ? (
            <span className="whitespace-nowrap text-[10px] font-semibold text-slate-500">
              {periodo}
            </span>
          ) : null}
        </div>
        {/* Rótulos curtos e sem quebra: "Rodaram no período" virava duas
            linhas por pill no mobile e empurrava tudo. */}
        <div className="no-scrollbar flex max-w-full gap-1 overflow-x-auto">
          {[
            { id: "rodaram" as const, label: `Rodaram (${analisados.length})`, dica: "Tudo que teve entrega no período, incluindo o que já foi pausado" },
            { id: "ativos" as const, label: `Ativos (${ativos})`, dica: "Somente anúncios ativos agora" },
            { id: "pausados" as const, label: `Pausados (${pausados})`, dica: "Rodaram no período mas estão pausados" },
          ].map((f) => (
            <button
              key={f.id}
              title={f.dica}
              onClick={() => {
                // Guard: reclique no filtro já ativo não pode colapsar a
                // lista expandida de volta pra 18 (o scroll saltaria).
                if (f.id === filtro) return;
                setFiltro(f.id);
                setLimite(POR_PAGINA);
              }}
              className={cn(
                "whitespace-nowrap rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
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

      {/* Sentinela do topo: quando ela reaparece (usuário rolou de volta pro
          começo), a lista expandida volta a mostrar só a primeira leva. */}
      <div ref={topoRef} aria-hidden />

      {avisos && avisos.length > 0 ? (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-[11px] text-amber-300">
          Não foi possível carregar {avisos.length === 1 ? "a conta" : "as contas"}{" "}
          {avisos.map((a) => a.conta).join(", ")}. A lista abaixo está incompleta.
        </div>
      ) : null}

      {visiveis.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <p className="text-xs text-slate-400">
            Nenhum anúncio {filtro === "ativos" ? "ativo" : filtro === "pausados" ? "pausado" : ""} entregou
            {periodo ? ` em ${periodo.toLowerCase()}` : " no período"}.
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-[11px] leading-relaxed text-slate-600">
            A lista mostra o que teve entrega na janela escolhida. Amplie o período no topo
            da tela para ver criativos anteriores.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {secoes.map((secao) => (
            <div key={secao.chave}>
              {comCabecalho && (
                <div
                  className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
                  title={secao.itens[0]?.ad.clientName || undefined}
                >
                  <span className="text-[11px] font-black uppercase tracking-wider text-cyan-300">
                    {secao.nome}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {secao.itens.length} {secao.itens.length === 1 ? "anúncio" : "anúncios"}
                    {mostrarCusto ? ` · ${formatCurrency(secao.gasto)} no período` : ""}
                  </span>
                </div>
              )}
              {/* Cards lado a lado com o criativo GRANDE: a peça é o que se
                  analisa, e miniatura de 44px não deixa ver o anúncio. Duas
                  colunas no celular (uma só virava rolagem infinita) e até
                  cinco no desktop, onde a imagem fica realmente visível. */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {secao.mostrar.map(({ ad, veredito }) => {
                  const st = STATUS_ROTULO[ad.status] ?? STATUS_PADRAO;
                  const ehAtivo = ad.status === "ACTIVE";
                  const { tipo, qtd } = tipoDoAnuncio(ad);
                  const nome = NOME_RESULTADO[tipo];
                  const ehVenda = tipo === "venda";
                  return (
                    <button
                      key={ad.id}
                      onClick={() => setAberto(ad)}
                      className={cn(
                        "group flex flex-col overflow-hidden rounded-xl border bg-slate-900/40 text-left transition-all hover:-translate-y-0.5 hover:bg-slate-900/70",
                        veredito.borda,
                      )}
                      title="Clique para ver o anúncio real"
                    >
                      <div className="relative aspect-[4/5] w-full overflow-hidden bg-slate-800">
                        {ad.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={ad.thumbnail}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-widest text-slate-600">
                            sem imagem
                          </div>
                        )}
                        {/* Status escrito só quando foge do normal; ativo é o
                            caso comum e o badge repetido virava ruído. */}
                        {!ehAtivo && (
                          <span className={cn("absolute left-2 top-2 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase backdrop-blur-sm", st.cor)}>
                            {st.texto}
                          </span>
                        )}
                        <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                          <span className="flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white">
                            <Eye size={13} /> Ver anúncio
                          </span>
                        </span>
                      </div>

                      <div className="flex flex-1 flex-col gap-1.5 p-2.5 sm:p-3">
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-semibold text-slate-100 sm:text-xs">{ad.name}</p>
                          <p className="mt-0.5 flex items-center gap-1.5">
                            <span
                              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", ehAtivo ? "bg-emerald-400" : "bg-slate-600")}
                              title={st.texto}
                            />
                            <span className={cn("truncate text-[10px] font-bold uppercase tracking-wide", veredito.cor)}>
                              <span className="sm:hidden">{veredito.curto ?? veredito.rotulo}</span>
                              <span className="hidden sm:inline">{veredito.rotulo}</span>
                            </span>
                          </p>
                        </div>

                        {/* O número que decide primeiro e grande; gasto por
                            último e apagado. */}
                        <div className="mt-auto flex items-end justify-between gap-2 border-t border-slate-800/80 pt-2">
                          <div className="min-w-0">
                            <p className={cn("text-sm font-black leading-none", ehVenda ? "text-emerald-400" : "text-slate-100")}>
                              {formatNumber(qtd)}
                            </p>
                            <p className="mt-0.5 truncate text-[9px] uppercase tracking-wide text-slate-500">
                              {qtd === 1 ? nome.singular : nome.plural}
                            </p>
                          </div>
                          {mostrarCusto && (
                            <div className="min-w-0 text-right">
                              <p className="truncate text-xs font-bold leading-none text-slate-100">
                                {qtd > 0 ? formatCurrency(ad.spend / qtd) : "—"}
                              </p>
                              <p className="mt-0.5 truncate text-[9px] uppercase tracking-wide text-slate-500">custo</p>
                            </div>
                          )}
                        </div>
                        {mostrarCusto && (
                          <p className="text-[9px] uppercase tracking-wide text-slate-600">
                            {formatCurrency(ad.spend)} gastos
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {visiveis.length > limite ? (
        <button
          onClick={() => setLimite((l) => l + POR_PAGINA)}
          className="mx-auto mt-4 rounded-lg border border-slate-700/80 bg-slate-800/60 px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
        >
          Ver mais ({visiveis.length - limite} restantes)
        </button>
      ) : limite > POR_PAGINA ? (
        <button
          onClick={() => { setLimite(POR_PAGINA); topoRef.current?.scrollIntoView({ block: "nearest" }); }}
          className="mx-auto mt-4 rounded-lg border border-slate-800 bg-slate-900/60 px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
        >
          Ver menos
        </button>
      ) : null}

      {aberto ? (
        <ModalAnuncio
          ad={aberto}
          veredito={analisar(aberto, ref)}
          workspaceIdParam={workspaceIdParam}
          mostrarCusto={mostrarCusto}
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
  mostrarCusto,
  onFechar,
}: {
  ad: AdAnalisado;
  veredito: Veredito;
  workspaceIdParam?: string | null;
  mostrarCusto: boolean;
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

  // Modal aberto: trava o scroll do fundo (no celular a página rolava por
  // baixo do overlay) e fecha no ESC.
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKey);
    };
  }, [onFechar]);

  const st = STATUS_ROTULO[ad.status] ?? STATUS_PADRAO;
  const custoResultado = ad.conversions > 0 ? ad.spend / ad.conversions : null;

  // Portal no body: o painel pai usa backdrop-filter, que cria containing
  // block e prende position:fixed DENTRO do painel — no mobile o modal
  // abria a milhares de px da viewport, invisível. No body o fixed volta
  // a valer contra a viewport de verdade.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4"
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
              {ad.accountName || ad.clientName ? (
                <span
                  className="max-w-[200px] truncate rounded-md border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-bold text-cyan-300"
                  title={ad.clientName || undefined}
                >
                  {ad.accountName || ad.clientName}
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
          {/* overflow-hidden + max-h-full: a linha do grid pode ficar menor
              que os 560px do iframe (aconteceu no mobile) e sem isso ele
              vazava por cima do bloco seguinte. Preso à célula, o preview
              rola dentro do próprio iframe se faltar altura. */}
          <div className="flex min-h-[420px] items-center justify-center overflow-hidden bg-slate-950/60 p-3">
            {carregandoPreview ? (
              <Loader2 className="animate-spin text-slate-600" size={22} />
            ) : iframeUrl ? (
              <iframe
                src={iframeUrl}
                className="h-[560px] max-h-full w-full max-w-[340px] rounded-lg border-0 bg-white"
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
            {/* O porquê cita valores em R$ — se o dono escondeu investimento
                do cliente final, a explicação inteira fica de fora. */}
            {mostrarCusto && (
              <div className={cn("rounded-xl border p-3", veredito.borda)}>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Por que este veredito
                </p>
                <p className="text-xs leading-relaxed text-slate-200">{veredito.porque}</p>
              </div>
            )}

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
                {mostrarCusto && (
                  <Metrica icone={<TrendingDown size={12} />} rotulo="Gasto" valor={formatCurrency(ad.spend)} />
                )}
                <Metrica
                  icone={<Award size={12} />}
                  rotulo={ad.isMessaging ? "Conversas" : ad.purchases > 0 ? "Vendas" : "Resultados"}
                  valor={`${formatNumber(ad.conversions)}${mostrarCusto && custoResultado !== null ? ` (${formatCurrency(custoResultado)} cada)` : ""}`}
                />
                <Metrica icone={<Flame size={12} />} rotulo="Frequência" valor={`${ad.frequency.toFixed(1)}x por pessoa`} />
                {mostrarCusto && (
                  <Metrica icone={<PauseCircle size={12} />} rotulo="CPM" valor={formatCurrency(ad.cpm)} />
                )}
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
    </div>,
    document.body,
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
