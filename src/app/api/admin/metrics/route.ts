/**
 * GET /api/admin/metrics?periodo=30
 *
 * KPI único do dashboard admin: financeiro, assinaturas, usuários, funil,
 * integrações, séries históricas e presença em tempo real numa só resposta.
 *
 * Esta rota é DE ORQUESTRAÇÃO, não de cálculo. Toda regra de negócio mora em
 * lib/admin-metrics.ts (o que entra no MRR, como se aproxima o histórico, o
 * que conta como churn). Aqui só acontece: validar parâmetro, disparar tudo em
 * paralelo, degradar o que falhar e serializar. Se um número parecer errado, o
 * bug está na lib, não neste arquivo.
 *
 * Três decisões que valem para o arquivo inteiro:
 *
 * 1. TUDO EM PARALELO. São 8 agregações independentes e cada ida ao Supabase
 *    custa ~190ms. Em série a rota levaria ~1,5s; num único Promise.allSettled
 *    fica no custo da consulta mais lenta. Nenhuma delas depende do resultado
 *    de outra — se um dia alguma depender, ela vira uma segunda leva, não um
 *    await solto no meio da primeira.
 *
 * 2. DEGRADA, NÃO DERRUBA. allSettled (e não all): uma agregação quebrada
 *    devolve o campo dela zerado e o resto da resposta continua de pé. Um
 *    painel com "R$ 0" num card é ruim; um painel 500 é pior, porque esconde
 *    também os 7 números que estavam certos. As funções da lib já não lançam,
 *    então o allSettled é a segunda rede — pega o que escapa dela (queda de
 *    conexão no count de ActiveSession, timeout do pool).
 *
 * 3. GET NÃO REGISTRA EM AdminLog. logAdminAction é para MUTAÇÃO. Este
 *    endpoint é o que o dashboard chama a cada abertura de tela; logar leitura
 *    encheria AdminLog de ruído e ainda somaria ~190ms de escrita ao caminho
 *    crítico da rota mais chamada do admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateAdminRequest } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import {
  calcularMrr,
  resumoAssinaturas,
  receitaMensal,
  churnMensal,
  metricasUsuarios,
  funilTrial,
  saudeIntegracoes,
  type MetricasMrr,
  type ResumoAssinaturas,
  type PontoReceitaMensal,
  type PontoChurnMensal,
  type MetricasUsuarios,
  type FunilTrial,
  type SaudeIntegracoes,
} from "@/lib/admin-metrics";

// Métrica de painel nunca pode vir de cache: o admin abre a tela justamente
// para ver o estado de AGORA. Mesmo padrão de api/cakto/webhook.
export const dynamic = "force-dynamic";

// ─── Parâmetro `periodo` ──────────────────────────────────────────────────────

/**
 * Whitelist de períodos, em DIAS. Deliberadamente uma lista fechada e não um
 * intervalo: `parseInt` cru devolve NaN em "?periodo=abc" e NaN vaza para
 * dentro do Prisma/SQL derrubando a rota com 500 — bug que já existe em outras
 * rotas do projeto. Aqui um valor inválido cai no padrão, silenciosamente.
 */
const PERIODOS_VALIDOS = [7, 30, 90] as const;
type PeriodoValido = (typeof PERIODOS_VALIDOS)[number];

const PERIODO_PADRAO: PeriodoValido = 30;

/**
 * Quantos MESES de série histórica cada período pede.
 *
 * O parâmetro chega em dias, mas receitaMensal/churnMensal trabalham em meses.
 * O mapa não é dias/30: "7 dias" viraria uma série de 1 ponto, que não é
 * gráfico, é um número. O piso de 3 meses garante que sempre exista tendência
 * para desenhar. Períodos maiores abrem a janela porque quem pede 90 dias está
 * olhando para trás, não para hoje.
 */
const MESES_POR_PERIODO: Record<PeriodoValido, number> = { 7: 3, 30: 6, 90: 12 };

/** Janela do "online agora". 5 min é o mesmo corte usado em api/admin/analytics
 *  — os dois painéis precisam mostrar o mesmo número. */
const JANELA_ONLINE_MS = 5 * 60 * 1000;

function validarPeriodo(bruto: string | null): PeriodoValido {
  if (!bruto) return PERIODO_PADRAO;
  // Number (e não parseInt) de propósito: parseInt("30abc") devolveria 30 e
  // aceitaria lixo como se fosse válido. Number("30abc") é NaN e cai fora.
  const n = Number(bruto);
  return PERIODOS_VALIDOS.find((p) => p === n) ?? PERIODO_PADRAO;
}

