import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getAndSyncSubscription,
  createTrialSubscription,
  countConnectedAccounts,
  trialDaysRemaining,
  isPlanActive,
  PLANS,
  type PlanKey,
} from "@/lib/subscription";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let sub = await getAndSyncSubscription(session.user.id);
  if (!sub) {
    sub = await createTrialSubscription(session.user.id);
  }

  const connectedCount = await countConnectedAccounts(session.user.id);
  const plan = PLANS[sub.plan as PlanKey];

  return NextResponse.json({
    id: sub.id,
    plan: sub.plan,
    planName: plan?.name ?? sub.plan,
    status: sub.status,
    trialEndsAt: sub.trialEndsAt,
    currentPeriodEnd: sub.currentPeriodEnd,
    accountsLimit: sub.accountsLimit,
    connectedCount,
    daysRemaining: sub.status === "trialing" ? trialDaysRemaining(sub) : null,
    isActive: isPlanActive(sub),
    stripeSubscriptionId: sub.stripeSubscriptionId,
    plans: PLANS,
  });
}
