import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { ClientDashboard } from "@/components/dashboard/client-dashboard";
import { PasswordGate } from "@/components/dashboard/password-gate";
import { PrivateWorkspaceGate } from "@/components/dashboard/private-workspace-gate";
import { shareCookieName, verifyShareToken } from "@/lib/workspace-access";
import { parseVisibleMetrics } from "@/lib/visible-metrics";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function PublicClientPage({ params }: Props) {
  const { slug } = await params;

  const workspace = await db.workspace.findUnique({
    where: { slug },
    include: {
      integrations: { include: { integration: true } },
    },
  });

  // Workspace deletado se comporta como inexistente.
  if (!workspace || workspace.deletedAt) notFound();

  // Workspace existe mas o owner não habilitou "Acesso público" — em vez de
  // soltar 404 cru (UX confuso pra cliente final que recebeu o link),
  // mostra página branded explicando que precisa fazer login.
  if (!workspace.publicAccess) {
    return <PrivateWorkspaceGate slug={slug} workspaceName={workspace.name} />;
  }

  if (workspace.sharePassword) {
    const cookieStore = await cookies();
    const token = cookieStore.get(shareCookieName(slug))?.value ?? null;
    if (!token || !verifyShareToken(slug, workspace.sharePassword, token)) {
      return <PasswordGate slug={slug} workspaceName={workspace.name} />;
    }
  }

  const platforms = [...new Set(workspace.integrations.map(i => i.integration.platform))];

  return (
    <ClientDashboard
      workspaceId={workspace.id}
      workspaceName={workspace.name}
      logo={workspace.logo}
      platforms={platforms}
      showLogout={false}
      slug={slug}
      visibleMetrics={parseVisibleMetrics(workspace.visibleMetrics)}
      showCrm={workspace.showCrm}
    />
  );
}
