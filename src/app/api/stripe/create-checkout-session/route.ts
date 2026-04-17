import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { stripe, STRIPE_PRICE_IDS, createStripeCustomer } from "@/lib/stripe";
import { PLANS, type PlanKey } from "@/lib/plans";

const VALID_PLANS: PlanKey[] = ["start", "plus", "premium"];
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const { plan } = body as { plan: string };

    if (!plan || !VALID_PLANS.includes(plan as PlanKey)) {
      return NextResponse.json(
        { error: "Plano inválido. Escolha: start, plus ou premium." },
        { status: 400 }
      );
    }

    const priceId = STRIPE_PRICE_IDS[plan];
    if (!priceId) {
      return NextResponse.json(
        { error: `Price ID para o plano "${plan}" não configurado no servidor.` },
        { status: 500 }
      );
    }

    // Busca ou cria Stripe customer
    const user = await db.user.findUnique({
      where: { id: session.user.id },
    });
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    let customerId = user.stripeCustomerId ?? null;
    if (!customerId) {
      console.log("[checkout] Criando Stripe customer para", user.email);
      customerId = await createStripeCustomer(user.id, user.email, user.name);
      await db.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    console.log(`[checkout] Criando sessão: plan=${plan} priceId=${priceId} customer=${customerId}`);

    // Cria checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${APP_URL}/dashboard/billing?success=1&plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/dashboard/billing?canceled=1`,
      metadata: { userId: user.id, plan },
      subscription_data: {
        metadata: { userId: user.id, plan },
      },
    });

    console.log(`[checkout] Sessão criada: ${checkoutSession.id} → ${checkoutSession.url}`);
    return NextResponse.json({ url: checkoutSession.url });

  } catch (err: any) {
    console.error("[checkout] Erro:", err?.message ?? err);
    return NextResponse.json(
      { error: err?.message ?? "Erro interno ao criar sessão de pagamento." },
      { status: 500 }
    );
  }
}
