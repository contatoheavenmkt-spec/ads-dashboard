import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { ClientDashboard } from "@/components/dashboard/client-dashboard";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ClientWorkspacePage({ params }: Props) {
  const { slug } = await params;

  const session = await auth();
  if (!session) redirect("/login");

  const workspace = await db.workspace.findUnique({
    where: { slug },
    include: { integrations: { include: { integration: true } } },
  });

  if (!workspace) notFound();

  if (session.user.role === "CLIENT" && session.user.workspaceId !== workspace.id) {
    redirect("/login");
  }

  const platforms = [...new Set(workspace.integrations.map(i => i.integration.platform))];

  return (
    <ClientDashboard
      workspaceId={workspace.id}
      workspaceName={workspace.name}
      logo={workspace.logo}
      platforms={platforms}
      showLogout={true}
      slug={slug}
    />
  );
}
