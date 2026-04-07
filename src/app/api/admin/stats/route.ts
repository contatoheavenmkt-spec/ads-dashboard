import { NextRequest, NextResponse } from "next/server";
import { validateAdminRequest } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";

export async function GET(req: NextRequest) {
  if (!validateAdminRequest(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const [
    totalUsers,
    totalAgencies,
    activeSubscriptions,
    trialingSubscriptions,
    expiredSubscriptions,
    recentUsers,
    subscriptionsByPlan,
    totalWorkspaces,
    totalIntegrations,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { role: "AGENCY" } }),
    db.subscription.count({ where: { status: "active" } }),
    db.subscription.count({ where: { status: "trialing" } }),
    db.subscription.count({ where: { OR: [{ status: "expired" }, { status: "canceled" }] } }),
    db.user.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, email: true, name: true, role: true, createdAt: true,
        subscription: { select: { plan: true, status: true } },
      },
    }),
    db.subscription.groupBy({ by: ["plan"], _count: { plan: true } }),
    db.workspace.count(),
    db.integration.count(),
  ]);

  // MRR estimado
  const activeByPlan = await db.subscription.findMany({
    where: { status: "active" },
    select: { plan: true },
  });
  const mrr = activeByPlan.reduce((sum, s) => sum + (PLANS[s.plan]?.price ?? 0), 0);

  // Trials expirando nos próximos 3 dias
  const trialExpiringSoon = await db.subscription.findMany({
    where: {
      status: "trialing",
      trialEndsAt: { lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) },
    },
    include: { user: { select: { email: true, name: true } } },
    orderBy: { trialEndsAt: "asc" },
    take: 10,
  });

  // Crescimento de cadastros (últimos 30 dias por dia)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentRegistrations = await db.user.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // Agrupa por data
  const growthMap: Record<string, number> = {};
  for (const u of recentRegistrations) {
    const d = u.createdAt.toISOString().slice(0, 10);
    growthMap[d] = (growthMap[d] ?? 0) + 1;
  }
  const growth = Object.entries(growthMap).map(([date, count]) => ({ date, count }));

  return NextResponse.json({
    totalUsers,
    totalAgencies,
    activeSubscriptions,
    trialingSubscriptions,
    expiredSubscriptions,
    mrr,
    totalWorkspaces,
    totalIntegrations,
    recentUsers,
    subscriptionsByPlan,
    trialExpiringSoon,
    growth,
  });
}
