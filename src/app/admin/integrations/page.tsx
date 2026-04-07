import { db } from "@/lib/db";
import { Link2 } from "lucide-react";

export default async function IntegrationsAdminPage() {
  const integrations = await db.integration.findMany({
    include: {
      _count: { select: { workspaceIntegrations: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const byPlatform = {
    meta: integrations.filter((i) => i.platform === "meta"),
    google: integrations.filter((i) => i.platform === "google"),
    ga4: integrations.filter((i) => i.platform === "ga4"),
  };

  const platformLabels: Record<string, { label: string; color: string }> = {
    meta: { label: "Meta Ads", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
    google: { label: "Google Ads", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
    ga4: { label: "GA4", color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-black text-white flex items-center gap-2">
          <Link2 size={20} className="text-cyan-400" />
          Integrações
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">{integrations.length} contas de anúncios cadastradas</p>
      </div>

      {/* Cards por plataforma */}
      <div className="grid grid-cols-3 gap-4">
        {Object.entries(byPlatform).map(([key, list]) => {
          const pl = platformLabels[key] ?? { label: key, color: "text-slate-400 bg-slate-800 border-slate-700" };
          return (
            <div key={key} className={`bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5`}>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${pl.color}`}>{pl.label}</span>
              <p className="text-3xl font-black text-white mt-3">{list.length}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">contas cadastradas</p>
            </div>
          );
        })}
      </div>

      {/* Tabela */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="bg-slate-800/50 border-b border-slate-700/50">
            <tr>
              {["Nome da Conta", "Plataforma", "Ad Account ID", "BM / Gerenciador", "Workspaces", "Status"].map((h) => (
                <th key={h} className="px-5 py-3.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {integrations.map((int) => {
              const pl = platformLabels[int.platform] ?? { label: int.platform, color: "text-slate-400 bg-slate-800 border-slate-700" };
              return (
                <tr key={int.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-white">{int.name}</td>
                  <td className="px-5 py-3.5">
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${pl.color}`}>{pl.label}</span>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-[11px] text-slate-400">{int.adAccountId}</td>
                  <td className="px-5 py-3.5 text-[11px] text-slate-500">{int.bmName ?? int.bmId ?? "—"}</td>
                  <td className="px-5 py-3.5 text-[11px] text-slate-300">{int._count.workspaceIntegrations}</td>
                  <td className="px-5 py-3.5">
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${int.status === "active" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-slate-400 bg-slate-800 border-slate-700"}`}>
                      {int.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
