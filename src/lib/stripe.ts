import Stripe from "stripe";
import { PLANS, type PlanKey } from "@/lib/subscription";

// ─── Client (server-side only) ────────────────────────────────────

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// ─── Price IDs (configure in .env) ───────────────────────────────
// STRIPE_PRICE_START=price_xxx
// STRIPE_PRICE_PLUS=price_xxx
// STRIPE_PRICE_PREMIUM=price_xxx

export const STRIPE_PRICE_IDS: Record<string, string> = {
  start: process.env.STRIPE_PRICE_START ?? "",
  plus: process.env.STRIPE_PRICE_PLUS ?? "",
  premium: process.env.STRIPE_PRICE_PREMIUM ?? "",
};

// ─── Helpers ──────────────────────────────────────────────────────

/** Create a Stripe customer for a new user. */
export async function createStripeCustomer(
  userId: string,
  email: string,
  name?: string | null
): Promise<string> {
  const customer = await stripe.customers.create({
    email,
    name: name ?? undefined,
    metadata: { userId },
  });
  return customer.id;
}

/** Map a Stripe price ID back to a plan key. */
export function planFromPriceId(priceId: string): PlanKey | null {
  for (const [plan, id] of Object.entries(STRIPE_PRICE_IDS)) {
    if (id === priceId) return plan as PlanKey;
  }
  return null;
}

/** Calculate period end from a Stripe subscription (Unix timestamp → Date). */
export function periodEndFromStripe(unixTs: number): Date {
  return new Date(unixTs * 1000);
}
