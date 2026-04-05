import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.onboardingCompleted) redirect("/dashboard");
  return <>{children}</>;
}
