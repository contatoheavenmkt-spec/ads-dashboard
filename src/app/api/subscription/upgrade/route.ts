import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { updateSubscriptionPlan, PLANS, type PlanKey } from "@/lib/subscription";

const VALID_PAID_PLANS: PlanKey[] = ["start", "plus", "premium"];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const { plan } = body as { plan: string };

  if (!plan || !VALID_PAID_PLANS.includes(plan as PlanKey)) {
    return NextResponse.json(
      { error: "Plano inválido. Escolha: start, plus ou premium." },
      { status: 400 }
    );
  }

  const sub = await updateSubscriptionPlan(session.user.id, plan as PlanKey);
  const planDef = PLANS[plan as PlanKey];

  return NextResponse.json({
    ok: true,
    plan: sub.plan,
    planName: planDef.name,
    status: sub.status,
    accountsLimit: sub.accountsLimit,
    currentPeriodEnd: sub.currentPeriodEnd,
  });
}
