/**
 * Checagem do motor de sugestões da IA.
 *
 * Cada sugestão daqui vira um botão "aprovar" que mexe na verba do cliente.
 * Um falso positivo pausa campanha que estava dando certo; um falso negativo
 * deixa dinheiro queimando. Os dois lados são testados abaixo.
 */
import { analisar, chaveDeDeduplicacao } from "../src/lib/ai/regras";
import { POLITICA_PADRAO, type Campanha, type ContextoAnalise, type PoliticaIa } from "../src/lib/ai/tipos";

let falhas = 0;
let total = 0;

function verdade(nome: string, cond: boolean, detalhe = "") {
  total++;
  if (!cond) {
    falhas++;
    console.error(`  FALHOU ${nome} ${detalhe}`);
  }
}

function ok(nome: string, real: unknown, esperado: unknown) {
  total++;
  if (JSON.stringify(real) !== JSON.stringify(esperado)) {
    falhas++;
    console.error(`  FALHOU ${nome}\n    esperado: ${JSON.stringify(esperado)}\n    veio:     ${JSON.stringify(real)}`);
  }
}

const politica: PoliticaIa = {
  ...POLITICA_PADRAO,
  enabled: true,
  targetCpa: 100,
  minConversionsForCpa: 10,
  lookbackDays: 14,
};

function ctxVazio(p: Partial<ContextoAnalise> = {}): ContextoAnalise {
  return {
    politica,
    taxaVendaMediaWorkspace: 0.3,
    campanhas: [],
    anuncios: [],
    palavras: [],
    termos: [],
    crm: [],
    ...p,
  };
}

const campanhaBase: Campanha = {
  id: "1", nome: "Search Implante", status: "ENABLED",
  custo: 0, cliques: 0, impressoes: 0, conversoes: 0, valorConversoes: 0,
  perdaPorOrcamento: null, orcamentoId: "b1", orcamentoDiario: 50_000_000,
  orcamentoCompartilhado: false,
};

console.log("kill switch e configuração");
{
  ok("desligada não sugere nada", analisar(ctxVazio({ politica: { ...politica, enabled: false } })).sugestoes.length, 0);
  ok("sem dados não sugere nada", analisar(ctxVazio()).sugestoes.length, 0);

  // Regra desligada pelo cliente precisa ficar desligada mesmo.
  const comGasto = ctxVazio({
    politica: { ...politica, disabledRules: ["GASTO_SEM_CONVERSAO"] },
    palavras: [{ criterioId: "k1", texto: "dentista barato", adGroupId: "g1", campaignId: "1", campanhaNome: "C", custo: 500, cliques: 40, conversoes: 0 }],
  });
  ok("regra desligada não roda", analisar(comGasto).sugestoes.length, 0);
}

console.log("gasto sem conversão");
{
  const r = analisar(ctxVazio({
    palavras: [{ criterioId: "k1", texto: "dentista barato", adGroupId: "g1", campaignId: "1", campanhaNome: "C", custo: 500, cliques: 40, conversoes: 0 }],
  }));
  verdade("palavra queimando dinheiro é sinalizada", r.sugestoes.length === 1);
  ok("regra certa", r.sugestoes[0]?.ruleCode, "GASTO_SEM_CONVERSAO");
  ok("ação é pausar a palavra", r.sugestoes[0]?.acao.tipo, "pausar_palavra");
  verdade("o porquê cita o valor gasto", Boolean(r.sugestoes[0]?.porque.includes("500")));
  // R$500 em 14 dias projeta para cerca de R$1071 por mês.
  verdade("impacto é projetado para o mês", (r.sugestoes[0]?.impactoEstimado ?? 0) > 1000);

  // Amostra pequena não permite concluir nada.
  const poucos = analisar(ctxVazio({
    palavras: [{ criterioId: "k2", texto: "x", adGroupId: "g1", campaignId: "1", campanhaNome: "C", custo: 500, cliques: 3, conversoes: 0 }],
  }));
  ok("poucos cliques não geram sugestão", poucos.sugestoes.length, 0);

  // Palavra que converte não é problema, por mais que custe.
  const converte = analisar(ctxVazio({
    palavras: [{ criterioId: "k3", texto: "y", adGroupId: "g1", campaignId: "1", campanhaNome: "C", custo: 5000, cliques: 200, conversoes: 40 }],
  }));
  ok("palavra que converte é poupada", converte.sugestoes.length, 0);
}

