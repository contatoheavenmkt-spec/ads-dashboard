import type {
  Anuncio,
  ContextoAnalise,
  Palavra,
  RealidadeCrm,
  Sugestao,
} from "./tipos";

/**
 * Motor de sugestões. Determinístico, sem LLM e sem rede.
 *
 * Toda sugestão que sai daqui é uma proposta: quem aplica é uma pessoa
 * clicando em aprovar. Isso é deliberado, porque errar aqui mexe na verba do
 * cliente, e um número que parece ruim numa janela curta muitas vezes é só
 * amostra pequena.
 *
 * As duas últimas regras são o diferencial do produto: elas só existem porque
 * o Track trouxe a venda real do WhatsApp de volta. Sem isso, a IA estaria
 * julgando pela conversão declarada no Google, que conta formulário
 * preenchido e clique no botão de WhatsApp como se fossem faturamento.
 */

const REAIS_POR_MICRO = 1 / 1_000_000;

function cpa(custo: number, conversoes: number): number | null {
  return conversoes > 0 ? custo / conversoes : null;
}

function reais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/** Projeta o gasto da janela para 30 dias, que é como o cliente pensa. */
function porMes(valor: number, diasDaJanela: number): number {
  if (diasDaJanela <= 0) return 0;
  return (valor / diasDaJanela) * 30;
}

/* ─────────────────── 1. gasto sem nenhuma conversão ─────────────────── */

function gastoSemConversao(ctx: ContextoAnalise): Sugestao[] {
  const { politica: p } = ctx;
  // Sem meta de CPA, usa um piso absoluto: gastar R$150 sem nenhuma conversão
  // já é sinal suficiente, independentemente do negócio.
  const limite = p.targetCpa ? p.targetCpa * 3 : 150;
  const out: Sugestao[] = [];

  const avaliar = (item: Palavra | Anuncio, ehPalavra: boolean) => {
    if (item.conversoes > 0) return;
    if (item.custo < limite) return;
    // Poucos cliques com custo alto é CPC caro, não necessariamente item ruim.
    if (item.cliques < 15) return;

    const nome = ehPalavra ? (item as Palavra).texto : `Anúncio ${(item as Anuncio).id}`;
    // Pausar o último anúncio ativo do grupo derruba o grupo inteiro.
    if (!ehPalavra && (item as Anuncio).ativosNoGrupo <= 1) return;

    out.push({
      ruleCode: "GASTO_SEM_CONVERSAO",
      severidade: item.custo >= limite * 2 ? "alta" : "media",
      escopo: ehPalavra ? "palavra" : "anuncio",
      entityId: ehPalavra ? (item as Palavra).criterioId : (item as Anuncio).id,
      entityNome: nome,
      campaignId: item.campaignId,
      adGroupId: item.adGroupId,
      titulo: `${ehPalavra ? "Palavra" : "Anúncio"} gastou ${reais(item.custo)} sem nenhuma conversão`,
      porque:
        `Em ${p.lookbackDays} dias, ${ehPalavra ? `a palavra "${nome}"` : "este anúncio"} teve ` +
        `${item.cliques} cliques e ${reais(item.custo)} de custo, e nenhuma conversão. ` +
        (p.targetCpa
          ? `Isso é ${(item.custo / p.targetCpa).toFixed(1)} vezes a meta de CPA (${reais(p.targetCpa)}).`
          : `Sem meta de CPA definida, o corte usado foi ${reais(limite)}.`),
      evidencia: {
        custo: item.custo,
        cliques: item.cliques,
        conversoes: 0,
        janelaDias: p.lookbackDays,
        limiteUsado: limite,
      },
      impactoEstimado: porMes(item.custo, p.lookbackDays),
      acao: ehPalavra
        ? { tipo: "pausar_palavra", adGroupId: item.adGroupId, criterioId: (item as Palavra).criterioId }
        : { tipo: "pausar_anuncio", adGroupId: item.adGroupId, adId: (item as Anuncio).id },
    });
  };

  for (const palavra of ctx.palavras) avaliar(palavra, true);
  for (const anuncio of ctx.anuncios) avaliar(anuncio, false);
  return out;
}

/* ─────────────────── 2. CPA acima da meta ─────────────────── */

