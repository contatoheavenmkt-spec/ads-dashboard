import { NextRequest, NextResponse } from "next/server";
import { validateAdminRequest, logAdminAction } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdminRequest(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;

  const user = await db.user.findUnique({
    where: { id },
    include: {
      subscription: true,
      metaConnections: { select: { id: true, name: true, fbUserId: true, createdAt: true, expiresAt: true } },
      googleConnections: { select: { id: true, email: true, connectedAt: true, scopes: true } },
      workspace: {
        include: {
          integrations: { include: { integration: true } },
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  const logs = await db.adminLog.findMany({
    where: { targetId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Nunca retornar password hash
  const { password: _pw, ...safeUser } = user;
  return NextResponse.json({ ...safeUser, adminLogs: logs });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdminRequest(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const {
    name, role, onboardingCompleted, forcePasswordChange,
    // Subscription fields
    plan, status, trialEndsAt, currentPeriodEnd,
  } = body;

  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined;

  // Whitelist de valores aceitos — admin é admin, mas é foot-gun aceitar
  // role/plan/status arbitrários (quebra outras rotas que comparam contra enum).
  const ALLOWED_ROLES = ["AGENCY", "CLIENT", "ADMIN"];
  const ALLOWED_PLANS = ["trial", "start", "plus", "premium"];
  const ALLOWED_STATUSES = ["active", "trialing", "expired", "canceled"];

  // Update user fields
  const userUpdate = {
    ...(typeof name === "string" && { name: name.trim().slice(0, 100) }),
    ...(role !== undefined && ALLOWED_ROLES.includes(role) && { role }),
    ...(onboardingCompleted !== undefined && { onboardingCompleted: Boolean(onboardingCompleted) }),
    ...(forcePasswordChange !== undefined && { forcePasswordChange: Boolean(forcePasswordChange) }),
  };

  if (Object.keys(userUpdate).length > 0) {
    await db.user.update({ where: { id }, data: userUpdate });
  }

  // Parse e valida Date (evita Invalid Date salvo no DB se string vier malformada).
  function parseDate(v: unknown): Date | null | undefined {
    if (v === null) return null;
    if (v === undefined) return undefined;
    if (typeof v !== "string" && !(v instanceof Date)) return undefined;
    const d = new Date(v as string | Date);
    if (isNaN(d.getTime())) return undefined; // ignora valor inválido
    return d;
  }

  // Update subscription fields
  if (plan !== undefined || status !== undefined || trialEndsAt !== undefined || currentPeriodEnd !== undefined) {
    // Valida plan/status contra whitelists — evita persistir valor inválido
    // que quebra `PLANS[plan]` em outras rotas que dependem do enum.
    const validPlan = plan !== undefined && ALLOWED_PLANS.includes(plan) ? plan : undefined;
    const validStatus = status !== undefined && ALLOWED_STATUSES.includes(status) ? status : undefined;
    const planDef = validPlan ? PLANS[validPlan] : null;
    const parsedTrial = parseDate(trialEndsAt);
    const parsedPeriod = parseDate(currentPeriodEnd);
    const subUpdate = {
      ...(validPlan !== undefined && { plan: validPlan }),
      ...(validStatus !== undefined && { status: validStatus }),
      ...(parsedTrial !== undefined && { trialEndsAt: parsedTrial }),
      ...(parsedPeriod !== undefined && { currentPeriodEnd: parsedPeriod }),
      ...(planDef && { accountsLimit: planDef.accountsLimit }),
    };

    await db.subscription.upsert({
      where: { userId: id },
      update: subUpdate,
      create: { userId: id, ...subUpdate },
    });
  }

  await logAdminAction("user.update", id, { fields: Object.keys(body) }, ip ?? undefined);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdminRequest(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined;

  const user = await db.user.findUnique({ where: { id }, select: { email: true } });
  if (!user) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  await db.user.delete({ where: { id } });
  await logAdminAction("user.delete", id, { email: user.email }, ip ?? undefined);

  return NextResponse.json({ ok: true });
}
