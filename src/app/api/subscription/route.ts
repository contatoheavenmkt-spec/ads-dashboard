import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getAndSyncSubscription,
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

  const sub = await getAndSyncSubscription(session.user.id);
  if (!sub) {
    return NextResponse.json({ error: "Assinatura não encontrada" }, { status: 404 });
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
