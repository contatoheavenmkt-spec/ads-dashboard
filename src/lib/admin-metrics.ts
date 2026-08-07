/**
 * admin-metrics.ts
 * Cálculo financeiro e de uso do painel admin.
 *
 * Todas as funções aqui são de CONSULTA PURA: recebem parâmetros simples e
 * devolvem dados. Nenhuma toca em Request/Response — quem serializa é a rota
 * ou o Server Component que chamar.
 *
 * Três decisões que valem para o arquivo inteiro:
 *
 * 1. LANÇAM em caso de falha, por decisão consciente. A versão anterior
 *    engolia o erro e devolvia o valor-zero; o resultado prático foi a rota
 *    responder `usuarios: 0` com `degradado: []` durante um pico de conexões
 *    — um zero causado por falha, servido como se fosse a realidade do
 *    negócio. Num painel financeiro isso é pior do que um card vazio.
 *    Quem chama (/api/admin/metrics) envolve tudo em Promise.allSettled,
 *    converte a rejeição no valor-zero E registra o nome da agregação em
 *    `degradado`, para a UI marcar o card como indisponível. Tabela vazia
 *    continua sendo caso NORMAL (ActiveSession quase sempre está vazia) e
 *    devolve zero de verdade, sem lançar.
 *
 * 2. PREÇO SÓ VEM DE plans.ts. Nenhum valor monetário é escrito em SQL. As
 *    queries agregam CONTAGEM por plano e a multiplicação pelo preço acontece
 *    em TS. Assim, mexer no preço em plans.ts corrige todos os relatórios.
 *
 * 3. MESES SÃO EM UTC. `date_trunc('month', ...)` no Postgres opera sobre o
 *    timestamp gravado, que é UTC. As chaves "YYYY-MM" montadas em TS também
 *    são UTC, para bater exatamente com o banco. Consequência aceita: cadastro
 *    feito depois das 21h do último dia do mês (horário BR) cai no mês
 *    seguinte. Em rollup mensal isso é ruído; em rollup diário não seria, e
 *    por isso o resto do projeto usa brDateKey() para agrupar por DIA.
 */

import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";

// ─── Constantes de regra de negócio ───────────────────────────────────────────

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Status que significam "assinatura encerrada".
 * O schema documenta "expired", mas linhas antigas do banco também usam
 * "canceled". Enquanto os dois existirem, os dois contam como fim de vida —
 * senão um cancelamento vira churn invisível.
 * (A rota api/admin/stats, que também consultava "canceled", foi removida: era
 * uma segunda implementação de MRR, sem consumidor e com números piores.)
 *
 * CUIDADO: as queries $queryRaw deste arquivo repetem esses dois valores como
 * literal (`status IN ('expired', 'canceled')`), porque interpolar array em
 * template do Prisma exigiria o helper Prisma.join e um import a mais. Se
 * mexer nesta lista, procure por "expired" no arquivo e ajuste o SQL também.
 */
const STATUS_ENCERRADOS = ["expired", "canceled"];

/**
 * Planos que geram receita. Derivado de PLANS em vez de escrito à mão: se um
 * plano novo entrar em plans.ts com preço > 0, ele já é contabilizado aqui.
 * Hoje resolve para ["start", "plus", "premium"] — trial fica de fora porque
 * preço 0 não é receita.
 */
const PLANOS_PAGOS = Object.keys(PLANS).filter((k) => (PLANS[k]?.price ?? 0) > 0);

/** Roles conhecidos do schema. Semeamos o mapa com eles para o retorno ter
 *  shape estável mesmo quando não existe nenhum usuário de um dos tipos —
 *  hoje é o caso de CLIENT, que tem zero linhas. */
const ROLES_CONHECIDOS = ["AGENCY", "CLIENT"];

// ─── Helpers internos ─────────────────────────────────────────────────────────

