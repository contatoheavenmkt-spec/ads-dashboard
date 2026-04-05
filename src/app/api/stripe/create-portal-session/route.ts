import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
  });

  const stripeCustomerId = (user as any)?.stripeCustomerId as string | null ?? null;
  if (!stripeCustomerId) {
    return NextResponse.json(
      { error: "Nenhuma assinatura Stripe encontrada para este usuário." },
      { status: 400 }
    );
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${APP_URL}/dashboard/billing`,
  });

  return NextResponse.json({ url: portalSession.url });
}