console.log("CPA acima da meta");
{
  // Amostra pequena mente: 4 conversões não bastam para condenar a campanha.
  const amostraPequena = analisar(ctxVazio({
    campanhas: [{ ...campanhaBase, custo: 2000, conversoes: 4 }],
  }));
  ok("com poucas conversões não julga", amostraPequena.sugestoes.length, 0);

  // CPA de 200 contra meta de 100, com amostra suficiente.
  const acima = analisar(ctxVazio({
    campanhas: [{ ...campanhaBase, custo: 3000, conversoes: 15 }],
  }));
  ok("CPA 2x a meta sugere reduzir orçamento", acima.sugestoes[0]?.ruleCode, "CPA_ACIMA_DA_META");
  ok("ação é ajustar orçamento", acima.sugestoes[0]?.acao.tipo, "ajustar_orcamento");
  const acao = acima.sugestoes[0]?.acao as { paraMicros: number; deMicros: number };
  ok("reduz exatamente o teto configurado", acao.paraMicros, 40_000_000);

  // Acima de 2,5x a meta, a proposta é pausar.
  const muitoAcima = analisar(ctxVazio({
    campanhas: [{ ...campanhaBase, custo: 4500, conversoes: 15 }],
  }));
  ok("CPA 3x sugere pausar", muitoAcima.sugestoes[0]?.ruleCode, "CPA_MUITO_ACIMA");
  ok("severidade crítica", muitoAcima.sugestoes[0]?.severidade, "critica");

  // Orçamento compartilhado mexe em outras campanhas: nunca sugerir.
  const compartilhado = analisar(ctxVazio({
    campanhas: [{ ...campanhaBase, custo: 3000, conversoes: 15, orcamentoCompartilhado: true }],
  }));
  ok("orçamento compartilhado é intocável", compartilhado.sugestoes.length, 0);

  // Campanha pausada não precisa de sugestão.
  const pausada = analisar(ctxVazio({
    campanhas: [{ ...campanhaBase, custo: 3000, conversoes: 15, status: "PAUSED" }],
  }));
  ok("campanha pausada é ignorada", pausada.sugestoes.length, 0);

  // Sem meta de CPA, a regra não tem como julgar.
  const semMeta = analisar(ctxVazio({
    politica: { ...politica, targetCpa: null },
    campanhas: [{ ...campanhaBase, custo: 3000, conversoes: 15 }],
  }));
  ok("sem meta de CPA não julga campanha", semMeta.sugestoes.length, 0);
}

console.log("termo de busca irrelevante");
{
  const r = analisar(ctxVazio({
    termos: [{
      termo: "curso gratis de odontologia", adGroupId: "g1", campaignId: "1", campanhaNome: "C",
      custo: 200, cliques: 20, conversoes: 0, palavrasDoGrupo: ["implante dentario", "protese dentaria"],
    }],
  }));
  ok("termo fora do tema é negativado", r.sugestoes[0]?.ruleCode, "TERMO_IRRELEVANTE");
  ok("ação é negativar", r.sugestoes[0]?.acao.tipo, "negativar_termo");

  // Termo parecido com a palavra comprada é intenção certa com resultado ruim:
  // resolve com lance ou anúncio, não com negativa.
  const parecido = analisar(ctxVazio({
    termos: [{
      termo: "implante dentario preco", adGroupId: "g1", campaignId: "1", campanhaNome: "C",
      custo: 200, cliques: 20, conversoes: 0, palavrasDoGrupo: ["implante dentario"],
    }],
  }));
  ok("termo do mesmo tema não é negativado", parecido.sugestoes.length, 0);

  const converteu = analisar(ctxVazio({
    termos: [{
      termo: "curso gratis", adGroupId: "g1", campaignId: "1", campanhaNome: "C",
      custo: 200, cliques: 20, conversoes: 1, palavrasDoGrupo: ["implante"],
    }],
  }));
  ok("termo que converteu é poupado", converteu.sugestoes.length, 0);
}