/**
 * Soma de floats de dinheiro (49.9 + 129.9 + ...) acumula erro binário e vaza
 * coisas como 599.8000000000001 para a UI. Fixamos em centavos na saída.
 * Valor sempre em REAIS, sem formatar — formatação é responsabilidade da UI.
 */
function arredondar2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Preço de tabela do plano. Plano desconhecido (dado sujo) vale 0, nunca NaN. */
function precoDoPlano(plano: string): number {
  return PLANS[plano]?.price ?? 0;
}

/** Divisão protegida: denominador 0 devolve 0, nunca NaN nem Infinity. */
function porcentagem(parte: number, total: number): number {
  if (total <= 0) return 0;
  return arredondar2((parte / total) * 100);
}

/**
 * Chaves "YYYY-MM" do mês atual para trás, em ordem cronológica.
 * O esqueleto é montado em TS (e não no banco) para que meses SEM movimento
 * apareçam com zero em vez de sumirem do gráfico.
 */
function chavesDeMeses(qtd: number): string[] {
  // Limite superior evita que um parâmetro absurdo vindo de querystring gere
  // uma série gigante no Postgres.
  const total = Math.min(60, Math.max(1, Math.floor(qtd) || 1));
  const agora = new Date();
  const chaves: string[] = [];
  for (let i = total - 1; i >= 0; i--) {
    // Date.UTC com mês negativo volta o ano sozinho.
    const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - i, 1));
    chaves.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return chaves;
}

/**
 * Extremos da série como texto "YYYY-MM-01".
 *
 * Passamos DATA COMO STRING (e castamos com ::date no SQL) de propósito. Se
 * passássemos um objeto Date, o driver pg serializa usando o fuso LOCAL do
 * processo Node; um `new Date(Date.UTC(2026, 0, 1))` viraria
 * "2025-12-31 21:00:00-03" e o ::timestamp descartaria o offset, jogando a
 * série para o mês anterior. Com string não há fuso envolvido.
 */
function limitesDaSerie(chaves: string[]): { primeiro: string; ultimo: string } {
  return { primeiro: `${chaves[0]}-01`, ultimo: `${chaves[chaves.length - 1]}-01` };
}

/**
 * Só registra — quem relança é cada `catch`, com `throw err` logo depois.
 *
 * Tentei antes tipar esta função como `never` e relançar aqui dentro, para não
 * repetir o throw em sete lugares. Não compila: com `never`, o TypeScript trata
 * o `return <valor-zero>` seguinte como inalcançável e estreita os tipos ali
 * para `never`, e o build quebrou com "Type '0' is not assignable to type
 * 'never'". Os retornos mortos foram removidos e o throw ficou explícito.
 *
 * A rejeição é capturada pelo Promise.allSettled de /api/admin/metrics, que a
 * converte no valor-zero E registra o nome da agregação em `degradado` — é o
 * que permite distinguir "não há receita" de "a query de receita caiu".
 */
function aviso(fn: string, err: unknown): void {
  console.warn(`[admin-metrics] ${fn}:`, (err as Error)?.message ?? err);
}

// ─── 1. MRR ───────────────────────────────────────────────────────────────────

export type LinhaPlanoMrr = {
  plano: string;
  assinantes: number;
  receita: number;
};

export type MetricasMrr = {
  mrr: number;
  arr: number;
  porPlano: LinhaPlanoMrr[];
  assinantesAtivos: number;
  arpu: number;
};