// ─── Valores-zero para degradação ─────────────────────────────────────────────
//
// Cada bloco tem um zero com o MESMO SHAPE do sucesso. A UI nunca recebe
// undefined nem chave faltando, então não precisa de guarda em cada card —
// no pior caso ela desenha zeros.

const MRR_ZERO: MetricasMrr = { mrr: 0, arr: 0, porPlano: [], assinantesAtivos: 0, arpu: 0 };

const ASSINATURAS_ZERO: ResumoAssinaturas = {
  total: 0,
  porPlanoStatus: [],
  trialsExpiradosNaoProcessados: 0,
  trialsVencendo7d: 0,
  inadimplentes: 0,
};

const USUARIOS_ZERO: MetricasUsuarios = {
  total: 0,
  // Semeado com os roles do schema pelo mesmo motivo da lib: hoje não existe
  // nenhum CLIENT e a chave sumiria do JSON.
  porRole: { AGENCY: 0, CLIENT: 0 },
  ativos30d: 0,
  inativos30d: 0,
  novos7d: 0,
  novos30d: 0,
  onboardingIncompleto: 0,
};

const FUNIL_ZERO: FunilTrial = {
  emTrial: 0,
  vencidosNaoProcessados: 0,
  converteram: 0,
  expiraramSemConverter: 0,
  // null e não 0: este é o valor-zero de FALHA, e "0,0%" afirmaria que ninguém
  // converte. A UI trata null como indisponível.
  taxaConversao: null,
};

const INTEGRACOES_ZERO: SaudeIntegracoes = {
  total: 0,
  porPlataforma: {},
  ativas: 0,
  comErro: 0,
  workspacesSemBm: 0,
};

const RECEITA_ZERO: PontoReceitaMensal[] = [];
const CHURN_ZERO: PontoChurnMensal[] = [];

/**
 * Desempacota um resultado do allSettled. Rejeitado vira o valor-zero + um
 * console.error identificando QUAL agregação caiu — sem isso, "R$ 0" no painel
 * é indistinguível de "R$ 0 porque a query morreu".
 */
