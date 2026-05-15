import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { ClientDashboard } from "@/components/dashboard/client-dashboard";
import { PasswordGate } from "@/components/dashboard/password-gate";
import { shareCookieName, verifyShareToken } from "@/lib/workspace-access";

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

  if (!workspace) notFound();

  // Workspaces não públicos não são acessíveis via /cliente/[slug] — protege
  // contra vazamento se o owner setou publicAccess=false.
  if (!workspace.publicAccess) notFound();

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
    />
  );
}