console.log("campanha boa limitada por orçamento");
{
  const r = analisar(ctxVazio({
    campanhas: [{
      ...campanhaBase, custo: 1000, conversoes: 20, valorConversoes: 8000,
      perdaPorOrcamento: 0.45,
    }],
  }));
  ok("campanha boa e limitada sugere aumentar", r.sugestoes[0]?.ruleCode, "LIMITADA_POR_ORCAMENTO");
  const a = r.sugestoes[0]?.acao as { paraMicros: number };
  ok("aumenta o teto configurado", a.paraMicros, 60_000_000);

  // Campanha ruim e limitada NÃO deve ganhar mais dinheiro.
  const ruim = analisar(ctxVazio({
    campanhas: [{ ...campanhaBase, custo: 3000, conversoes: 12, perdaPorOrcamento: 0.5 }],
  }));
  verdade(
    "campanha cara e limitada não ganha aumento",
    !ruim.sugestoes.some((s) => s.ruleCode === "LIMITADA_POR_ORCAMENTO"),
  );

  // Teto absoluto respeitado.
  const comTeto = analisar(ctxVazio({
    politica: { ...politica, maxDailyBudgetCeiling: 55 },
    campanhas: [{ ...campanhaBase, custo: 1000, conversoes: 20, valorConversoes: 8000, perdaPorOrcamento: 0.45 }],
  }));
  ok("teto absoluto bloqueia o aumento", comTeto.sugestoes.length, 0);
}

console.log("anúncio fraco");
{
  const r = analisar(ctxVazio({
    anuncios: [
      { id: "a1", adGroupId: "g1", adGroupNome: "G", campaignId: "1", campanhaNome: "C", custo: 100, cliques: 5, impressoes: 5000, conversoes: 0, ativosNoGrupo: 3 },
      { id: "a2", adGroupId: "g1", adGroupNome: "G", campaignId: "1", campanhaNome: "C", custo: 100, cliques: 200, impressoes: 5000, conversoes: 5, ativosNoGrupo: 3 },
    ],
  }));
  verdade("anúncio com CTR muito baixo é sinalizado", r.sugestoes.some((s) => s.ruleCode === "ANUNCIO_FRACO" && s.entityId === "a1"));
  verdade("o bom não é sinalizado", !r.sugestoes.some((s) => s.entityId === "a2" && s.ruleCode === "ANUNCIO_FRACO"));

  // Pausar o último anúncio ativo derrubaria o grupo inteiro.
  const unico = analisar(ctxVazio({
    anuncios: [
      { id: "a1", adGroupId: "g1", adGroupNome: "G", campaignId: "1", campanhaNome: "C", custo: 100, cliques: 5, impressoes: 5000, conversoes: 0, ativosNoGrupo: 1 },
      { id: "a2", adGroupId: "g1", adGroupNome: "G", campaignId: "1", campanhaNome: "C", custo: 100, cliques: 200, impressoes: 5000, conversoes: 5, ativosNoGrupo: 1 },
    ],
  }));
  verdade("nunca pausa o último anúncio do grupo", !unico.sugestoes.some((s) => s.ruleCode === "ANUNCIO_FRACO"));
}

