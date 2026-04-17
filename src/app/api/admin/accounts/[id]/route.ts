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

  // Update user fields
  const userUpdate = {
    ...(name !== undefined && { name }),
    ...(role !== undefined && { role }),
    ...(onboardingCompleted !== undefined && { onboardingCompleted }),
    ...(forcePasswordChange !== undefined && { forcePasswordChange }),
  };

  if (Object.keys(userUpdate).length > 0) {
    await db.user.update({ where: { id }, data: userUpdate });
  }

  // Update subscription fields
  if (plan !== undefined || status !== undefined || trialEndsAt !== undefined || currentPeriodEnd !== undefined) {
    const planDef = plan ? PLANS[plan] : null;
    const subUpdate = {
      ...(plan !== undefined && { plan }),
      ...(status !== undefined && { status }),
      ...(trialEndsAt !== undefined && { trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : null }),
      ...(currentPeriodEnd !== undefined && { currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : null }),
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
