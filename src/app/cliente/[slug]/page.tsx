import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { ClientDashboard } from "@/components/dashboard/client-dashboard";
import { PasswordGate } from "@/components/dashboard/password-gate";

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

  if (workspace.sharePassword) {
    const cookieStore = await cookies();
    const token = cookieStore.get(`ws_${slug}`);
    if (!token || token.value !== workspace.sharePassword) {
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