function cpaAcimaDaMeta(ctx: ContextoAnalise): Sugestao[] {
  const { politica: p } = ctx;
  if (!p.targetCpa) return [];

  const out: Sugestao[] = [];
  for (const c of ctx.campanhas) {
    if (c.status !== "ENABLED") continue;
    // Amostra pequena mente: com 3 conversões, o CPA oscila demais.
    if (c.conversoes < p.minConversionsForCpa) continue;

    const cpaAtual = cpa(c.custo, c.conversoes);
    if (cpaAtual === null || cpaAtual <= p.targetCpa * 1.4) continue;

    const muitoAcima = cpaAtual > p.targetCpa * 2.5;
    const excedente = c.custo - c.conversoes * p.targetCpa;

    if (muitoAcima) {
      out.push({
        ruleCode: "CPA_MUITO_ACIMA",
        severidade: "critica",
        escopo: "campanha",
        entityId: c.id,
        entityNome: c.nome,
        campaignId: c.id,
        adGroupId: null,
        titulo: `${c.nome}: CPA de ${reais(cpaAtual)}, mais que o dobro da meta`,
        porque:
          `A campanha gastou ${reais(c.custo)} para ${c.conversoes} conversões em ${p.lookbackDays} dias, ` +
          `o que dá ${reais(cpaAtual)} por conversão contra a meta de ${reais(p.targetCpa)}. ` +
          `Nesse ritmo são ${reais(porMes(excedente, p.lookbackDays))} por mês acima do que deveria custar.`,
        evidencia: { custo: c.custo, conversoes: c.conversoes, cpaAtual, metaCpa: p.targetCpa, janelaDias: p.lookbackDays },
        impactoEstimado: porMes(excedente, p.lookbackDays),
        acao: { tipo: "pausar_campanha", campaignId: c.id },
      });
      continue;
    }

    if (!c.orcamentoId || c.orcamentoDiario === null || c.orcamentoCompartilhado) continue;
    const novo = Math.round(c.orcamentoDiario * (1 - p.maxBudgetChangePct / 100));
    out.push({
      ruleCode: "CPA_ACIMA_DA_META",
      severidade: "alta",
      escopo: "orcamento",
      entityId: c.orcamentoId,
      entityNome: c.nome,
      campaignId: c.id,
      adGroupId: null,
      titulo: `${c.nome}: reduzir orçamento em ${p.maxBudgetChangePct}%`,
      porque:
        `CPA de ${reais(cpaAtual)} contra meta de ${reais(p.targetCpa)}, com ${c.conversoes} conversões ` +
        `em ${p.lookbackDays} dias (amostra suficiente para confiar no número). ` +
        `Reduzir o orçamento diário de ${reais(c.orcamentoDiario * REAIS_POR_MICRO * 1_000_000)} ` +
        `para ${reais(novo * REAIS_POR_MICRO * 1_000_000)} contém o gasto enquanto a campanha é ajustada.`,
      evidencia: { custo: c.custo, conversoes: c.conversoes, cpaAtual, metaCpa: p.targetCpa, orcamentoAtual: c.orcamentoDiario, orcamentoProposto: novo },
      impactoEstimado: porMes(excedente, p.lookbackDays) * 0.5,
      acao: { tipo: "ajustar_orcamento", orcamentoId: c.orcamentoId, deMicros: c.orcamentoDiario, paraMicros: novo },
    });
  }
  return out;
}

/* ─────────────────── 3. termo de busca irrelevante ─────────────────── */

/** Quanto o termo se parece com alguma palavra do grupo, de 0 a 1. */
function semelhanca(termo: string, palavras: string[]): number {
  const tokens = new Set(termo.toLowerCase().split(/\s+/).filter((t) => t.length > 2));
  if (tokens.size === 0) return 1;
  let melhor = 0;
  for (const p of palavras) {
    const pt = new Set(p.toLowerCase().split(/\s+/).filter((t) => t.length > 2));
    if (pt.size === 0) continue;
    let comuns = 0;
    for (const t of tokens) if (pt.has(t)) comuns++;
    melhor = Math.max(melhor, comuns / tokens.size);
  }
  return melhor;
}

