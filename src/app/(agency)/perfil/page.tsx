import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ProfileClient } from "./profile-client";

export default async function PerfilPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user, subscription] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    }),
    db.subscription.findUnique({
      where: { userId: session.user.id },
      select: { plan: true, status: true, trialEndsAt: true, currentPeriodEnd: true, accountsLimit: true },
    }),
  ]);

  if (!user) redirect("/login");

  return (
    <ProfileClient
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      }}
      subscription={
        subscription
          ? {
              plan: subscription.plan,
              status: subscription.status,
              trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
              currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
              accountsLimit: subscription.accountsLimit,
            }
          : null
      }
    />
  );
}
