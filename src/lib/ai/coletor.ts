import { gaqlSearch } from "@/lib/google-ads";
import { db } from "@/lib/db";
import type {
  Anuncio,
  Campanha,
  ContextoAnalise,
  Palavra,
  PoliticaIa,
  RealidadeCrm,
  TermoBusca,
} from "./tipos";

/**
 * Monta o retrato da conta para a análise.
 *
 * De um lado, o que o Google Ads reporta. Do outro, o que o Track sabe que
 * virou venda de verdade no WhatsApp. É o cruzamento dos dois que permite
 * dizer "esta campanha tem CPA de R$40 no relatório e R$600 por venda real".
 */

const MICROS = 1_000_000;

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function texto(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "");
}

/** Janela no formato que o GAQL espera, no fuso de Brasília. */
function janela(dias: number): { de: string; ate: string } {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(d);
  const hoje = new Date();
  const inicio = new Date(hoje.getTime() - dias * 86400_000);
  return { de: fmt(inicio), ate: fmt(hoje) };
}

export async function coletarContexto(p: {
  customerId: string;
  token: string;
  loginCustomerId: string;
  workspaceId: string;
  politica: PoliticaIa;
}): Promise<ContextoAnalise> {
  const { de, ate } = janela(p.politica.lookbackDays);
  const base = { customerId: p.customerId, token: p.token, loginCustomerId: p.loginCustomerId, tag: "ai/coletor" };
  const periodo = `segments.date >= "${de}" AND segments.date <= "${ate}"`;

  // As quatro consultas são independentes: uma falhando não pode zerar a
  // análise inteira, então cada uma cai para lista vazia e a regra que depende
  // dela simplesmente não roda.
  const [campanhasRaw, anunciosRaw, palavrasRaw, termosRaw, palavrasAtivas] = await Promise.all([
    gaqlSearch({
      ...base,
      query: `
        SELECT campaign.id, campaign.name, campaign.status,
               campaign.campaign_budget,
               campaign_budget.amount_micros, campaign_budget.explicitly_shared,
               metrics.cost_micros, metrics.clicks, metrics.impressions,
               metrics.conversions, metrics.conversions_value,
               metrics.search_budget_lost_impression_share
        FROM campaign
        WHERE ${periodo} AND campaign.status != "REMOVED"
      `,
    }).catch(() => []),
    gaqlSearch({
      ...base,
      query: `
        SELECT ad_group_ad.ad.id, ad_group_ad.status,
               ad_group.id, ad_group.name, campaign.id, campaign.name,
               metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions
        FROM ad_group_ad
        WHERE ${periodo} AND ad_group_ad.status = "ENABLED"
      `,
    }).catch(() => []),
    gaqlSearch({
      ...base,
      query: `
        SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
               ad_group.id, campaign.id, campaign.name,
               metrics.cost_micros, metrics.clicks, metrics.conversions
        FROM keyword_view
        WHERE ${periodo} AND ad_group_criterion.status = "ENABLED"
      `,
    }).catch(() => []),
    gaqlSearch({
      ...base,
      query: `
        SELECT search_term_view.search_term, ad_group.id, campaign.id, campaign.name,
               metrics.cost_micros, metrics.clicks, metrics.conversions
        FROM search_term_view
        WHERE ${periodo}
      `,
    }).catch(() => []),
    // Palavras ativas por grupo, para julgar se o termo tem a ver com o que
    // foi comprado. Sem isso, negativaríamos termo do próprio tema.
    gaqlSearch({
      ...base,
      query: `
        SELECT ad_group.id, ad_group_criterion.keyword.text
        FROM keyword_view
        WHERE ad_group_criterion.status = "ENABLED"
      `,
    }).catch(() => []),
  ]);

  // Quantos anúncios ativos cada grupo tem: pausar o último derruba o grupo.
  const ativosPorGrupo = new Map<string, number>();
  for (const a of anunciosRaw) {
    const g = texto(a["ad_group.id"]);
    ativosPorGrupo.set(g, (ativosPorGrupo.get(g) ?? 0) + 1);
  }

  const palavrasPorGrupo = new Map<string, string[]>();
  for (const k of palavrasAtivas) {
    const g = texto(k["ad_group.id"]);
    const t = texto(k["ad_group_criterion.keyword.text"]);
    if (!t) continue;
    const lista = palavrasPorGrupo.get(g) ?? [];
    lista.push(t);
    palavrasPorGrupo.set(g, lista);
  }

  const campanhas: Campanha[] = campanhasRaw.map((c) => {
    const compartilhado = c["campaign_budget.explicitly_shared"] === true;
    const orcamento = c["campaign_budget.amount_micros"];
    const budgetResource = texto(c["campaign.campaign_budget"]);
    return {
      id: texto(c["campaign.id"]),
      nome: texto(c["campaign.name"]),
      status: texto(c["campaign.status"]),
      custo: num(c["metrics.cost_micros"]) / MICROS,
      cliques: num(c["metrics.clicks"]),
      impressoes: num(c["metrics.impressions"]),
      conversoes: num(c["metrics.conversions"]),
      valorConversoes: num(c["metrics.conversions_value"]),
      perdaPorOrcamento:
        c["metrics.search_budget_lost_impression_share"] != null
          ? num(c["metrics.search_budget_lost_impression_share"])
          : null,
      // O alvo da mutação de orçamento é o CampaignBudget, não a campanha.
      orcamentoId: budgetResource ? budgetResource.split("/").pop() ?? null : null,
      orcamentoDiario: orcamento != null ? num(orcamento) : null,
      orcamentoCompartilhado: compartilhado,
    };
  });

  const anuncios: Anuncio[] = anunciosRaw.map((a) => {
    const grupo = texto(a["ad_group.id"]);
    return {
      id: texto(a["ad_group_ad.ad.id"]),
      adGroupId: grupo,
      adGroupNome: texto(a["ad_group.name"]),
      campaignId: texto(a["campaign.id"]),
      campanhaNome: texto(a["campaign.name"]),
      custo: num(a["metrics.cost_micros"]) / MICROS,
      cliques: num(a["metrics.clicks"]),
      impressoes: num(a["metrics.impressions"]),
      conversoes: num(a["metrics.conversions"]),
      ativosNoGrupo: ativosPorGrupo.get(grupo) ?? 1,
    };
  });

  const palavras: Palavra[] = palavrasRaw.map((k) => ({
    criterioId: texto(k["ad_group_criterion.criterion_id"]),
    texto: texto(k["ad_group_criterion.keyword.text"]),
    adGroupId: texto(k["ad_group.id"]),
    campaignId: texto(k["campaign.id"]),
    campanhaNome: texto(k["campaign.name"]),
    custo: num(k["metrics.cost_micros"]) / MICROS,
    cliques: num(k["metrics.clicks"]),
    conversoes: num(k["metrics.conversions"]),
  }));

  const termos: TermoBusca[] = termosRaw.map((t) => {
    const grupo = texto(t["ad_group.id"]);
    return {
      termo: texto(t["search_term_view.search_term"]),
      adGroupId: grupo,
      campaignId: texto(t["campaign.id"]),
      campanhaNome: texto(t["campaign.name"]),
      custo: num(t["metrics.cost_micros"]) / MICROS,
      cliques: num(t["metrics.clicks"]),
      conversoes: num(t["metrics.conversions"]),
      palavrasDoGrupo: palavrasPorGrupo.get(grupo) ?? [],
    };
  });

  const { crm, taxaVendaMediaWorkspace } = await coletarRealidade(p.workspaceId, p.politica.lookbackDays);

  return { politica: p.politica, taxaVendaMediaWorkspace, campanhas, anuncios, palavras, termos, crm };
}

