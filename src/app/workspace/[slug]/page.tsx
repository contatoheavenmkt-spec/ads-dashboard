import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { ClientDashboard } from "@/components/dashboard/client-dashboard";
import { BarChart3, LogOut } from "lucide-react";

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

  // Verifica se o cliente tem acesso a este workspace
  if (session.user.role === "CLIENT" && session.user.workspaceId !== workspace.id) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header do cliente */}
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
              <p className="text-xs text-gray-400">Dashboard de Performance · Meta Ads</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <BarChart3 size={13} />
              <span>AdsPanel</span>
            </div>
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors px-2 py-1 rounded hover:bg-gray-100"
              >
                <LogOut size={13} />
                Sair
              </button>
            </form>
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

      <footer className="text-center py-6 text-xs text-gray-400 border-t border-gray-100">
        Dashboard gerado por <strong>AdsPanel</strong>
      </footer>
    </div>
  );
}