function termoIrrelevante(ctx: ContextoAnalise): Sugestao[] {
  const { politica: p } = ctx;
  const custoMinimo = p.targetCpa ? p.targetCpa * 0.6 : 40;
  const out: Sugestao[] = [];

  for (const t of ctx.termos) {
    if (t.conversoes > 0) continue;
    if (t.cliques < 5) continue;
    if (t.custo < custoMinimo) continue;

    const sim = semelhanca(t.termo, t.palavrasDoGrupo);
    // Termo parecido com a palavra comprada é intenção certa com resultado
    // ruim, que se resolve com lance ou anúncio, não com negativa.
    if (sim >= 0.5) continue;

    out.push({
      ruleCode: "TERMO_IRRELEVANTE",
      severidade: "media",
      escopo: "termo",
      entityId: t.termo,
      entityNome: t.termo,
      campaignId: t.campaignId,
      adGroupId: t.adGroupId,
      titulo: `Negativar "${t.termo}": ${reais(t.custo)} sem conversão`,
      porque:
        `Este termo trouxe ${t.cliques} cliques e custou ${reais(t.custo)} sem nenhuma conversão, ` +
        `e não se parece com nenhuma palavra do grupo (semelhança de ${(sim * 100).toFixed(0)}%). ` +
        `Negativar impede novos cliques dele sem mexer no resto da campanha.`,
      evidencia: { termo: t.termo, cliques: t.cliques, custo: t.custo, semelhanca: sim, palavrasDoGrupo: t.palavrasDoGrupo.slice(0, 5) },
      impactoEstimado: porMes(t.custo, p.lookbackDays),
      acao: { tipo: "negativar_termo", adGroupId: t.adGroupId, termo: t.termo },
    });
  }
  return out;
}

/* ─────────────────── 4. campanha boa limitada por orçamento ─────────────────── */

function limitadaPorOrcamento(ctx: ContextoAnalise): Sugestao[] {
  const { politica: p } = ctx;
  const out: Sugestao[] = [];

  for (const c of ctx.campanhas) {
    if (c.status !== "ENABLED") continue;
    if (c.perdaPorOrcamento === null || c.perdaPorOrcamento <= 0.2) continue;
    if (!c.orcamentoId || c.orcamentoDiario === null) continue;
    // Orçamento compartilhado afeta outras campanhas: fora de questão.
    if (c.orcamentoCompartilhado) continue;

    const cpaAtual = cpa(c.custo, c.conversoes);
    const roas = c.custo > 0 ? c.valorConversoes / c.custo : 0;
    // Só vale aumentar o que já está indo bem.
    const vaiBem =
      (p.targetCpa !== null && cpaAtual !== null && c.conversoes >= p.minConversionsForCpa && cpaAtual <= p.targetCpa * 0.8) ||
      (p.targetRoas !== null && roas >= p.targetRoas);
    if (!vaiBem) continue;

    const proposto = Math.round(c.orcamentoDiario * (1 + p.maxBudgetChangePct / 100));
    const teto = p.maxDailyBudgetCeiling ? p.maxDailyBudgetCeiling * 1_000_000 : null;
    if (teto !== null && proposto > teto) continue;

    out.push({
      ruleCode: "LIMITADA_POR_ORCAMENTO",
      severidade: "alta",
      escopo: "orcamento",
      entityId: c.orcamentoId,
      entityNome: c.nome,
      campaignId: c.id,
      adGroupId: null,
      titulo: `${c.nome} está deixando venda na mesa por orçamento`,
      porque:
        `A campanha perde ${(c.perdaPorOrcamento * 100).toFixed(0)}% das impressões por falta de orçamento ` +
        `e está com resultado acima da meta` +
        (cpaAtual !== null ? ` (CPA de ${reais(cpaAtual)})` : "") +
        `. Aumentar o orçamento diário em ${p.maxBudgetChangePct}% aproveita demanda que hoje vai para o concorrente.`,
      evidencia: { perdaPorOrcamento: c.perdaPorOrcamento, cpaAtual, roas, conversoes: c.conversoes, orcamentoAtual: c.orcamentoDiario, orcamentoProposto: proposto },
      // Ganho potencial: o que ela geraria com a fatia de impressão perdida.
      impactoEstimado: porMes(c.valorConversoes * c.perdaPorOrcamento, p.lookbackDays),
      acao: { tipo: "ajustar_orcamento", orcamentoId: c.orcamentoId, deMicros: c.orcamentoDiario, paraMicros: proposto },
    });
  }
  return out;
}

/* ─────────────────── 5. anúncio muito pior que os irmãos ─────────────────── */

