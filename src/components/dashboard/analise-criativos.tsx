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
  Award, ChevronLeft, ChevronRight, ExternalLink, Eye, Flame, Loader2,
  MousePointerClick, PauseCircle, PlayCircle, TrendingDown, X,
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
  /**
   * Posição na ordem do melhor para o pior (0 = melhor). Campo obrigatório
   * de propósito: cada veredito declara onde entra na fila, e o compilador
   * cobra isso de todo caminho novo — ordenar por `tipo` num switch lá na
   * tela deixaria um veredito futuro cair em silêncio no fim da lista.
   */
  rank: number;
  /**
   * Nota do anúncio dentro do mesmo veredito: resultados entregues ajustados
   * pela eficiência (`qtd / custoRel`). Ordenar por GASTO colocava o maior
   * orçamento na frente, e orçamento não é mérito. Só existe para quem
   * entrega — sem resultado, o critério vira "quem queima mais verba".
   */
  nota?: number;
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
 * A ordem em que os anúncios aparecem: do que está funcionando ao que está
 * queimando verba. É a ordem em que o gestor decide — escalar primeiro,
 * cortar depois — e por isso vale mais que ordenar por gasto.
 */
const RANK = {
  vencedor: 0,
  na_media: 1,
  acima_media: 2,
  fadiga: 3,
  caro: 4,
  queima_verba: 5,
  sem_resultado_ainda: 6,
  sem_amostra: 7,
} as const;

