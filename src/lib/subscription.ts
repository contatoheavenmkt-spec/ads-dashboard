import { db } from "@/lib/db";
import { PLANS, type PlanKey } from "@/lib/plans";
export { PLANS, type PlanKey } from "@/lib/plans";

export interface SubscriptionData {
  id: string;
  userId: string;
  plan: string;
  status: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  accountsLimit: number;
  stripeSubscriptionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Core helpers ─────────────────────────────────────────────────

export function isTrialActive(sub: SubscriptionData): boolean {
  if (sub.status !== "trialing") return false;
  if (!sub.trialEndsAt) return false;
  return new Date() < sub.trialEndsAt;
}

export function isPlanActive(sub: SubscriptionData): boolean {
  if (sub.status === "trialing") return isTrialActive(sub);
  if (sub.status === "active") {
    if (!sub.currentPeriodEnd) return true; // no expiry set
    return new Date() < sub.currentPeriodEnd;
  }
  return false;
}

export function hasReachedAccountsLimit(
  sub: SubscriptionData,
  connectedCount: number
): boolean {
  return connectedCount >= sub.accountsLimit;
}

export function trialDaysRemaining(sub: SubscriptionData): number {
  if (!sub.trialEndsAt) return 0;
  const ms = sub.trialEndsAt.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

// ─── DB operations ────────────────────────────────────────────────

export async function createTrialSubscription(userId: string): Promise<SubscriptionData> {
  const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  // Trial começa com acesso premium completo (30 contas, todas as plataformas)
  return db.subscription.create({
    data: {
      userId,
      plan: "trial",
      status: "trialing",
      trialEndsAt,
      accountsLimit: 30,
    },
  });
}

export async function getCurrentSubscription(userId: string): Promise<SubscriptionData | null> {
  return db.subscription.findUnique({ where: { userId } });
}

/**
 * Gets the subscription and auto-expires the trial if it ended.
 * Always call this instead of `getCurrentSubscription` in request handlers.
 */
export async function getAndSyncSubscription(userId: string): Promise<SubscriptionData | null> {
  let sub = await db.subscription.findUnique({ where: { userId } });
  if (!sub) return null;

  // Auto-expire trial
  if (sub.status === "trialing" && sub.trialEndsAt && new Date() >= sub.trialEndsAt) {
    sub = await db.subscription.update({
      where: { userId },
      data: { status: "expired" },
    });
  }

  // Auto-expire paid period
  if (sub.status === "active" && sub.currentPeriodEnd && new Date() >= sub.currentPeriodEnd) {
    sub = await db.subscription.update({
      where: { userId },
      data: { status: "expired" },
    });
  }

  return sub;
}

/**
 * Upgrades a user to a paid plan. Called after payment confirmation.
 */
export async function updateSubscriptionPlan(
  userId: string,
  plan: PlanKey
): Promise<SubscriptionData> {
  const planDef = PLANS[plan];
  const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  return db.subscription.upsert({
    where: { userId },
    update: {
      plan,
      status: "active",
      currentPeriodEnd,
      accountsLimit: planDef.accountsLimit,
    },
    create: {
      userId,
      plan,
      status: "active",
      currentPeriodEnd,
      accountsLimit: planDef.accountsLimit,
    },
  });
}

/**
 * Handles confirmed payment from AbacatePay (or any gateway).
 * Activates plan and resets billing period.
 */
export async function handlePaymentSuccess(
  userId: string,
  plan: PlanKey
): Promise<SubscriptionData> {
  return updateSubscriptionPlan(userId, plan);
}

/**
 * Counts connected accounts for a user's workspace.
 */
export async function countConnectedAccounts(userId: string): Promise<number> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { workspaceId: true },
  });
  if (!user?.workspaceId) return 0;

  return db.workspaceIntegration.count({
    where: { workspaceId: user.workspaceId },
  });
}

/**
 * Validates that a user can connect a new platform type.
 * Only relevant for plans with maxPlatforms restriction (Start = 1 platform).
 * Returns null if allowed, or an error message if blocked.
 */
export async function validatePlatformLimit(userId: string, newPlatform: string): Promise<string | null> {
  let sub = await getAndSyncSubscription(userId);
  if (!sub) {
    sub = await createTrialSubscription(userId);
  }

  const plan = PLANS[sub.plan as PlanKey];
  if (!plan || plan.maxPlatforms === null) return null; // plano sem restrição de plataformas

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { workspaceId: true },
  });
  if (!user?.workspaceId) return null;

  const integrations = await db.workspaceIntegration.findMany({
    where: { workspaceId: user.workspaceId },
    include: { integration: { select: { platform: true } } },
  });

  const existingPlatforms = [...new Set(integrations.map((wi) => wi.integration.platform))];

  // Já está usando essa plataforma — pode adicionar mais contas dela
  if (existingPlatforms.includes(newPlatform)) return null;

  // Vai ultrapassar o limite de plataformas
  if (existingPlatforms.length >= plan.maxPlatforms) {
    const current = existingPlatforms[0]?.toUpperCase() ?? "a plataforma atual";
    return `Plano Start permite apenas 1 plataforma. Você já usa ${current}. Faça upgrade para o Plus para conectar Meta, Google e GA4 simultaneamente.`;
  }

  return null;
}

/**
 * Validates that a user can connect another account.
 * Returns null if allowed, or an error message if blocked.
 */
export async function validateAccountLimit(userId: string): Promise<string | null> {
  let sub = await getAndSyncSubscription(userId);
  if (!sub) {
    // Auto-create trial for users registered before subscription system was added
    sub = await createTrialSubscription(userId);
  }

  if (!isPlanActive(sub)) {
    return "Seu plano expirou. Assine um plano para continuar conectando contas.";
  }

  const count = await countConnectedAccounts(userId);
  if (hasReachedAccountsLimit(sub, count)) {
    const plan = PLANS[sub.plan as PlanKey];
    const planName = plan?.name ?? sub.plan;
    return `Limite de contas atingido (${sub.accountsLimit}). Faça upgrade do plano ${planName} para conectar mais contas.`;
  }

  return null;
}
