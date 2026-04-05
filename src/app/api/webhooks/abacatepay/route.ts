import { NextRequest, NextResponse } from "next/server";
import { handlePaymentSuccess, type PlanKey, PLANS } from "@/lib/subscription";
import { db } from "@/lib/db";

/**
 * AbacatePay webhook — called when a payment is confirmed.
 *
 * Expected body (adapt to AbacatePay's actual payload):
 * {
 *   event: "BILLING_PAID" | "BILLING_EXPIRED" | "BILLING_CANCELED",
 *   data: {
 *     billing: {
 *       id: string,           // AbacatePay billing ID
 *       status: string,
 *       customer: {
 *         taxId: string       // CPF/CNPJ
 *       },
 *       metadata: {
 *         userId: string,     // your internal userId
 *         plan: string        // "start" | "plus" | "premium"
 *       }
 *     }
 *   }
 * }
 *
 * Set ABACATEPAY_WEBHOOK_SECRET in .env to verify requests.
 */
export async function POST(req: NextRequest) {
  // Verify webhook secret
  const secret = process.env.ABACATEPAY_WEBHOOK_SECRET;
  if (secret) {
    const signature = req.headers.get("x-webhook-secret") ?? req.headers.get("authorization");
    if (signature !== secret && signature !== `Bearer ${secret}`) {
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

  // Only handle paid events
  if (event !== "BILLING_PAID" && body?.status !== "PAID") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Extract userId and plan from metadata
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

  // Verify user exists
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    console.error("[webhook/abacatepay] User not found:", userId);
    return NextResponse.json({ error: "User not found" }, { status: 404 });
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