/** Acima de 15% da média já não é "em linha com a conta". */
const LIMITE_NA_MEDIA = 1.15;

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
      rank: RANK.sem_amostra,
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
        rank: RANK.queima_verba,
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
      // Zero resultado com gasto pequeno: não é vitória nem condenação, mas
      // fica DEPOIS de quem já entrega — senão subiria à frente de vencedor.
      rank: RANK.sem_resultado_ainda,
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
      rank: RANK.vencedor,
      nota: qtd / custoRel,
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
      rank: RANK.caro,
      nota: qtd / custoRel,
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
      rank: RANK.fadiga,
      nota: qtd / custoRel,
      rotulo: "Fadigando",
      porque:
        `Cada pessoa viu ${ad.frequency.toFixed(1)} vezes e o custo por ${nome.singular} já está ` +
        `${Math.round((custoRel - 1) * 100)}% acima da média: a audiência está saturando. ` +
        `Criativo novo ou público novo antes que encareça mais.`,
      cor: "text-orange-400",
      borda: "border-orange-500/40",
    };
  }

  // O fallback engolia até custoRel 1,49 e ainda dizia "em linha com a
  // conta" — mentira para quem está 45% acima. Agora a faixa 1,15–1,5 sem
  // fadiga tem nome próprio e cai depois de quem realmente está na média.
  if (custoRel >= LIMITE_NA_MEDIA) {
    return {
      tipo: "media",
      rank: RANK.acima_media,
      nota: qtd / custoRel,
      rotulo: "Acima da média",
      curto: "Acima da média",
      porque:
        `Cada ${nome.singular} custa ${formatCurrency(custo)}, ${Math.round((custoRel - 1) * 100)}% acima ` +
        `da média da conta. Ainda entrega, mas é o próximo a otimizar se a verba apertar.`,
      cor: "text-amber-300",
      borda: "border-amber-500/25",
    };
  }

  return {
    tipo: "media",
    rank: RANK.na_media,
    nota: qtd / custoRel,
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

/**
 * As faixas da tela, na ordem em que um gestor olha: o que está no ar
 * primeiro, o que parou depois, o que deu problema por último. Os estados
 * do Meta são mais granulados que isso (conjunto pausado, campanha pausada,
 * reprovado, em revisão...) — o card mostra o detalhe, a faixa agrupa pelo
 * que muda a decisão.
 */
const PAUSADOS = ["PAUSED", "ADSET_PAUSED", "CAMPAIGN_PAUSED"];
const PROBLEMA = ["WITH_ISSUES", "DISAPPROVED", "PENDING_REVIEW", "IN_PROCESS", "PREAPPROVED", "PENDING_BILLING_INFO"];
const ARQUIVADOS = ["ARCHIVED", "DELETED"];

const FAIXAS: Array<{
  chave: string;
  titulo: string;
  cor: string;
  combina: (status: string) => boolean;
}> = [
  { chave: "ativos", titulo: "No ar agora", cor: "text-emerald-400", combina: (s) => s === "ACTIVE" },
  { chave: "pausados", titulo: "Pausados", cor: "text-slate-400", combina: (s) => PAUSADOS.includes(s) },
  { chave: "problema", titulo: "Com problema", cor: "text-amber-400", combina: (s) => PROBLEMA.includes(s) },
  { chave: "arquivados", titulo: "Arquivados", cor: "text-slate-500", combina: (s) => ARQUIVADOS.includes(s) },
  {
    chave: "outros",
    titulo: "Sem status",
    cor: "text-slate-500",
    combina: (s) => s !== "ACTIVE" && ![...PAUSADOS, ...PROBLEMA, ...ARQUIVADOS].includes(s),
  },
];

/** Cards por faixa antes do "ver todos": mantém o DOM leve em janelas longas. */
const POR_FAIXA = 24;

export function AnaliseCriativos({
  creatives,
  workspaceIdParam,
  agregadoSemConta,
  mostrarCusto = true,
  periodo,
  avisos,
  totalComEntrega,
  truncado,
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
  /** Total com entrega no período (pode ser maior que o detalhado na tela). */
  totalComEntrega?: number;
  /** true quando a janela é grande demais e só os maiores foram detalhados. */
  truncado?: boolean;
}) {
  const [aberto, setAberto] = useState<AdAnalisado | null>(null);

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

  /*
   * Referência POR CONTA, não uma média só para tudo.
   *
   * Na visão "Todas as Fontes" a média era calculada sobre a mistura de
   * todos os clientes: uma conta de nicho barato (conversa a R$3) virava
   * vencedora em bloco e uma de ticket alto (conversa a R$40) virava cara em
   * bloco, contra uma média que não é de nenhuma das duas. Como agora o
   * veredito define a ORDEM dos cards, isso ordenaria a faixa por cliente.
   * O próprio texto do card já promete "a média da conta" — agora é verdade.
   *
   * Conta com menos de 2 anúncios com amostra cai na referência global: com
   * um anúncio só, ele seria sempre a própria média e nunca teria veredito.
   */
  const refPorConta = useMemo(() => {
    const grupos = new Map<string, AdAnalisado[]>();
    for (const ad of unicos) {
      const chave = ad.adAccountId ?? "sem-conta";
      const lista = grupos.get(chave) ?? [];
      lista.push(ad);
      grupos.set(chave, lista);
    }
    const mapa = new Map<string, Referencias>();
    for (const [chave, lista] of grupos) {
      const comAmostra = lista.filter((a) => a.impressions >= 1000 || a.spend >= 50);
      mapa.set(chave, comAmostra.length >= 2 ? calcularReferencias(lista) : ref);
    }
    return mapa;
  }, [unicos, ref]);

  const refDoAnuncio = useCallback(
    (ad: AdAnalisado) => refPorConta.get(ad.adAccountId ?? "sem-conta") ?? ref,
    [refPorConta, ref],
  );

  const analisados = useMemo(
    () => unicos.map((ad) => ({ ad, veredito: analisar(ad, refDoAnuncio(ad)) })),
    [unicos, refDoAnuncio],
  );

  /*
   * Uma FAIXA por situação, cada uma arrastando pro lado. Filtro em pill
   * obrigava a escolher uma coisa de cada vez e escondia o resto; com faixas
   * separadas o gestor vê "o que está no ar" e "o que já parou" na mesma
   * rolada, sem a parede de imagem que a grade única virava.
   */
  const faixas = useMemo(() => {
    const definicao = FAIXAS.map((f) => ({
      ...f,
      itens: analisados
        .filter((x) => f.combina(x.ad.status))
        /*
         * Vencedores primeiro, depois na média, e por último os que queimam
         * verba. Dentro do mesmo veredito manda a NOTA (resultado entregue
         * ajustado pela eficiência) — desempatar por gasto colocava o maior
         * orçamento na frente, e orçamento não é mérito. Quem não entrega
         * não tem nota: entre esses, quem torra mais verba primeiro, que é
         * o mais urgente.
         */
        .sort((a, b) => {
          if (a.veredito.rank !== b.veredito.rank) return a.veredito.rank - b.veredito.rank;
          const na = a.veredito.nota;
          const nb = b.veredito.nota;
          if (na != null && nb != null && na !== nb) return nb - na;
          return b.ad.spend - a.ad.spend;
        }),
    }));
    return definicao.filter((f) => f.itens.length > 0);
  }, [analisados]);

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
        {/* O total é o que REALMENTE entregou, não o que coube na tela: com
            a janela longa truncada, dizer "200 rodaram" contradiria o aviso
            logo abaixo, que fala em 1.486. */}
        <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {formatNumber(Math.max(totalComEntrega ?? 0, analisados.length))}{" "}
          {Math.max(totalComEntrega ?? 0, analisados.length) === 1 ? "anúncio rodou" : "anúncios rodaram"}
        </span>
      </div>

      {avisos && avisos.length > 0 ? (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-[11px] leading-relaxed text-amber-300">
          Não foi possível carregar {avisos.length === 1 ? "a conta" : "as contas"}{" "}
          <span className="font-semibold">{avisos.map((a) => a.conta).join(", ")}</span>.{" "}
          {/* O motivo importa: "limite temporário" pede outra tentativa,
              "token expirado" pede reconectar. Sem ele o gestor só vê falha. */}
          {avisos[0].erro}
        </div>
      ) : null}

      {truncado && totalComEntrega ? (
        <div className="mb-3 rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
          Janela longa: mostrando os <span className="font-semibold text-slate-200">{formatNumber(analisados.length)}</span> anúncios
          de maior investimento entre os {formatNumber(totalComEntrega)} que tiveram entrega.
          Reduza o período para ver todos.
        </div>
      ) : null}

      {analisados.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <p className="text-xs text-slate-400">
            Nenhum anúncio entregou{periodo ? ` em ${periodo.toLowerCase()}` : " no período"}.
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-[11px] leading-relaxed text-slate-600">
            A tela mostra o que teve entrega na janela escolhida. Amplie o período no topo
            para ver criativos anteriores.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {faixas.map((faixa) => (
            <Faixa
              key={faixa.chave}
              titulo={faixa.titulo}
              cor={faixa.cor}
              itens={faixa.itens}
              mostrarCusto={mostrarCusto}
              mostrarConta={agregadoSemConta}
              onAbrir={setAberto}
            />
          ))}
        </div>
      )}

      {aberto ? (
        <ModalAnuncio
          ad={aberto}
          veredito={analisar(aberto, refDoAnuncio(aberto))}
          workspaceIdParam={workspaceIdParam}
          mostrarCusto={mostrarCusto}
          onFechar={() => setAberto(null)}
        />
      ) : null}
    </div>
  );
}