/**
 * MRR e derivados.
 *
 * REGRA: MRR = soma do preço de tabela dos planos das Subscription com
 * status "active".
 *   ENTRA:     status "active" (qualquer plano pago).
 *   NÃO ENTRA: "trialing" — trial custa R$ 0 e ainda não pagou nada. É o erro
 *              clássico deste cálculo: hoje há 16 trials contra 2 pagantes; se
 *              trial entrasse, o número inflaria sem nenhuma receita real.
 *   NÃO ENTRA: "expired" / "canceled" — já saíram.
 *   NÃO ENTRA: "cortesia" — acesso liberado à mão pelo admin, sem pagamento.
 *              É o motivo de esse status existir: em 29/07/2026 as duas únicas
 *              assinaturas "active" eram liberações manuais do dono, e este
 *              cálculo exibia R$ 599,80 de receita inexistente. Separar o
 *              status separa "tem acesso" de "gera receita". A exclusão é
 *              automática pelo filtro `status: "active"` abaixo — mas está
 *              escrita aqui para ninguém "consertar" o filtro sem entender.
 *
 * De propósito NÃO filtramos por currentPeriodEnd: uma assinatura "active" com
 * período vencido segue sendo receita contratada. Quem quer enxergar esse furo
 * usa resumoAssinaturas().inadimplentes.
 */
export async function calcularMrr(): Promise<MetricasMrr> {
  try {
    // Agrupa no banco: 1 query devolve plano + contagem, em vez de trazer
    // todas as linhas para somar em memória.
    const porPlanoRaw = await db.subscription.groupBy({
      by: ["plan"],
      where: { status: "active" },
      _count: { plan: true },
    });

    const porPlano: LinhaPlanoMrr[] = porPlanoRaw
      .map((r) => {
        const assinantes = r._count.plan;
        return {
          plano: r.plan,
          assinantes,
          receita: arredondar2(assinantes * precoDoPlano(r.plan)),
        };
      })
      // Só planos com assinante ativo aparecem. Quem quiser mostrar as faixas
      // vazias na UI cruza com PLANS.
      .sort((a, b) => b.receita - a.receita);

    const assinantesAtivos = porPlano.reduce((s, l) => s + l.assinantes, 0);
    const mrr = arredondar2(porPlano.reduce((s, l) => s + l.receita, 0));

    return {
      mrr,
      arr: arredondar2(mrr * 12),
      porPlano,
      assinantesAtivos,
      arpu: assinantesAtivos > 0 ? arredondar2(mrr / assinantesAtivos) : 0,
    };
  } catch (err) {
    aviso("calcularMrr", err);
    throw err;
}
}

// ─── 2. Resumo de assinaturas ─────────────────────────────────────────────────

export type LinhaPlanoStatus = {
  plano: string;
  status: string;
  quantidade: number;
};

export type ResumoAssinaturas = {
  total: number;
  porPlanoStatus: LinhaPlanoStatus[];
  trialsExpiradosNaoProcessados: number;
  trialsVencendo7d: number;
  inadimplentes: number;
};

/**
 * Foto do estado das assinaturas + os três alarmes que importam.
 *
 * trialsExpiradosNaoProcessados: trialEndsAt no passado mas status ainda
 *   "trialing". Existe porque a expiração é preguiçosa — só acontece quando o
 *   usuário volta e getAndSyncSubscription() roda (ver lib/subscription.ts).
 *   Quem nunca mais voltou fica preso em "trialing" para sempre. Número alto
 *   aqui = a base de trial está inflada e as contagens por status mentem.
 *
 * trialsVencendo7d: trials AINDA válidos que vencem em até 7 dias — a fila de
 *   quem precisa ser abordado. Exclui os já vencidos de propósito, senão os
 *   dois indicadores se sobrepõem e a lista de contato vira lixo.
 *
 * inadimplentes: status "active" com currentPeriodEnd no passado, ou seja,
 *   ainda entram no MRR mas o período pago acabou. currentPeriodEnd nulo NÃO
 *   conta (Prisma já ignora NULL na comparação): é o caso "assinatura sem
 *   vencimento", tratado como válido em isPlanActive().
 */