function anuncioFraco(ctx: ContextoAnalise): Sugestao[] {
  const out: Sugestao[] = [];
  const porGrupo = new Map<string, Anuncio[]>();
  for (const a of ctx.anuncios) {
    const lista = porGrupo.get(a.adGroupId) ?? [];
    lista.push(a);
    porGrupo.set(a.adGroupId, lista);
  }

  for (const [, anuncios] of porGrupo) {
    if (anuncios.length < 2) continue;
    const impressoesGrupo = anuncios.reduce((s, a) => s + a.impressoes, 0);
    const cliquesGrupo = anuncios.reduce((s, a) => s + a.cliques, 0);
    if (impressoesGrupo === 0) continue;
    const ctrGrupo = cliquesGrupo / impressoesGrupo;

    for (const a of anuncios) {
      if (a.impressoes < 1000) continue;
      if (a.ativosNoGrupo <= 1) continue;
      const ctr = a.cliques / a.impressoes;
      if (ctr >= ctrGrupo * 0.5) continue;

      out.push({
        ruleCode: "ANUNCIO_FRACO",
        severidade: "baixa",
        escopo: "anuncio",
        entityId: a.id,
        entityNome: `Anúncio ${a.id} (${a.adGroupNome})`,
        campaignId: a.campaignId,
        adGroupId: a.adGroupId,
        titulo: `Anúncio com metade do CTR dos outros do grupo`,
        porque:
          `Este anúncio teve ${(ctr * 100).toFixed(2)}% de CTR em ${a.impressoes} impressões, contra ` +
          `${(ctrGrupo * 100).toFixed(2)}% da média do grupo "${a.adGroupNome}". Pausar concentra as ` +
          `impressões nos criativos que funcionam melhor.`,
        evidencia: { ctr, ctrGrupo, impressoes: a.impressoes, cliques: a.cliques, ativosNoGrupo: a.ativosNoGrupo },
        impactoEstimado: porMes(a.custo, ctx.politica.lookbackDays) * 0.3,
        acao: { tipo: "pausar_anuncio", adGroupId: a.adGroupId, adId: a.id },
      });
    }
  }
  return out;
}

/* ─────────────────── 6 e 7: a verdade do CRM ─────────────────── */

/**
 * Estas duas regras são o motivo de o Track existir.
 *
 * O Google conta como "conversão" o que a tag mandou: formulário enviado,
 * clique no botão de WhatsApp. Nenhum desses é faturamento. Aqui a conta usa
 * venda de verdade, registrada quando o atendente marcou a conversa como paga.
 */
function semVendaReal(ctx: ContextoAnalise): Sugestao[] {
  const { politica: p } = ctx;
  if (!p.targetCpa) return [];
  const out: Sugestao[] = [];
  const porCampanha = new Map<string, RealidadeCrm>(ctx.crm.map((r) => [r.campaignId, r]));

  for (const c of ctx.campanhas) {
    if (c.status !== "ENABLED") continue;
    const real = porCampanha.get(c.id);
    if (!real) continue;
    if (c.custo < p.targetCpa * 2) continue;
    // Poucos leads não permitem concluir nada.
    if (real.leads < 5) continue;
    if (real.vendas > 0) continue;
    // Se o workspace inteiro converte pouco, o problema não é da campanha.
    if (ctx.taxaVendaMediaWorkspace < 0.1) continue;

    if (!c.orcamentoId || c.orcamentoDiario === null || c.orcamentoCompartilhado) continue;
    const proposto = Math.round(c.orcamentoDiario * (1 - p.maxBudgetChangePct / 100));

    out.push({
      ruleCode: "SEM_VENDA_REAL",
      severidade: "critica",
      escopo: "orcamento",
      entityId: c.orcamentoId,
      entityNome: c.nome,
      campaignId: c.id,
      adGroupId: null,
      titulo: `${c.nome}: ${real.leads} leads e nenhuma venda fechada`,
      porque:
        `A campanha gastou ${reais(c.custo)} e trouxe ${real.leads} conversas no WhatsApp, mas nenhuma ` +
        `virou venda. Enquanto isso, a média dos outros clientes fecha ` +
        `${(ctx.taxaVendaMediaWorkspace * 100).toFixed(0)}% dos leads. ` +
        `O Google mostra ${c.conversoes} conversões nesta campanha, mas conversão de tag não é faturamento.`,
      evidencia: { custo: c.custo, leadsReais: real.leads, qualificados: real.qualificados, vendas: 0, conversoesDeclaradas: c.conversoes, mediaWorkspace: ctx.taxaVendaMediaWorkspace },
      impactoEstimado: porMes(c.custo, p.lookbackDays),
      acao: { tipo: "ajustar_orcamento", orcamentoId: c.orcamentoId, deMicros: c.orcamentoDiario, paraMicros: proposto },
    });
  }
  return out;
}

