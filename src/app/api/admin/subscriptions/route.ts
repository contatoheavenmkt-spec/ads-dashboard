/**
 * GET /api/admin/subscriptions
 *
 * Lista paginada de assinaturas para a tela /admin/subscriptions.
 *
 * Query:
 *   plano      — trial | start | plus | premium (valor fora da lista é ignorado)
 *   status     — trialing | active | expired    (idem)
 *   busca      — casa em email OU nome do usuário, case-insensitive
 *   pagina     — 1..n            (padrão 1)
 *   porPagina  — 1..100          (padrão 25)
 *   ordenar    — criadoEm | atualizadoEm | plano | status | email | nome |
 *                trialEndsAt | currentPeriodEnd   (padrão criadoEm)
 *   direcao    — asc | desc      (padrão desc)
 *
 * Três decisões que valem para o arquivo inteiro:
 *
 * 1. PAGINAÇÃO NO BANCO, SEMPRE. skip/take no Prisma + count separado. São ~21
 *    assinaturas hoje, mas trazer a tabela inteira e fatiar em JS é o tipo de
 *    atalho que só dói quando já é tarde. count e findMany vão num único
 *    Promise.all — cada ida ao Supabase custa ~190ms e as duas são
 *    independentes.
 *
 * 2. FILTRO INVÁLIDO É IGNORADO, NÃO É 400. Este é um endpoint de LEITURA
 *    alimentado por dropdown: "?plano=lixo" é bug de UI, não ataque, e derrubar
 *    a tela inteira por causa disso é pior que listar tudo. Por isso a resposta
 *    ecoa em `filtros` o que foi realmente aplicado — sem isso a UI mostraria
 *    "filtrando por lixo" enquanto exibe a lista completa. Na MUTAÇÃO (PATCH)
 *    a regra é a oposta: lá valor inválido é 400.
 *
 * 3. NÃO REGISTRA EM AdminLog. logAdminAction é para mutação; logar cada
 *    abertura de tela encheria a tabela de ruído e somaria ~190ms de escrita ao
 *    caminho crítico. Mesmo critério de api/admin/metrics.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateAdminRequest } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";

// Assinatura é estado que o admin altera na tela ao lado; servir de cache faria
// a lista contradizer o PATCH que acabou de rodar.
export const dynamic = "force-dynamic";

// ─── Whitelists e parâmetros ──────────────────────────────────────────────────

/** Derivado de PLANS em vez de escrito à mão: plano novo em plans.ts já entra
 *  como filtro válido aqui sem ninguém lembrar de mexer neste arquivo. */
const PLANOS_VALIDOS = Object.keys(PLANS);

/** Os status que o schema documenta. "canceled" existe em linhas antigas do
 *  banco (ver STATUS_ENCERRADOS em lib/admin-metrics.ts) e continua listável —
 *  só não é oferecido como filtro porque não é mais escrito por ninguém. */
const STATUS_VALIDOS = ["trialing", "active", "expired", "cortesia"];

const POR_PAGINA_PADRAO = 25;
const POR_PAGINA_MAX = 100;

/** Teto de página. Não é sobre UX (100k × 25 = 2,5M linhas, nunca vai chegar
 *  lá): é para `(pagina - 1) * porPagina` não estourar o inteiro seguro do JS e
 *  mandar um OFFSET podre para o Postgres. */
const PAGINA_MAX = 100000;

/** Teto de caracteres da busca. String gigante em ILIKE é varredura cara de
 *  graça — e nenhum email real passa disso. */
const BUSCA_MAX = 120;

const MS_POR_DIA = 1000 * 60 * 60 * 24;

/**
 * Inteiro de query string com piso e teto.
 *
 * Number e não parseInt de propósito: `parseInt("25abc")` devolve 25 e aceita
 * lixo como se fosse válido, e `parseInt("abc")` devolve NaN, que vaza para o
 * skip/take do Prisma e derruba a rota com 500 — bug que já existe em outras
 * rotas do projeto. Aqui qualquer coisa que não seja inteiro cai no padrão.
 */
function validarInteiro(bruto: string | null, padrao: number, min: number, max: number): number {
  if (bruto === null || bruto.trim() === "") return padrao;
  const n = Number(bruto);
  if (!Number.isInteger(n)) return padrao;
  return Math.min(max, Math.max(min, n));
}

/**
 * Traduz o nome de ordenação da UI (pt-BR) para o campo do Prisma.
 *
 * É um switch fechado e não um `{ [campo]: direcao }` montado com a string
 * crua justamente para que nenhum nome de coluna venha do cliente. Valor
 * desconhecido cai no padrão (createdAt) em vez de erro.
 *
 * `any` no retorno: sem node_modules aqui não há como validar o tipo gerado do
 * Prisma, e o arquivo vizinho (api/admin/accounts) já usa a mesma saída.
 */
function montarOrdenacao(ordenar: string | null, direcao: "asc" | "desc"): any {
  switch (ordenar) {
    // Ordenação por campo da relação User — o Prisma resolve como JOIN, não
    // precisa (nem deve) trazer as linhas para ordenar em JS.
    case "email":
      return { user: { email: direcao } };
    case "nome":
      return { user: { name: direcao } };
    case "plano":
      return { plan: direcao };
    case "status":
      return { status: direcao };
    case "trialEndsAt":
      return { trialEndsAt: direcao };
    case "currentPeriodEnd":
      return { currentPeriodEnd: direcao };
    case "atualizadoEm":
      return { updatedAt: direcao };
    case "criadoEm":
    default:
      return { createdAt: direcao };
  }
}