/** Uma situação (no ar / pausado / com problema) numa fileira que arrasta. */
function Faixa({
  titulo,
  cor,
  itens,
  mostrarCusto,
  mostrarConta,
  onAbrir,
}: {
  titulo: string;
  cor: string;
  itens: { ad: AdAnalisado; veredito: Veredito }[];
  mostrarCusto: boolean;
  mostrarConta: boolean;
  onAbrir: (ad: AdAnalisado) => void;
}) {
  const trilhoRef = useRef<HTMLDivElement>(null);
  const [todos, setTodos] = useState(false);
  const visiveis = todos ? itens : itens.slice(0, POR_FAIXA);
  const gasto = itens.reduce((soma, x) => soma + x.ad.spend, 0);
  const escondidosRuins = todos
    ? 0
    : itens.slice(POR_FAIXA).filter((x) => x.veredito.tipo === "sem_resultado").length;

  /*
   * Setas em TODAS as larguras. No celular o trilho não tem barra de rolagem
   * (.no-scrollbar) e, num 390px, dois cards cabem exatos — nem sobra a borda
   * do terceiro para sugerir que há mais. Sem as setas, nada indicava
   * profundidade, e agora o fim da fileira é onde mora o que queima verba.
   * Rola quase uma "tela" por clique, em vez de 420px fixos.
   */
  const rolar = (direcao: 1 | -1) => {
    const trilho = trilhoRef.current;
    if (!trilho) return;
    trilho.scrollBy({ left: direcao * Math.max(200, trilho.clientWidth * 0.85), behavior: "smooth" });
  };

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h4 className={cn("text-[11px] font-black uppercase tracking-wider", cor)}>{titulo}</h4>
        <span className="text-[10px] text-slate-500">
          {itens.length}
          {mostrarCusto ? ` · ${formatCurrency(gasto)}` : ""}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {itens.length > POR_FAIXA && (
            <button
              onClick={() => setTodos((v) => !v)}
              className="rounded-md border border-slate-800 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
              {todos ? (
                "Ver menos"
              ) : (
                <>
                  Ver todos ({itens.length})
                  {/* Com a ordem por veredito o PIOR foi para o fim da fila, e
                      o corte de 24 passou a escondê-lo. Antes o maior gastador
                      era o card nº 1. Se sobrou alguém queimando verba atrás
                      do corte, o botão diz. */}
                  {escondidosRuins > 0 && (
                    <span className="text-red-400"> · {escondidosRuins} queimando verba</span>
                  )}
                </>
              )}
            </button>
          )}
          <button
            onClick={() => rolar(-1)}
            aria-label="Voltar"
            className="rounded-md border border-slate-800 p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => rolar(1)}
            aria-label="Avançar"
            className="rounded-md border border-slate-800 p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div
        ref={trilhoRef}
        className="no-scrollbar -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1"
      >
        {visiveis.map(({ ad, veredito }) => {
          const st = STATUS_ROTULO[ad.status] ?? STATUS_PADRAO;
          const ehAtivo = ad.status === "ACTIVE";
          const { tipo, qtd } = tipoDoAnuncio(ad);
          const nome = NOME_RESULTADO[tipo];
          const ehVenda = tipo === "venda";
          return (
            <button
              key={ad.id}
              onClick={() => onAbrir(ad)}
              className={cn(
                "group flex w-[158px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border bg-slate-900/40 text-left transition-all hover:-translate-y-0.5 hover:bg-slate-900/70 sm:w-[196px]",
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
                    loading="lazy"
                    className="h-full w-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-widest text-slate-600">
                    sem imagem
                  </div>
                )}
                {/* O estado exato só sobre a imagem quando foge do normal: a
                    faixa já diz a situação, o badge detalha (conjunto pausado,
                    reprovado...). Em "No ar agora" seria repetição. */}
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

              <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold text-slate-100 sm:text-xs">{ad.name}</p>
                  {/* Na visão agregada, de quem é o anúncio. Nome da CONTA do
                      Meta, não de workspace: mesclar cadastros confundia. */}
                  {mostrarConta && ad.accountName ? (
                    <p className="truncate text-[9px] text-cyan-300/80" title={ad.accountName}>
                      {ad.accountName}
                    </p>
                  ) : null}
                  <p className={cn("mt-0.5 truncate text-[10px] font-bold uppercase tracking-wide", veredito.cor)}>
                    <span className="sm:hidden">{veredito.curto ?? veredito.rotulo}</span>
                    <span className="hidden sm:inline">{veredito.rotulo}</span>
                  </p>
                </div>

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
    </section>
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
