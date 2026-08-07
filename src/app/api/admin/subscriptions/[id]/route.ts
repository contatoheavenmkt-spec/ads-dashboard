/**
 * PATCH /api/admin/subscriptions/[id]
 *
 * Altera plano / status / datas de uma assinatura pela tela do admin.
 * Body (todos opcionais, mas pelo menos um obrigatório):
 *   { plano?, status?, trialEndsAt?, currentPeriodEnd? }
 *
 * Datas aceitam string ISO ou `null` (null LIMPA a data). Devolve a assinatura
 * atualizada no mesmo shape de um item de GET /api/admin/subscriptions, para a
 * UI trocar a linha da tabela sem refetch da lista inteira.
 *
 * Três decisões que valem para o arquivo inteiro:
 *
 * 1. AQUI VALOR INVÁLIDO É 400, e não "ignora em silêncio". O GET da lista faz
 *    o contrário de propósito (filtro ruim não derruba tela), mas isto é
 *    MUTAÇÃO: o vizinho api/admin/accounts/[id] descarta plan/status/data
 *    inválidos calado e responde `{ ok: true }` — o admin vê sucesso, sai da
 *    tela e a assinatura continua como estava. Silêncio em escrita é pior que
 *    erro.
 *
 * 2. WHITELIST DE PLANO E STATUS. Meio projeto faz `PLANS[sub.plan]` e
 *    `status === "active"`. Um plano escrito errado no banco não quebra aqui:
 *    quebra no limite de contas do cliente (validateAccountLimit) e no MRR do
 *    painel, longe da causa.
 *
 * 3. O LOG NÃO É AWAITADO. logAdminAction escreve no Supabase (~190ms) e o
 *    admin já esperou o findUnique + update. Auditoria é obrigatória, mas não
 *    no caminho crítico — `void` porque a função já engole os próprios erros
 *    internamente (nunca rejeita, então não há unhandled rejection).
 */

import { NextRequest, NextResponse } from "next/server";
import { validateAdminRequest, logAdminAction } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// ─── Whitelists ───────────────────────────────────────────────────────────────

/** Derivado de PLANS: plano novo em plans.ts já passa a ser aceito aqui. */
const PLANOS_VALIDOS = Object.keys(PLANS);

/**
 * Os únicos status que o admin pode GRAVAR.
 *
 * "canceled" existe em linhas antigas e é lido como fim de vida em
 * lib/admin-metrics.ts (STATUS_ENCERRADOS), mas está fora desta lista de
 * propósito: nenhum código novo escreve esse valor, e deixá-lo settável na tela
 * só criaria mais dados no estado legado. Baixa manual se faz com "expired".
 */
// "cortesia" = acesso liberado à mão, sem pagamento. Ver STATUS_CORTESIA em
// lib/subscription.ts: vale como ativa para ACESSO e fica fora do MRR.
const STATUS_VALIDOS = ["trialing", "active", "expired", "cortesia"];

const MS_POR_DIA = 1000 * 60 * 60 * 24;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function erro(mensagem: string, status = 400) {
  return NextResponse.json({ error: mensagem }, { status });
}

/**
 * Resultado de parse de data: ou uma data válida (`Date`/`null` para limpar),
 * ou a marca de inválido. Precisa dos três estados porque `null` é um valor
 * legítimo (limpar o campo) e não pode se confundir com erro.
 */
type DataParseada = { ok: true; valor: Date | null } | { ok: false };

/**
 * Aceita ISO string ou null. Qualquer outra coisa é inválida.
 *
 * O `isNaN(getTime())` é o que impede um "Invalid Date" de ser gravado: o
 * Prisma aceita o objeto Date e só quebra na serialização, com erro que não
 * aponta para o campo culpado.
 */
function parsearData(bruto: unknown): DataParseada {
  if (bruto === null) return { ok: true, valor: null };
  if (typeof bruto !== "string") return { ok: false };
  const texto = bruto.trim();
  if (texto === "") return { ok: false };
  const d = new Date(texto);
  if (isNaN(d.getTime())) return { ok: false };
  return { ok: true, valor: d };
}

/** Idêntico ao da rota de listagem — ver comentário lá. Duplicado porque um
 *  route.ts do App Router não pode exportar helper (Next só admite handlers e
 *  config de segmento). Se aparecer um terceiro consumidor, promover para
 *  lib/subscription.ts. */
function diasRestantesTrial(trialEndsAt: Date | null): number | null {
  if (!trialEndsAt) return null;
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / MS_POR_DIA));
}

