import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { buildCheckoutUrl } from "@/lib/cakto";
import { type PlanKey } from "@/lib/plans";

const VALID_PAID_PLANS: PlanKey[] = ["start", "plus", "premium"];

/**
 * Inicia upgrade para plano pago. NÃO ativa o plano aqui — apenas gera a URL
 * de checkout. A ativação acontece via webhook após confirmação do pagamento.
 *
 * (Antes, este endpoint ativava o plano diretamente, permitindo que qualquer
 * usuário logado ganhasse plano Premium grátis chamando o endpoint.)
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const plan = body?.plan as string | undefined;

  if (!plan || !VALID_PAID_PLANS.includes(plan as PlanKey)) {
    return NextResponse.json(
      { error: "Plano inválido. Escolha: start, plus ou premium." },
      { status: 400 },
    );
  }

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  const url = buildCheckoutUrl(plan, user.id, user.email, user.name);
  return NextResponse.json({ url, plan });
}