/**
 * O que virou venda de verdade, por campanha.
 *
 * Vem do Track, não do Google: aqui "venda" significa que alguém marcou a
 * conversa como paga no WhatsApp. É este número que permite dizer que uma
 * campanha com 30 conversões no relatório não fechou negócio nenhum.
 */
async function coletarRealidade(
  workspaceId: string,
  dias: number,
): Promise<{ crm: RealidadeCrm[]; taxaVendaMediaWorkspace: number }> {
  const desde = new Date(Date.now() - dias * 86400_000);

  const conversas = await db.trackConversation.groupBy({
    by: ["campaignId", "stage"],
    where: { workspaceId, firstMessageAt: { gte: desde }, campaignId: { not: null } },
    _count: { _all: true },
    _sum: { saleValue: true },
  });

  const porCampanha = new Map<string, RealidadeCrm>();
  for (const linha of conversas) {
    const id = linha.campaignId!;
    const atual = porCampanha.get(id) ?? {
      campaignId: id, leads: 0, qualificados: 0, vendas: 0, faturamento: 0,
    };
    const n = linha._count._all;
    atual.leads += n;
    // O funil é cumulativo: quem vendeu também passou por qualificado.
    if (linha.stage === "venda") {
      atual.vendas += n;
      atual.qualificados += n;
      atual.faturamento += linha._sum.saleValue ?? 0;
    } else if (linha.stage === "qualificado") {
      atual.qualificados += n;
    }
    porCampanha.set(id, atual);
  }

  const crm = [...porCampanha.values()];
  const totalLeads = crm.reduce((s, c) => s + c.leads, 0);
  const totalVendas = crm.reduce((s, c) => s + c.vendas, 0);

  return {
    crm,
    // Serve de referência: não faz sentido culpar uma campanha por não fechar
    // se o workspace inteiro converte mal (problema de atendimento ou oferta).
    taxaVendaMediaWorkspace: totalLeads > 0 ? totalVendas / totalLeads : 0,
  };
}