export async function resumoAssinaturas(): Promise<ResumoAssinaturas> {
  try {
    const agora = new Date();
    const em7Dias = new Date(agora.getTime() + 7 * DIA_MS);

    const [porPlanoStatusRaw, trialsExpiradosNaoProcessados, trialsVencendo7d, inadimplentes] =
      await Promise.all([
        db.subscription.groupBy({ by: ["plan", "status"], _count: { plan: true } }),
        db.subscription.count({
          where: { status: "trialing", trialEndsAt: { lt: agora } },
        }),
        db.subscription.count({
          where: { status: "trialing", trialEndsAt: { gte: agora, lte: em7Dias } },
        }),
        db.subscription.count({
          where: { status: "active", currentPeriodEnd: { lt: agora } },
        }),
      ]);

    const porPlanoStatus: LinhaPlanoStatus[] = porPlanoStatusRaw
      .map((r) => ({ plano: r.plan, status: r.status, quantidade: r._count.plan }))
      .sort((a, b) => b.quantidade - a.quantidade);

    return {
      // Somado das contagens para não gastar mais uma query (~190ms) só num count().
      total: porPlanoStatus.reduce((s, l) => s + l.quantidade, 0),
      porPlanoStatus,
      trialsExpiradosNaoProcessados,
      trialsVencendo7d,
      inadimplentes,
    };
  } catch (err) {
    aviso("resumoAssinaturas", err);
    throw err;
}
}

// ─── 3. Receita mensal ────────────────────────────────────────────────────────

export type PontoReceitaMensal = {
  mes: string;
  receita: number;
  novosAssinantes: number;
  cancelados: number;
};

/**
 * Série mensal de receita e movimentação.
 *
 * LIMITAÇÃO ESTRUTURAL — leia antes de confiar no histórico: não existe tabela
 * de eventos de assinatura. Subscription guarda só o estado ATUAL (plan,
 * status, currentPeriodEnd). Então o passado é reconstruído por aproximação:
 *
 *   - Uma assinatura conta na receita do mês M se já existia (createdAt antes
 *     do fim de M) E estava pagando em M — ou seja, está "active" hoje, ou o
 *     período pago dela alcançava M (currentPeriodEnd >= início de M).
 *   - O preço aplicado é o do plano ATUAL, retroativamente. Quem subiu de
 *     start para premium aparece como premium desde sempre; os meses antigos
 *     ficam superestimados. Sem histórico de plano não há como corrigir.
 *   - Pelo mesmo motivo, o mês em que a conta ainda era trial já entra com o
 *     preço do plano pago.
 *
 * ATENÇÃO: a receita do MÊS CORRENTE pode ficar MAIOR que o MRR de
 * calcularMrr(). Não é bug. MRR é a foto de hoje (só "active"); a receita do
 * mês inclui quem pagou parte do mês e caiu no meio dele. São perguntas
 * diferentes.
 *
 * novosAssinantes: Subscription criadas no mês. Conta TODO cadastro, trial
 *   incluído — é métrica de topo de funil, não de venda. Não existe carimbo de
 *   "virou pagante", então não dá para separar aqui.
 *
 * cancelados: assinaturas hoje em expired/canceled cujo updatedAt caiu no mês.
 *   updatedAt é proxy do momento da baixa (é a escrita que muda o status).
 *   Inclui trial que venceu, de propósito: aqui a leitura é "saídas da base".
 *   Para churn de RECEITA, use churnMensal(), que só olha planos pagos.
 */