console.log("a verdade do CRM (o diferencial do Track)");
{
  // O Google diz 30 conversões; o WhatsApp diz zero venda.
  const r = analisar(ctxVazio({
    campanhas: [{ ...campanhaBase, custo: 3000, conversoes: 30, valorConversoes: 0 }],
    crm: [{ campaignId: "1", leads: 25, qualificados: 8, vendas: 0, faturamento: 0 }],
  }));
  ok("leads sem venda nenhuma é crítico", r.sugestoes[0]?.ruleCode, "SEM_VENDA_REAL");
  ok("severidade crítica", r.sugestoes[0]?.severidade, "critica");
  verdade(
    "o porquê contrasta com a conversão declarada",
    Boolean(r.sugestoes[0]?.porque.includes("30 conversões")),
  );

  // Se o workspace inteiro converte mal, o problema não é da campanha.
  const workspaceRuim = analisar(ctxVazio({
    taxaVendaMediaWorkspace: 0.02,
    campanhas: [{ ...campanhaBase, custo: 3000, conversoes: 30 }],
    crm: [{ campaignId: "1", leads: 25, qualificados: 8, vendas: 0, faturamento: 0 }],
  }));
  verdade("não culpa a campanha quando o funil todo converte mal", !workspaceRuim.sugestoes.some((s) => s.ruleCode === "SEM_VENDA_REAL"));

  // CPA real: 3000 / 5 vendas = 600, contra meta de 100.
  const cpaReal = analisar(ctxVazio({
    campanhas: [{ ...campanhaBase, custo: 3000, conversoes: 30 }],
    crm: [{ campaignId: "1", leads: 25, qualificados: 10, vendas: 5, faturamento: 4000 }],
  }));
  ok("CPA por venda real é apurado", cpaReal.sugestoes[0]?.ruleCode, "CPA_REAL_ACIMA");
  verdade("mostra o custo por venda de verdade", Boolean(cpaReal.sugestoes[0]?.porque.includes("600")));
  verdade("explica por que o Google discorda", Boolean(cpaReal.sugestoes[0]?.porque.includes("tag")));

  // Menos de 3 vendas é amostra pequena demais para julgar.
  const poucasVendas = analisar(ctxVazio({
    campanhas: [{ ...campanhaBase, custo: 3000, conversoes: 30 }],
    crm: [{ campaignId: "1", leads: 25, qualificados: 10, vendas: 2, faturamento: 1000 }],
  }));
  verdade("2 vendas não bastam para julgar", !poucasVendas.sugestoes.some((s) => s.ruleCode === "CPA_REAL_ACIMA"));

  // Campanha com CPA real dentro da meta é poupada, mesmo com CPA declarado ruim.
  const boa = analisar(ctxVazio({
    campanhas: [{ ...campanhaBase, custo: 1000, conversoes: 2 }],
    crm: [{ campaignId: "1", leads: 20, qualificados: 15, vendas: 12, faturamento: 30000 }],
  }));
  verdade("campanha com venda real boa é poupada", !boa.sugestoes.some((s) => s.ruleCode === "CPA_REAL_ACIMA"));
}

console.log("ordenação e deduplicação");
{
  const r = analisar(ctxVazio({
    campanhas: [
      { ...campanhaBase, id: "1", nome: "Cara", custo: 4500, conversoes: 15 },
      { ...campanhaBase, id: "2", nome: "Media", orcamentoId: "b2", custo: 3000, conversoes: 15 },
    ],
  }));
  ok("a mais grave vem primeiro", r.sugestoes[0]?.severidade, "critica");

  // A mesma entidade não pode receber duas propostas conflitantes.
  const conflito = analisar(ctxVazio({
    campanhas: [{ ...campanhaBase, custo: 4500, conversoes: 15, perdaPorOrcamento: 0.5, valorConversoes: 9000 }],
    crm: [{ campaignId: "1", leads: 30, qualificados: 5, vendas: 0, faturamento: 0 }],
  }));
  const porEntidade = new Map<string, number>();
  for (const s of conflito.sugestoes) {
    const k = `${s.escopo}:${s.entityId}`;
    porEntidade.set(k, (porEntidade.get(k) ?? 0) + 1);
  }
  verdade("nenhuma entidade recebe duas sugestões", [...porEntidade.values()].every((n) => n === 1));

  const s = conflito.sugestoes[0];
  if (s) {
    ok("chave de dedupe é estável", chaveDeDeduplicacao(s, "2026-08-07"), `${s.ruleCode}:${s.entityId}:2026-08-07`);
  }
}

console.log("robustez");
{
  // Regra que explode não pode derrubar a análise inteira.
  const comLixo = analisar(ctxVazio({
    campanhas: [{ ...campanhaBase, custo: NaN, conversoes: 15 }],
    palavras: [{ criterioId: "k1", texto: "ok", adGroupId: "g1", campaignId: "1", campanhaNome: "C", custo: 500, cliques: 40, conversoes: 0 }],
  }));
  verdade("dado corrompido não impede as outras regras", comLixo.sugestoes.length >= 1);
  verdade("toda sugestão tem explicação", comLixo.sugestoes.every((s) => s.porque.length > 20));
  verdade("toda sugestão tem evidência", comLixo.sugestoes.every((s) => Object.keys(s.evidencia).length > 0));
}

console.log(`\n${total - falhas}/${total} checagens passaram`);
if (falhas > 0) {
  console.error(`${falhas} FALHA(S)`);
  process.exit(1);
}
console.log("TUDO CERTO");
