import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createTrialSubscription } from "@/lib/subscription";
import { PLANS, type PlanKey } from "@/lib/plans";
import { normalizeEmail } from "@/lib/email";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    // Rate limit por IP: 5 registros / 10 min. Antes a rota era exposta —
    // bot podia spammar bcrypts (caros em CPU) e criar dezenas de milhares
    // de trials. Bloqueia ataques de inflação de DB.
    const ip = getClientIp(req.headers);
    const rl = rateLimit(`register:${ip}`, 5, 10 * 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Muitas tentativas. Tente novamente em ${rl.retryAfter}s.` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : "";
    const email = normalizeEmail(body?.email);
    const password = typeof body?.password === "string" ? body.password : "";

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Preencha todos os campos." }, { status: 400 });
    }

    if (password.length < 6 || password.length > 200) {
      return NextResponse.json({ error: "A senha deve ter entre 6 e 200 caracteres." }, { status: 400 });
    }

    if (email.length > 200) {
      return NextResponse.json({ error: "Email inválido." }, { status: 400 });
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

    // Verifica se há compra pendente para este email (webhook chegou antes do cadastro).
    // Email já normalizado (lowercase), bate com o que o webhook salvou.
    const pending = await db.pendingSubscription.findUnique({ where: { email } });
    if (pending) {
      const planDef = PLANS[pending.plan as PlanKey];
      await db.subscription.create({
        data: {
          userId: user.id,
          plan: pending.plan,
          status: "active",
          stripeSubscriptionId: pending.orderId,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          accountsLimit: planDef?.accountsLimit ?? 3,
        },
      });
      await db.pendingSubscription.delete({ where: { email } });
      console.log(`[register] Plano ${pending.plan} ativado via compra pendente para ${email}`);
    } else {
      await createTrialSubscription(user.id);
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[register] erro:", message);
    return NextResponse.json({ error: "Erro interno. Tente novamente." }, { status: 500 });
  }
}
