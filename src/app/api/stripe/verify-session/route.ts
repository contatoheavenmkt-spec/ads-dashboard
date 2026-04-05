import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { stripe, planFromPriceId, periodEndFromStripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { PLANS, type PlanKey } from "@/lib/subscription";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id obrigatório" }, { status: 400 });
  }

  // Busca a checkout session no Stripe
  const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription", "subscription.items"],
  });

  // Valida que a sessão pertence ao usuário logado
  const user = await db.user.findUnique({
    where: { id: session.user.id },
  });

  const stripeCustomerId = (user as any)?.stripeCustomerId as string | null ?? null;
  if (checkoutSession.customer !== stripeCustomerId) {
    return NextResponse.json({ error: "Sessão não pertence a este usuário" }, { status: 403 });
  }

  if (checkoutSession.payment_status !== "paid") {
    return NextResponse.json({ activated: false, reason: "Pagamento não confirmado" });
  }

  // Extrai plano do metadata
  const plan = checkoutSession.metadata?.plan as PlanKey | undefined;
  if (!plan || !PLANS[plan]) {
    return NextResponse.json({ error: "Plano inválido no metadata" }, { status: 400 });
  }

  const stripeSub = checkoutSession.subscription as any;
  const stripeSubscriptionId = typeof stripeSub === "string" ? stripeSub : stripeSub?.id;

  // Calcula period end (v22 API: current_period_end está em items)
  let periodEnd: Date;
  if (stripeSub && typeof stripeSub === "object" && stripeSub.items?.data?.[0]?.current_period_end) {
    periodEnd = periodEndFromStripe(stripeSub.items.data[0].current_period_end);
  } else {
    periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }

  const planDef = PLANS[plan];

  // Ativa a assinatura no banco
  await db.subscription.upsert({
    where: { userId: session.user.id },
    update: {
      plan,
      status: "active",
      stripeSubscriptionId,
      currentPeriodEnd: periodEnd,
      accountsLimit: planDef.accountsLimit,
    },
    create: {
      userId: session.user.id,
      plan,
      status: "active",
      stripeSubscriptionId,
      currentPeriodEnd: periodEnd,
      accountsLimit: planDef.accountsLimit,
    },
  });

  console.log(`[verify-session] Ativado: userId=${session.user.id} plan=${plan}`);

  return NextResponse.json({ activated: true, plan, planName: planDef.name });
}
