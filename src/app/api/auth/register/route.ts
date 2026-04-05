import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createTrialSubscription } from "@/lib/subscription";
import { createStripeCustomer } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Preencha todos os campos." }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "A senha deve ter no mínimo 6 caracteres." }, { status: 400 });
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Este email já está em uso." }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await db.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: "AGENCY",
        onboardingCompleted: false,
      },
    });

    // Inicia trial de 7 dias automaticamente
    await createTrialSubscription(user.id);

    // Cria cliente no Stripe (não bloqueia cadastro em caso de falha)
    if (process.env.STRIPE_SECRET_KEY) {
      try {
        const stripeCustomerId = await createStripeCustomer(user.id, email, name);
        await db.user.update({
          where: { id: user.id },
          data: { stripeCustomerId } as any,
        });
      } catch (stripeErr: any) {
        console.error("[register] Stripe customer creation failed:", stripeErr.message);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[register] erro:", message);
    return NextResponse.json({ error: "Erro interno. Tente novamente." }, { status: 500 });
  }
}
