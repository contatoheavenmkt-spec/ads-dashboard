import { NextRequest, NextResponse } from "next/server";
import { stripe, planFromPriceId, periodEndFromStripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { PLANS, type PlanKey } from "@/lib/subscription";

// Disable body parsing — Stripe needs the raw body to verify signatures
export const dynamic = "force-dynamic";

async function getUserIdFromCustomer(customerId: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return user?.id ?? null;
}

async function activateSubscription(
  userId: string,
  plan: PlanKey,
  stripeSubscriptionId: string,
  currentPeriodEnd: Date
) {
  const planDef = PLANS[plan];
  await db.subscription.upsert({
    where: { userId },
    update: {
      plan,
      status: "active",
      stripeSubscriptionId,
      currentPeriodEnd,
      accountsLimit: planDef.accountsLimit,
    },
    create: {
      userId,
      plan,
      status: "active",
      stripeSubscriptionId,
      currentPeriodEnd,
      accountsLimit: planDef.accountsLimit,
    },
  });
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  // Read raw body for signature verification
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: ReturnType<typeof stripe.webhooks.constructEvent>;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.error("[stripe/webhook] Signature verification failed:", err.message);
    return NextResponse.json({ error: `Webhook verification failed: ${err.message}` }, { status: 400 });
  }

  console.log(`[stripe/webhook] event=${event.type}`);

  try {
    switch (event.type) {
      // ── Checkout completed (first payment) ────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as any;
        if (session.mode !== "subscription") break;

        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const plan = (session.metadata?.plan ?? session.subscription_data?.metadata?.plan) as PlanKey | undefined;

        if (!customerId || !subscriptionId || !plan) {
          console.error("[stripe/webhook] checkout.session.completed: missing data", session.metadata);
          break;
        }

        const userId = await getUserIdFromCustomer(customerId);
        if (!userId) {
          console.error("[stripe/webhook] User not found for customer:", customerId);
          break;
        }

        // Fetch subscription to get period end (v22: current_period_end is on items, not subscription root)
        const stripeSub = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["items"],
        });
        const periodEnd = periodEndFromStripe(
          stripeSub.items.data[0]?.current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 24 * 3600
        );

        await activateSubscription(userId, plan, subscriptionId, periodEnd);
        console.log(`[stripe/webhook] Activated: userId=${userId} plan=${plan}`);
        break;
      }

      // ── Renewal payment succeeded ──────────────────────────────
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as any;
        const subscriptionId = invoice.subscription as string;
        if (!subscriptionId) break;

        // Find subscription in our DB
        const sub = await db.subscription.findFirst({
          where: { stripeSubscriptionId: subscriptionId },
        });
        if (!sub) {
          console.warn("[stripe/webhook] Subscription not found for stripe sub:", subscriptionId);
          break;
        }

        // Fetch latest period end from Stripe (v22: current_period_end is on items, not subscription root)
        const stripeSub = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["items"],
        });
        const periodEnd = periodEndFromStripe(
          stripeSub.items.data[0]?.current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 24 * 3600
        );

        await db.subscription.update({
          where: { id: sub.id },
          data: {
            status: "active",
            currentPeriodEnd: periodEnd,
          },
        });
        console.log(`[stripe/webhook] Renewed: userId=${sub.userId} until=${periodEnd.toISOString()}`);
        break;
      }

      // ── Payment failed ─────────────────────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as any;
        const subscriptionId = invoice.subscription as string;
        if (!subscriptionId) break;

        const sub = await db.subscription.findFirst({
          where: { stripeSubscriptionId: subscriptionId },
        });
        if (!sub) break;

        // Mark as expired — Stripe will retry automatically;
        // if retries succeed, invoice.payment_succeeded will reactivate it
        await db.subscription.update({
          where: { id: sub.id },
          data: { status: "expired" },
        });
        console.warn(`[stripe/webhook] Payment failed: userId=${sub.userId}`);
        break;
      }

      // ── Subscription canceled / deleted ───────────────────────
      case "customer.subscription.deleted": {
        const stripeSub = event.data.object as any;
        const sub = await db.subscription.findFirst({
          where: { stripeSubscriptionId: stripeSub.id },
        });
        if (!sub) break;

        await db.subscription.update({
          where: { id: sub.id },
          data: {
            status: "canceled",
            stripeSubscriptionId: null,
          },
        });
        console.log(`[stripe/webhook] Canceled: userId=${sub.userId}`);
        break;
      }

      default:
        // Ignore unhandled events
        break;
    }
  } catch (err: any) {
    console.error("[stripe/webhook] Handler error:", err.message);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