function ouEntao<T>(
  resultado: PromiseSettledResult<T>,
  zero: T,
  nome: string,
  falhas: string[]
): T {
  if (resultado.status === "fulfilled") return resultado.value;
  const causa = resultado.reason;
  console.error(
    `[admin/metrics] agregação "${nome}" falhou, devolvendo zero:`,
    (causa as Error)?.message ?? causa
  );
  // Registrar no console não basta: quem consome a rota recebe 200 com os
  // zeros e não tem como distinguir "não há receita" de "a query de receita
  // caiu". O nome da agregação sai na resposta em `degradado` para a UI poder
  // marcar o card como indisponível em vez de exibir R$ 0,00 como verdade.
  falhas.push(nome);
  return zero;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!validateAdminRequest(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const periodo = validarPeriodo(searchParams.get("periodo"));
  const meses = MESES_POR_PERIODO[periodo];

  // `periodo` só governa o TAMANHO DAS SÉRIES (receitaMensal, churn). MRR,
  // assinaturas, usuários, funil e integrações são fotos do estado atual e não
  // têm recorte temporal — mudar o filtro na UI não deve mexer nesses cards.
  const desdeOnline = new Date(Date.now() - JANELA_ONLINE_MS);

  // ⚠️ CONCORRENCIA LIMITADA — não troque por um Promise.allSettled único.
  //
  // As 8 entradas abaixo NÃO são 8 consultas: cada agregação abre várias por
  // dentro (metricasUsuarios sozinha faz 6, resumoAssinaturas 4). Disparando
  // todas de uma vez o leque real passa de 25 conexões simultâneas — e o pool
  // do Supabase nesta instalação tem 15. Quando estourou, o Postgres devolveu
  // "(EMAXCONNSESSION) max clients reached" e derrubou com 500 não só esta
  // rota, mas QUALQUER requisição concorrente do app, inclusive de clientes
  // finais no /cliente/[slug]. O painel admin não pode ser um vetor de queda
  // do resto do sistema.
  //
  // O teto era 2 quando o app inteiro rodava pela DIRECT_URL do Supabase
  // (porta 5432, modo session, 15 conexões no total). Desde que src/lib/db.ts
  // passou a usar a DATABASE_URL (porta 6543, pgbouncer em modo transaction),
  // a conexão volta ao pool ao fim de cada query e o teto antigo virou apenas
  // latência: as 8 agregações levavam ~4 ondas de 200ms, ou seja 1,5–3s de
  // espera para abrir o painel.
  //
  // Com 4, o pico fica em ~15 consultas simultâneas — confortável para o
  // pooler de transação e ainda longe de monopolizá-lo — e o tempo cai para
  // ~2 ondas. Não subo mais que isso porque `metricasUsuarios` sozinha abre 6
  // consultas e duas dessas em paralelo já é o grosso do custo.
  const CONCORRENCIA = 4;

  const tarefas: Array<() => Promise<unknown>> = [
    () => calcularMrr(),
    () => resumoAssinaturas(),
    () => metricasUsuarios(),
    () => funilTrial(),
    () => saudeIntegracoes(),
    () => receitaMensal(meses),
    () => churnMensal(meses),
    // Único acesso direto ao banco nesta rota: é um count trivial, não regra
    // de negócio, e não justifica uma função na lib.
    () => db.activeSession.count({ where: { lastSeen: { gte: desdeOnline } } }),
  ];

  const resultados: PromiseSettledResult<unknown>[] = [];
  for (let i = 0; i < tarefas.length; i += CONCORRENCIA) {
    const onda = tarefas.slice(i, i + CONCORRENCIA).map((fn) => fn());
    resultados.push(...(await Promise.allSettled(onda)));
  }

  const [rMrr, rAssinaturas, rUsuarios, rFunil, rIntegracoes, rReceita, rChurn, rOnline] =
    resultados as [
      PromiseSettledResult<Awaited<ReturnType<typeof calcularMrr>>>,
      PromiseSettledResult<Awaited<ReturnType<typeof resumoAssinaturas>>>,
      PromiseSettledResult<Awaited<ReturnType<typeof metricasUsuarios>>>,
      PromiseSettledResult<Awaited<ReturnType<typeof funilTrial>>>,
      PromiseSettledResult<Awaited<ReturnType<typeof saudeIntegracoes>>>,
      PromiseSettledResult<Awaited<ReturnType<typeof receitaMensal>>>,
      PromiseSettledResult<Awaited<ReturnType<typeof churnMensal>>>,
      PromiseSettledResult<number>,
    ];

  const degradado: string[] = [];

  const mrr = ouEntao(rMrr, MRR_ZERO, "calcularMrr", degradado);
  const assinaturas = ouEntao(rAssinaturas, ASSINATURAS_ZERO, "resumoAssinaturas", degradado);
  const usuarios = ouEntao(rUsuarios, USUARIOS_ZERO, "metricasUsuarios", degradado);
  const funil = ouEntao(rFunil, FUNIL_ZERO, "funilTrial", degradado);
  const integracoes = ouEntao(rIntegracoes, INTEGRACOES_ZERO, "saudeIntegracoes", degradado);
  const receita = ouEntao(rReceita, RECEITA_ZERO, "receitaMensal", degradado);
  const churn = ouEntao(rChurn, CHURN_ZERO, "churnMensal", degradado);
  // ActiveSession vazia é o caso NORMAL (a linha só vive enquanto a aba está
  // aberta). Zero aqui é "ninguém online", não falha.
  const onlineAgora = ouEntao(rOnline, 0, "onlineAgora", degradado);

  return NextResponse.json(
    {
      // Financeiro promovido para a raiz: são os 5 números do topo do painel e
      // achatá-los evita que a UI tenha que cavar dentro de um objeto para o
      // card mais visível da tela.
      mrr: mrr.mrr,
      arr: mrr.arr,
      arpu: mrr.arpu,
      assinantesAtivos: mrr.assinantesAtivos,
      porPlano: mrr.porPlano,

      assinaturas,
      usuarios,
      funil,
      integracoes,

      receitaMensal: receita,
      churn,

      onlineAgora,

      // Ecoa o período efetivamente aplicado. Como valor inválido cai no padrão
      // sem erro, sem isto a UI não teria como saber que "?periodo=abc" virou
      // 30 e mostraria um rótulo mentindo sobre a janela do gráfico.
      periodo,

      // Nomes das agregações que falharam nesta resposta. Vazio = todos os
      // números são reais. Não-vazio = os campos correspondentes estão zerados
      // por erro, e a UI deve marcá-los como indisponíveis.
      degradado,

      geradoEm: new Date().toISOString(),
    },
    // Painel financeiro não pode ser servido de cache de browser/proxy.
    { headers: { "Cache-Control": "no-store" } }
  );
}