/** Idêntico ao da rota de listagem — ver comentário lá. */
function estaVencido(status: string, trialEndsAt: Date | null, currentPeriodEnd: Date | null): boolean {
  const agora = Date.now();
  if (status === "expired" || status === "canceled") return true;
  if (status === "trialing") return trialEndsAt !== null && trialEndsAt.getTime() <= agora;
  if (status === "active" || status === "cortesia") {
    return currentPeriodEnd !== null && currentPeriodEnd.getTime() <= agora;
  }
  return false;
}

/** Mesmo shape do item de GET /api/admin/subscriptions. */
function montarResposta(s: {
  id: string;
  userId: string;
  plan: string;
  status: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  accountsLimit: number;
  createdAt: Date;
  user: { email: string; name: string | null };
}) {
  return {
    id: s.id,
    userId: s.userId,
    email: s.user.email,
    nome: s.user.name,
    plano: s.plan,
    status: s.status,
    // Preço de tabela do plano — NÃO é MRR (ver comentário na rota de listagem).
    valorMensal: PLANS[s.plan]?.price ?? 0,
    accountsLimit: s.accountsLimit,
    trialEndsAt: s.trialEndsAt,
    currentPeriodEnd: s.currentPeriodEnd,
    diasRestantesTrial: diasRestantesTrial(s.trialEndsAt),
    vencido: estaVencido(s.status, s.trialEndsAt, s.currentPeriodEnd),
    criadoEm: s.createdAt,
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdminRequest(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const ip = getClientIp(req.headers);

  // req.json() lança em body vazio ou malformado — sem o catch isso vira 500 e
  // some no ErrorLog como se fosse defeito do servidor.
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return erro("Body inválido: esperado JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return erro("Body inválido: esperado um objeto JSON");
  }

  const { plano, status, trialEndsAt, currentPeriodEnd } = body;

  // Nenhum campo conhecido = provável erro de digitação no nome da chave. Dizer
  // "nada para alterar" é melhor que responder 200 sem ter feito nada.
  if (
    plano === undefined &&
    status === undefined &&
    trialEndsAt === undefined &&
    currentPeriodEnd === undefined
  ) {
    return erro("Nenhum campo para alterar. Envie plano, status, trialEndsAt ou currentPeriodEnd.");
  }

  // `any` pelo mesmo motivo do arquivo vizinho (api/admin/accounts): sem os
  // tipos gerados do Prisma disponíveis, montar o objeto parcial tipado só
  // adicionaria ruído.
  const dados: any = {};

  if (plano !== undefined) {
    if (typeof plano !== "string" || !PLANOS_VALIDOS.includes(plano)) {
      return erro(`Plano inválido. Valores aceitos: ${PLANOS_VALIDOS.join(", ")}.`);
    }
    dados.plan = plano;
    // O limite de contas é DERIVADO do plano, nunca enviado pelo cliente. Se
    // ficasse dessincronizado, um downgrade para start manteria as 30 contas do
    // premium liberadas (validateAccountLimit lê accountsLimit da linha, não de
    // PLANS) — o cliente pagaria R$ 49,90 usando o limite do plano de R$ 299,90.
    dados.accountsLimit = PLANS[plano].accountsLimit;
  }

  if (status !== undefined) {
    if (typeof status !== "string" || !STATUS_VALIDOS.includes(status)) {
      return erro(`Status inválido. Valores aceitos: ${STATUS_VALIDOS.join(", ")}.`);
    }
    dados.status = status;
  }

  if (trialEndsAt !== undefined) {
    const r = parsearData(trialEndsAt);
    if (!r.ok) return erro("trialEndsAt inválido: envie uma data ISO ou null.");
    dados.trialEndsAt = r.valor;
  }

  if (currentPeriodEnd !== undefined) {
    const r = parsearData(currentPeriodEnd);
    if (!r.ok) return erro("currentPeriodEnd inválido: envie uma data ISO ou null.");
    dados.currentPeriodEnd = r.valor;
  }

  try {
    // Lemos ANTES de atualizar porque o log de auditoria precisa do "de".
    // Custa ~190ms extras, e é o preço de ter no AdminLog o que a linha era —
    // sem isso o log vira "alguém mexeu", que não serve para reconstruir nada.
    //
    // Busca por Subscription.id (o `id` que o GET da lista devolve) e, se não
    // achar, por userId: a relação é 1:1, os dois identificam a mesma linha sem
    // ambiguidade, e isso evita 404 quando a tela manda o id do usuário. A
    // segunda consulta só acontece no caminho de erro.
    // O select é repetido literal nas três consultas em vez de sair numa
    // constante compartilhada: o Prisma infere o tipo do retorno a partir do
    // literal `true` de cada campo, e uma constante extraída sem `as const`
    // alarga para `boolean` e some com os campos do tipo do resultado.
    // Nenhuma delas traz User.password — hash bcrypt nunca sai em resposta.
    let antes = await db.subscription.findUnique({
      where: { id },
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
    });
    if (!antes) {
      antes = await db.subscription.findUnique({
        where: { userId: id },
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
      });
    }
    if (!antes) {
      return erro("Assinatura não encontrada", 404);
    }

    // ─── Coerência entre plano e status ──────────────────────────────────────
    //
    // Plano e status eram validados em blocos independentes acima, cada um
    // contra a sua whitelist. Isso deixava passar a combinação `trial` +
    // `active`, que é contraditória: "assinatura ativa" no plano que custa
    // R$ 0,00.
    //
    // Não é um estado inofensivo. `calcularMrr` agrupa por plano filtrando
    // apenas `status: "active"` e soma TODAS as linhas em `assinantesAtivos`;
    // um trial marcado como ativo entraria na contagem contribuindo zero para o
    // MRR, e como o ARPU é MRR ÷ assinantesAtivos, ele seria DILUÍDO — com 2
    // pagantes reais, um intruso derrubaria o ticket médio de R$ 299,90 para
    // R$ 199,93 sem que nada na tela explicasse a queda.
    //
    // A checagem roda sobre o estado RESULTANTE (o campo enviado, ou o que já
    // estava na linha), porque um PATCH que muda só o status precisa ser
    // avaliado contra o plano que a assinatura já tem.
    const planoFinal = dados.plan ?? antes.plan;
    const statusFinal = dados.status ?? antes.status;
    const planoEhPago = (PLANS[planoFinal]?.price ?? 0) > 0;

    // "cortesia" é a exceção deliberada às duas regras abaixo: ela existe
    // justamente para dar acesso de plano pago SEM cobrança. Um plano pago em
    // cortesia é o caso de uso, não um erro — e ela não entra no MRR, então
    // nada é distorcido.
    if (statusFinal !== "cortesia") {
      if (statusFinal === "active" && !planoEhPago) {
        return erro(
          `Combinação inválida: "${planoFinal}" não tem preço, então a assinatura não pode ficar "active". ` +
            `Use o status "trialing" para o plano trial, ou escolha um plano pago.`,
        );
      }
      if (statusFinal === "trialing" && planoEhPago) {
        return erro(
          `Combinação inválida: "${planoFinal}" é um plano pago e não pode ficar com status "trialing". ` +
            `Use "active" para cobrar, "cortesia" para liberar sem cobrar, ou volte o plano para trial.`,
        );
      }
    } else if (!planoEhPago) {
      // Cortesia no plano trial não significa nada: o trial já dá acesso, e a
      // linha ficaria num limbo que nem cobra nem tem prazo.
      return erro(
        `Cortesia é para liberar um plano PAGO sem cobrança. ` +
          `O plano "${planoFinal}" não tem preço — escolha start, plus ou premium.`,
      );
    }

    const depois = await db.subscription.update({
      where: { id: antes.id },
      data: dados,
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
    });

    // Só os campos que realmente mudaram entram no de/para — logar os quatro
    // sempre transformaria o histórico em ruído onde nada mudou.
    const de: Record<string, unknown> = {};
    const para: Record<string, unknown> = {};
    if (dados.plan !== undefined) {
      de.plano = antes.plan;
      para.plano = depois.plan;
      // accountsLimit muda junto e sem pedir; fica registrado para o "por que
      // esse cliente ficou com 3 contas?" ter resposta no log.
      de.accountsLimit = antes.accountsLimit;
      para.accountsLimit = depois.accountsLimit;
    }
    if (dados.status !== undefined) {
      de.status = antes.status;
      para.status = depois.status;
    }
    if (dados.trialEndsAt !== undefined) {
      de.trialEndsAt = antes.trialEndsAt;
      para.trialEndsAt = depois.trialEndsAt;
    }
    if (dados.currentPeriodEnd !== undefined) {
      de.currentPeriodEnd = antes.currentPeriodEnd;
      para.currentPeriodEnd = depois.currentPeriodEnd;
    }

    // Fire-and-forget: ver decisão 3 no topo do arquivo. targetId é o id da
    // ASSINATURA (o mesmo que a rota recebe), e o email vai no details para o
    // log ser legível sem JOIN com User depois.
    void logAdminAction(
      "assinatura_alterada",
      antes.id,
      { userId: antes.userId, email: antes.user.email, de, para },
      ip
    );

    return NextResponse.json(montarResposta(depois), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: any) {
    console.error("[admin/subscriptions/PATCH] Erro:", err?.message ?? err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