export async function receitaMensal(meses = 12): Promise<PontoReceitaMensal[]> {
  const chaves = chavesDeMeses(meses);
  const serieZerada: PontoReceitaMensal[] = chaves.map((mes) => ({
    mes,
    receita: 0,
    novosAssinantes: 0,
    cancelados: 0,
  }));

  try {
    const { primeiro, ultimo } = limitesDaSerie(chaves);

    // Três agregações independentes → Promise.all. Serial custaria ~570ms.
    const [ativosRaw, novosRaw, canceladosRaw] = await Promise.all([
      // Contagem por (mês, plano). O preço entra só depois, em TS.
      db.$queryRaw<{ mes: string; plano: string; total: number }[]>`
        SELECT to_char(m.mes, 'YYYY-MM') AS mes,
               s.plan AS plano,
               COUNT(*)::int AS total
        FROM generate_series(${primeiro}::date, ${ultimo}::date, interval '1 month') AS m(mes)
        JOIN "Subscription" s
          ON s."createdAt" < m.mes + interval '1 month'
         AND (
               s.status = 'active'
               OR (s."currentPeriodEnd" IS NOT NULL AND s."currentPeriodEnd" >= m.mes)
             )
        GROUP BY 1, 2
      `,
      db.$queryRaw<{ mes: string; total: number }[]>`
        SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS mes,
               COUNT(*)::int AS total
        FROM "Subscription"
        WHERE "createdAt" >= ${primeiro}::date
        GROUP BY 1
      `,
      db.$queryRaw<{ mes: string; total: number }[]>`
        SELECT to_char(date_trunc('month', "updatedAt"), 'YYYY-MM') AS mes,
               COUNT(*)::int AS total
        FROM "Subscription"
        WHERE status IN ('expired', 'canceled')
          AND "updatedAt" >= ${primeiro}::date
        GROUP BY 1
      `,
    ]);

    const receitaPorMes = new Map<string, number>();
    for (const l of ativosRaw) {
      const atual = receitaPorMes.get(l.mes) ?? 0;
      receitaPorMes.set(l.mes, atual + Number(l.total) * precoDoPlano(l.plano));
    }

    const novosPorMes = new Map<string, number>();
    for (const l of novosRaw) novosPorMes.set(l.mes, Number(l.total));

    const canceladosPorMes = new Map<string, number>();
    for (const l of canceladosRaw) canceladosPorMes.set(l.mes, Number(l.total));

    // Percorre o esqueleto, não o resultado: garante exatamente `meses` pontos.
    return chaves.map((mes) => ({
      mes,
      receita: arredondar2(receitaPorMes.get(mes) ?? 0),
      novosAssinantes: novosPorMes.get(mes) ?? 0,
      cancelados: canceladosPorMes.get(mes) ?? 0,
    }));
  } catch (err) {
    aviso("receitaMensal", err);
    throw err;
}
}

// ─── 4. Churn mensal ──────────────────────────────────────────────────────────

export type PontoChurnMensal = {
  mes: string;
  ativosInicio: number;
  cancelados: number;
  /** Percentual de 0 a 100 (não fração). Segue o padrão de errorRate em
   *  api/admin/analytics. */
  taxa: number;
};

/**
 * Churn de RECEITA, mês a mês.
 *
 * Diferença deliberada para receitaMensal().cancelados: aqui os dois lados da
 * conta consideram SÓ PLANOS PAGOS. Trial que venceu não é churn de cliente —
 * se entrasse, os 16 trials da base derrubariam a taxa contra uma base de 2
 * pagantes e o indicador viraria ficção. Os números não batem entre as duas
 * funções por design.
 *
 * ativosInicio: assinaturas de plano pago que já existiam antes do primeiro
 *   instante do mês (createdAt < início) e estavam pagando ali — mesma
 *   aproximação de receitaMensal(), com as mesmas limitações de histórico.
 *
 * cancelados: assinaturas de plano pago que hoje estão em expired/canceled e
 *   cujo updatedAt caiu no mês.
 *
 * taxa: cancelados / ativosInicio x 100. Mês sem base no início devolve 0 —
 *   nunca dividimos por zero e nunca inventamos 100%.
 */