// ─── Regras de negócio da linha ───────────────────────────────────────────────

/**
 * Dias que faltam para o fim do trial. null quando não há trialEndsAt.
 *
 * Deliberadamente sobre a DATA e não sobre o status: uma assinatura já migrada
 * para "active" ainda tem a data do trial gravada, e o admin quer ver quando
 * ele terminou. Já vencido devolve 0 (nunca negativo) — mesma conta de
 * trialDaysRemaining em lib/subscription.ts, mantida idêntica para as duas
 * telas não mostrarem números diferentes do mesmo trial.
 */
function diasRestantesTrial(trialEndsAt: Date | null): number | null {
  if (!trialEndsAt) return null;
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / MS_POR_DIA));
}

/**
 * "vencido" = a assinatura passou da validade, INDEPENDENTE do status gravado.
 *
 * Existe porque o status no banco mente por omissão: nada roda de madrugada
 * marcando trial vencido como "expired" — a baixa só acontece quando o usuário
 * entra e getAndSyncSubscription (lib/subscription.ts) corrige a linha. Sem
 * esta flag, um trial que acabou há duas semanas aparece como "trialing" na
 * lista do admin e parece base saudável.
 *
 * São os mesmos dois casos que resumoAssinaturas() conta em admin-metrics.ts
 * como `trialsExpiradosNaoProcessados` e `inadimplentes`.
 */
function estaVencido(status: string, trialEndsAt: Date | null, currentPeriodEnd: Date | null): boolean {
  const agora = Date.now();
  if (status === "expired" || status === "canceled") return true;
  if (status === "trialing") return trialEndsAt !== null && trialEndsAt.getTime() <= agora;
  // Cortesia COM prazo vencido também está vencida; sem prazo, nunca vence.
  if (status === "active" || status === "cortesia") {
    return currentPeriodEnd !== null && currentPeriodEnd.getTime() <= agora;
  }
  return false;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!validateAdminRequest(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);

  const planoBruto = searchParams.get("plano");
  const statusBruto = searchParams.get("status");
  const plano = planoBruto && PLANOS_VALIDOS.includes(planoBruto) ? planoBruto : null;
  const status = statusBruto && STATUS_VALIDOS.includes(statusBruto) ? statusBruto : null;
  const busca = (searchParams.get("busca") ?? "").trim().slice(0, BUSCA_MAX);

  const pagina = validarInteiro(searchParams.get("pagina"), 1, 1, PAGINA_MAX);
  const porPagina = validarInteiro(searchParams.get("porPagina"), POR_PAGINA_PADRAO, 1, POR_PAGINA_MAX);

  const direcaoBruta = searchParams.get("direcao");
  const direcao: "asc" | "desc" = direcaoBruta === "asc" ? "asc" : "desc";
  const ordenar = searchParams.get("ordenar");

  // `any` pelo mesmo motivo de montarOrdenacao — segue o padrão de
  // api/admin/accounts/route.ts.
  const where: any = {};
  if (plano) where.plan = plano;
  if (status) where.status = status;
  if (busca) {
    // Filtro na relação: email/nome moram em User, não em Subscription.
    where.user = {
      OR: [
        { email: { contains: busca, mode: "insensitive" } },
        { name: { contains: busca, mode: "insensitive" } },
      ],
    };
  }

  try {
    const [linhas, total] = await Promise.all([
      db.subscription.findMany({
        where,
        // select explícito na relação: User.password é hash bcrypt e NUNCA pode
        // sair numa resposta de API. `include: { user: true }` traria o campo.
        select: {
          id: true,
          userId: true,
          plan: true,
          status: true,
          trialEndsAt: true,
          currentPeriodEnd: true,
          accountsLimit: true,
          createdAt: true,
          user: { select: { email: true, name: true } },
        },
        orderBy: montarOrdenacao(ordenar, direcao),
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
      db.subscription.count({ where }),
    ]);

    const itens = linhas.map((s) => ({
      id: s.id,
      userId: s.userId,
      email: s.user.email,
      nome: s.user.name,
      plano: s.plan,
      status: s.status,
      // Preço DE TABELA do plano (PLANS), em reais. Plano desconhecido vale 0,
      // nunca NaN.
      //
      // ATENÇÃO: isto NÃO é MRR. Somar esta coluna dá errado porque um premium
      // "expired" continua valendo 299,90 de tabela sem gerar receita. O MRR é
      // calculado em calcularMrr() (lib/admin-metrics.ts), que conta só
      // status "active" — hoje R$ 599,80.
      valorMensal: PLANS[s.plan]?.price ?? 0,
      accountsLimit: s.accountsLimit,
      trialEndsAt: s.trialEndsAt,
      currentPeriodEnd: s.currentPeriodEnd,
      diasRestantesTrial: diasRestantesTrial(s.trialEndsAt),
      vencido: estaVencido(s.status, s.trialEndsAt, s.currentPeriodEnd),
      criadoEm: s.createdAt,
    }));

    return NextResponse.json(
      {
        itens,
        total,
        pagina,
        porPagina,
        // Math.max(1, ...) para a UI nunca escrever "página 1 de 0" quando o
        // filtro não casa nada. Página além do fim devolve itens: [] — é lista
        // vazia, não erro.
        totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
        // Ecoa o que foi REALMENTE aplicado: como valor inválido é ignorado em
        // silêncio, sem isto a UI não teria como saber que o filtro dela caiu.
        filtros: { plano, status, busca: busca || null, ordenar: ordenar ?? "criadoEm", direcao },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    console.error("[admin/subscriptions/GET] Erro:", err?.message ?? err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