function cpaRealAcimaDaMeta(ctx: ContextoAnalise): Sugestao[] {
  const { politica: p } = ctx;
  if (!p.targetCpa) return [];
  const out: Sugestao[] = [];
  const porCampanha = new Map<string, RealidadeCrm>(ctx.crm.map((r) => [r.campaignId, r]));

  for (const c of ctx.campanhas) {
    if (c.status !== "ENABLED") continue;
    const real = porCampanha.get(c.id);
    if (!real || real.vendas < 3) continue;

    const cpaReal = c.custo / real.vendas;
    if (cpaReal <= p.targetCpa * 1.5) continue;

    const cpaDeclarado = cpa(c.custo, c.conversoes);
    const excedente = c.custo - real.vendas * p.targetCpa;
    if (!c.orcamentoId || c.orcamentoDiario === null || c.orcamentoCompartilhado) continue;
    const proposto = Math.round(c.orcamentoDiario * (1 - p.maxBudgetChangePct / 100));

    out.push({
      ruleCode: "CPA_REAL_ACIMA",
      severidade: "alta",
      escopo: "orcamento",
      entityId: c.orcamentoId,
      entityNome: c.nome,
      campaignId: c.id,
      adGroupId: null,
      titulo: `${c.nome}: custo por venda real de ${reais(cpaReal)}`,
      porque:
        `Contando só as vendas fechadas no WhatsApp (${real.vendas} em ${p.lookbackDays} dias), ` +
        `cada uma custou ${reais(cpaReal)}, contra a meta de ${reais(p.targetCpa)}. ` +
        (cpaDeclarado !== null
          ? `O Google reporta ${reais(cpaDeclarado)} porque conta ${c.conversoes} conversões de tag, que incluem quem só mandou mensagem e sumiu.`
          : `O Google não registra conversão nesta campanha.`),
      evidencia: { custo: c.custo, vendasReais: real.vendas, faturamento: real.faturamento, cpaReal, cpaDeclarado, conversoesDeclaradas: c.conversoes, metaCpa: p.targetCpa },
      impactoEstimado: porMes(excedente, p.lookbackDays),
      acao: { tipo: "ajustar_orcamento", orcamentoId: c.orcamentoId, deMicros: c.orcamentoDiario, paraMicros: proposto },
    });
  }
  return out;
}

/* ─────────────────── orquestração ─────────────────── */

const REGRAS = [
  { code: "GASTO_SEM_CONVERSAO", fn: gastoSemConversao },
  { code: "CPA_ACIMA_DA_META", fn: cpaAcimaDaMeta },
  { code: "TERMO_IRRELEVANTE", fn: termoIrrelevante },
  { code: "LIMITADA_POR_ORCAMENTO", fn: limitadaPorOrcamento },
  { code: "ANUNCIO_FRACO", fn: anuncioFraco },
  { code: "SEM_VENDA_REAL", fn: semVendaReal },
  { code: "CPA_REAL_ACIMA", fn: cpaRealAcimaDaMeta },
];

/**
 * Roda todas as regras ligadas e devolve as sugestões ordenadas por impacto.
 *
 * Uma regra que explode não pode derrubar as outras: cada uma é isolada, e a
 * falha vira aviso em vez de deixar o cliente sem análise nenhuma.
 */
export function analisar(ctx: ContextoAnalise): { sugestoes: Sugestao[]; erros: string[] } {
  if (!ctx.politica.enabled) return { sugestoes: [], erros: [] };

  const sugestoes: Sugestao[] = [];
  const erros: string[] = [];

  for (const regra of REGRAS) {
    if (ctx.politica.disabledRules.includes(regra.code)) continue;
    try {
      sugestoes.push(...regra.fn(ctx));
    } catch (err) {
      erros.push(`${regra.code}: ${(err as Error).message}`);
    }
  }

  // Uma entidade só aparece uma vez, com a sugestão mais grave: propor pausar
  // e reduzir orçamento da mesma campanha ao mesmo tempo confunde quem aprova.
  const peso = { critica: 0, alta: 1, media: 2, baixa: 3 };
  sugestoes.sort((a, b) => {
    const d = peso[a.severidade] - peso[b.severidade];
    return d !== 0 ? d : b.impactoEstimado - a.impactoEstimado;
  });

  const vistos = new Set<string>();
  const unicas = sugestoes.filter((s) => {
    const chave = `${s.escopo}:${s.entityId}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });

  return { sugestoes: unicas, erros };
}

/** Chave que impede a mesma sugestão de nascer duas vezes no mesmo dia. */
export function chaveDeDeduplicacao(s: Sugestao, dia: string): string {
  return `${s.ruleCode}:${s.entityId}:${dia}`;
}