export async function churnMensal(meses = 6): Promise<PontoChurnMensal[]> {
  const chaves = chavesDeMeses(meses);
  const serieZerada: PontoChurnMensal[] = chaves.map((mes) => ({
    mes,
    ativosInicio: 0,
    cancelados: 0,
    taxa: 0,
  }));

  try {
    const { primeiro, ultimo } = limitesDaSerie(chaves);

    const [ativosRaw, canceladosRaw] = await Promise.all([
      // Note `< m.mes` (e não `< m.mes + 1 mês`): a base é medida no PRIMEIRO
      // instante do mês. Quem assinou e cancelou dentro do mesmo mês não entra
      // no denominador — é a convenção padrão de churn.
      db.$queryRaw<{ mes: string; plano: string; total: number }[]>`
        SELECT to_char(m.mes, 'YYYY-MM') AS mes,
               s.plan AS plano,
               COUNT(*)::int AS total
        FROM generate_series(${primeiro}::date, ${ultimo}::date, interval '1 month') AS m(mes)
        JOIN "Subscription" s
          ON s."createdAt" < m.mes
         AND (
               s.status = 'active'
               OR (s."currentPeriodEnd" IS NOT NULL AND s."currentPeriodEnd" >= m.mes)
             )
        GROUP BY 1, 2
      `,
      db.$queryRaw<{ mes: string; plano: string; total: number }[]>`
        SELECT to_char(date_trunc('month', "updatedAt"), 'YYYY-MM') AS mes,
               plan AS plano,
               COUNT(*)::int AS total
        FROM "Subscription"
        WHERE status IN ('expired', 'canceled')
          AND "updatedAt" >= ${primeiro}::date
        GROUP BY 1, 2
      `,
    ]);

    // O filtro de plano pago fica aqui, e não no SQL, para não duplicar a
    // lista de planos em texto dentro da query.
    const somarPagos = (linhas: { mes: string; plano: string; total: number }[]) => {
      const mapa = new Map<string, number>();
      for (const l of linhas) {
        if (!PLANOS_PAGOS.includes(l.plano)) continue;
        mapa.set(l.mes, (mapa.get(l.mes) ?? 0) + Number(l.total));
      }
      return mapa;
    };

    const ativosPorMes = somarPagos(ativosRaw);
    const canceladosPorMes = somarPagos(canceladosRaw);

    return chaves.map((mes) => {
      const ativosInicio = ativosPorMes.get(mes) ?? 0;
      const cancelados = canceladosPorMes.get(mes) ?? 0;
      return { mes, ativosInicio, cancelados, taxa: porcentagem(cancelados, ativosInicio) };
    });
  } catch (err) {
    aviso("churnMensal", err);
    throw err;
}
}

// ─── 5. Métricas de usuários ──────────────────────────────────────────────────

export type MetricasUsuarios = {
  total: number;
  porRole: Record<string, number>;
  ativos30d: number;
  inativos30d: number;
  novos7d: number;
  novos30d: number;
  onboardingIncompleto: number;
};

/**
 * Uso da base de usuários.
 *
 * ATIVO = tem PageView OU ActiveSession nos últimos 30 dias. As duas fontes
 * são necessárias e nenhuma basta sozinha: PageView é o histórico de navegação
 * e ActiveSession é o heartbeat do "agora" (tabela quase sempre quase vazia,
 * porque a linha só vive enquanto a aba está aberta).
 *
 * A contagem parte de "User" com EXISTS nas duas tabelas, em vez de contar
 * sessionId distinto. Dois motivos: PageView.userId é nullable (visita
 * anônima na landing page não é usuário ativo) e userId órfão de conta
 * apagada não pode contar. Assim ativos30d <= total sempre, e inativos30d
 * nunca fica negativo.
 */
