import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { handlePaymentSuccess, type PlanKey, PLANS } from "@/lib/subscription";
import { db } from "@/lib/db";

function safeEqual(a: string | null | undefined, b: string): boolean {
  if (!a) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * AbacatePay webhook — called when a payment is confirmed.
 *
 * Set ABACATEPAY_WEBHOOK_SECRET in .env to verify requests.
 * Em produção, o secret é obrigatório (sem ele, requisições são recusadas).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.ABACATEPAY_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[webhook/abacatepay] ABACATEPAY_WEBHOOK_SECRET não configurado em produção — recusando");
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
    }
    console.warn("[webhook/abacatepay] secret ausente em dev — aceitando sem verificação");
  } else {
    const signature = req.headers.get("x-webhook-secret") ?? req.headers.get("authorization");
    if (!safeEqual(signature, secret) && !safeEqual(signature, `Bearer ${secret}`)) {
      console.warn("[webhook/abacatepay] Invalid secret");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = body?.event as string;
  const billing = body?.data?.billing ?? body?.billing ?? body;

  console.log(`[webhook/abacatepay] event=${event}`, billing?.id);

  if (event !== "BILLING_PAID" && body?.status !== "PAID") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const userId: string | undefined =
    billing?.metadata?.userId ??
    billing?.customer?.metadata?.userId;

  const plan: string | undefined =
    billing?.metadata?.plan ??
    billing?.customer?.metadata?.plan;

  if (!userId || !plan) {
    console.error("[webhook/abacatepay] Missing userId or plan in metadata", billing?.metadata);
    return NextResponse.json({ error: "Missing userId or plan in metadata" }, { status: 400 });
  }

  const validPlan = plan as PlanKey;
  if (!PLANS[validPlan]) {
    console.error("[webhook/abacatepay] Invalid plan:", plan);
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    console.error("[webhook/abacatepay] User not found:", userId);
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Idempotência: se já temos subscription ativa com esse billing.id externo, ignora.
  const billingId = billing?.id as string | undefined;
  if (billingId) {
    const existing = await db.subscription.findFirst({
      where: { stripeSubscriptionId: billingId },
    });
    if (existing && existing.status === "active") {
      console.log(`[webhook/abacatepay] ⏩ Ignorado (já processado): billingId=${billingId}`);
      return NextResponse.json({ ok: true, idempotent: true });
    }
  }

  try {
    const sub = await handlePaymentSuccess(userId, validPlan);
    console.log(`[webhook/abacatepay] Plan activated: userId=${userId} plan=${plan} periodEnd=${sub.currentPeriodEnd}`);
    return NextResponse.json({ ok: true, plan: sub.plan, status: sub.status });
  } catch (err: any) {
    console.error("[webhook/abacatepay] Error:", err.message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
