import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { ClientDashboard } from "@/components/dashboard/client-dashboard";
import { PasswordGate } from "@/components/dashboard/password-gate";
import { BarChart3 } from "lucide-react";

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

  // Check password protection
  if (workspace.sharePassword) {
    const cookieStore = await cookies();
    const token = cookieStore.get(`ws_${slug}`);
    if (!token || token.value !== workspace.sharePassword) {
      return <PasswordGate slug={slug} workspaceName={workspace.name} />;
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header limpo para cliente */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {workspace.logo ? (
              <img
                src={workspace.logo}
                alt={workspace.name}
                className="w-9 h-9 rounded-xl object-cover"
              />
            ) : (
              <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-sm">
                {workspace.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{workspace.name}</h1>
              <p className="text-xs text-gray-400">Relatório de Performance · Meta Ads</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <BarChart3 size={14} />
            <span>AdsPanel</span>
          </div>
        </div>
      </header>

      {/* Dashboard */}
      <main className="p-6 max-w-7xl mx-auto">
        <ClientDashboard
          workspaceId={workspace.id}
          workspaceName={workspace.name}
          logo={workspace.logo}
        />
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-gray-400 border-t border-gray-100">
        Dashboard gerado por <strong>AdsPanel</strong>
      </footer>
    </div>
  );
}