export async function metricasUsuarios(): Promise<MetricasUsuarios> {
  try {
    const agora = Date.now();
    const desde30 = new Date(agora - 30 * DIA_MS);
    const desde7 = new Date(agora - 7 * DIA_MS);

    const [total, porRoleRaw, ativosRaw, novos7d, novos30d, onboardingIncompleto] =
      await Promise.all([
        db.user.count(),
        db.user.groupBy({ by: ["role"], _count: { role: true } }),
        db.$queryRaw<{ total: number }[]>`
          SELECT COUNT(*)::int AS total
          FROM "User" u
          WHERE EXISTS (
                  SELECT 1 FROM "PageView" p
                  WHERE p."userId" = u.id AND p."createdAt" >= ${desde30}
                )
             OR EXISTS (
                  SELECT 1 FROM "ActiveSession" a
                  WHERE a."userId" = u.id AND a."lastSeen" >= ${desde30}
                )
        `,
        db.user.count({ where: { createdAt: { gte: desde7 } } }),
        db.user.count({ where: { createdAt: { gte: desde30 } } }),
        db.user.count({ where: { onboardingCompleted: false } }),
      ]);

    // Semeia com os roles do schema: hoje não existe nenhum CLIENT, e sem isso
    // a chave sumiria do objeto e a UI teria que tratar undefined.
    const porRole: Record<string, number> = {};
    for (const r of ROLES_CONHECIDOS) porRole[r] = 0;
    for (const r of porRoleRaw) porRole[r.role] = r._count.role;

    const ativos30d = Number(ativosRaw[0]?.total ?? 0);

    return {
      total,
      porRole,
      ativos30d,
      inativos30d: Math.max(0, total - ativos30d),
      novos7d,
      novos30d,
      onboardingIncompleto,
    };
  } catch (err) {
    aviso("metricasUsuarios", err);
    throw err;
}
}

// ─── 6. Funil de trial ────────────────────────────────────────────────────────

export type FunilTrial = {
  /** Trials AINDA EM ANDAMENTO: status "trialing" E `trialEndsAt` no futuro. */
  emTrial: number;
  /** Trials com prazo vencido que ninguém processou — continuam "trialing" no
   *  banco, mas já decidiram por inação. Contam como fracasso na taxa. */
  vencidosNaoProcessados: number;
  converteram: number;
  expiraramSemConverter: number;
  /** Percentual de 0 a 100, ou null quando não há NENHUM caso resolvido.
   *  null e 0 são coisas diferentes: "ninguém decidiu ainda" não é "0% converte". */
  taxaConversao: number | null;
};

/**
 * Funil trial -> pagante.
 *
 * A REGRA QUE MUDOU, e por quê: a versão anterior definia `emTrial` como todo
 * mundo em status "trialing" e deixava esse grupo INTEIRO fora do denominador.
 * Duas coisas diferentes estavam misturadas ali:
 *
 *   · quem ainda está dentro do prazo — de fato não decidiu, e tirá-lo do
 *     denominador está CERTO: senão a taxa despencaria só porque entrou gente
 *     nova na base;
 *   · quem já passou do prazo e ninguém processou — esse **já decidiu, por
 *     inação**, e ficava fora dos dois lados da conta.
 *
 * Como a expiração é preguiçosa (só roda quando o usuário volta), o segundo
 * grupo cresce sem parar. Em produção eram 15 de 22 "trials". Efeito: fracasso
 * silencioso nunca contava, sucesso contava para sempre, e a taxa saía 75%
 * quando a realidade era ~16%. Um painel financeiro não pode depender de um job
 * que ninguém roda.
 *
 * Agora o corte é pela DATA, não pelo status:
 *
 * emTrial: "trialing" E trialEndsAt ainda no futuro (ou nulo — trial sem prazo
 *   definido não venceu). Fora do denominador.
 * vencidosNaoProcessados: "trialing" E trialEndsAt no passado. Conta como
 *   fracasso; é o número que o card de alarme já mostrava em resumoAssinaturas.
 * converteram: plano PAGO em qualquer status. Quem virou premium e depois
 *   venceu converteu — como `plan` é sobrescrito no upgrade, o plano pago é a
 *   única marca que sobra de que houve pagamento.
 * expiraramSemConverter: encerrou (expired/canceled) ainda no plano trial.
 *
 * taxaConversao = converteram / (converteram + expiraramSemConverter +
 *   vencidosNaoProcessados) x 100, ou **null** se não houver nenhum caso
 *   resolvido — 0% afirmaria que ninguém converte, o que é diferente de "ainda
 *   não há o que medir".
 */
export async function funilTrial(): Promise<FunilTrial> {
  try {
    const agora = new Date();
    const [emTrial, vencidosNaoProcessados, converteram, expiraramSemConverter] =
      await Promise.all([
        db.subscription.count({
          where: {
            status: "trialing",
            OR: [{ trialEndsAt: { gte: agora } }, { trialEndsAt: null }],
          },
        }),
        db.subscription.count({
          where: { status: "trialing", trialEndsAt: { lt: agora } },
        }),
        db.subscription.count({ where: { plan: { in: PLANOS_PAGOS } } }),
        db.subscription.count({
          where: { status: { in: STATUS_ENCERRADOS }, plan: { notIn: PLANOS_PAGOS } },
        }),
      ]);

    const resolvidos = converteram + expiraramSemConverter + vencidosNaoProcessados;

    return {
      emTrial,
      vencidosNaoProcessados,
      converteram,
      expiraramSemConverter,
      taxaConversao: resolvidos > 0 ? porcentagem(converteram, resolvidos) : null,
    };
  } catch (err) {
    aviso("funilTrial", err);
    throw err;
}
}

// ─── 7. Saúde das integrações ─────────────────────────────────────────────────

export type SaudeIntegracoes = {
  total: number;
  porPlataforma: Record<string, number>;
  ativas: number;
  comErro: number;
  workspacesSemBm: number;
};

/**
 * Saúde da camada de integrações.
 *
 * ativas / comErro: status gravado em Integration. Quem escreve "error" é o
 *   reconciliador de lib/integration-health.ts, que só marca quando a listagem
 *   da Meta deu certo — então "error" aqui significa conta realmente fora do
 *   portfólio, não instabilidade de rede.
 *
 * porPlataforma NÃO é semeado com valores conhecidos (ao contrário de porRole):
 *   plataforma é campo aberto ("meta", "google", "ga4", ...) e inventar chaves
 *   fixas esconderia uma plataforma nova aparecendo no banco.
 *
 * workspacesSemBm: workspaces vivos (deletedAt null) sem NENHUMA integração
 *   com bmId preenchido. Cobre dois casos que valem o mesmo alerta: workspace
 *   sem integração alguma, e workspace cujas contas foram ligadas soltas —
 *   a UI de integrações permite escolher "sem-bm" e grava bmId null. Vale
 *   lembrar que integração Google nunca tem BM (é conceito da Meta), então
 *   workspace só-Google cai aqui legitimamente: é um workspace sem BM
 *   identificada, que é exatamente o que o indicador diz.
 *
 * ativas + comErro pode não fechar com total se surgir um status novo — o
 * total vem de um count próprio, não da soma, justamente para não mascarar isso.
 */
export async function saudeIntegracoes(): Promise<SaudeIntegracoes> {
  try {
    const [total, porPlataformaRaw, ativas, comErro, workspacesSemBm] = await Promise.all([
      db.integration.count(),
      db.integration.groupBy({ by: ["platform"], _count: { platform: true } }),
      db.integration.count({ where: { status: "active" } }),
      db.integration.count({ where: { status: "error" } }),
      db.workspace.count({
        where: {
          deletedAt: null,
          integrations: { none: { integration: { bmId: { not: null } } } },
        },
      }),
    ]);

    const porPlataforma: Record<string, number> = {};
    for (const p of porPlataformaRaw) porPlataforma[p.platform] = p._count.platform;

    return { total, porPlataforma, ativas, comErro, workspacesSemBm };
  } catch (err) {
    aviso("saudeIntegracoes", err);
    throw err;
}
}
