import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { formatCurrency } from "@/lib/utils";
import {
  Users, CreditCard, TrendingUp, AlertTriangle,
  Activity, Layers, DollarSign, UserCheck,
} from "lucide-react";

function StatCard({
  title, value, sub, icon: Icon, color,
}: {
  title: string; value: string; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{title}</p>
        <p className="text-2xl font-black text-white leading-none">{value}</p>
        {sub && <p className="text-[10px] text-slate-500 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${color}`}>
      {text}
    </span>
  );
}

function planBadge(plan: string) {
  const map: Record<string, string> = {
    trial: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    start: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    plus: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    premium: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  };
  return map[plan] ?? "text-slate-400 bg-slate-700 border-slate-600";
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    trialing: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    expired: "text-red-400 bg-red-500/10 border-red-500/20",
    canceled: "text-slate-400 bg-slate-700 border-slate-600",
  };
  return map[status] ?? "text-slate-400 bg-slate-700 border-slate-600";
}

export default async function AdminDashboard() {
  const [
    totalUsers, totalAgencies,
    activeCount, trialingCount, expiredCount,
    recentUsers, subscriptionsByPlan,
    totalWorkspaces, totalIntegrations,
    trialExpiringSoon,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { role: "AGENCY" } }),
    db.subscription.count({ where: { status: "active" } }),
    db.subscription.count({ where: { status: "trialing" } }),
    db.subscription.count({ where: { OR: [{ status: "expired" }, { status: "canceled" }] } }),
    db.user.findMany({
      take: 10, orderBy: { createdAt: "desc" },
      select: { id: true, email: true, name: true, createdAt: true, subscription: { select: { plan: true, status: true } } },
    }),
    db.subscription.groupBy({ by: ["plan"], _count: { plan: true } }),
    db.workspace.count(),
    db.integration.count(),
    db.subscription.findMany({
      where: { status: "trialing", trialEndsAt: { lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) } },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { trialEndsAt: "asc" }, take: 8,
    }),
  ]);

  const activeByPlan = await db.subscription.findMany({ where: { status: "active" }, select: { plan: true } });
  const mrr = activeByPlan.reduce((sum, s) => sum + (PLANS[s.plan]?.price ?? 0), 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-black text-white">Dashboard Admin</h1>
        <p className="text-sm text-slate-500 mt-0.5">Visão geral do SaaS Dashfy</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total de Usuários" value={String(totalUsers)} sub={`${totalAgencies} agências`} icon={Users} color="bg-blue-500/10 text-blue-400 border border-blue-500/20" />
        <StatCard title="Assinantes Ativos" value={String(activeCount)} icon={UserCheck} color="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" />
        <StatCard title="Em Trial" value={String(trialingCount)} icon={Activity} color="bg-amber-500/10 text-amber-400 border border-amber-500/20" />
        <StatCard title="MRR Estimado" value={formatCurrency(mrr)} sub="Receita mensal recorrente" icon={DollarSign} color="bg-purple-500/10 text-purple-400 border border-purple-500/20" />
        <StatCard title="Expirados / Cancelados" value={String(expiredCount)} icon={AlertTriangle} color="bg-red-500/10 text-red-400 border border-red-500/20" />
        <StatCard title="Workspaces" value={String(totalWorkspaces)} icon={Layers} color="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" />
        <StatCard title="Integrações" value={String(totalIntegrations)} sub="contas de anúncios" icon={TrendingUp} color="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" />
        <StatCard title="Planos Ativos" value={`${activeCount + trialingCount}`} sub="ativos + trial" icon={CreditCard} color="bg-slate-800 text-slate-300 border border-slate-700" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Distribuição por plano */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Distribuição por Plano</h2>
          <div className="space-y-3">
            {subscriptionsByPlan.map((s) => (
              <div key={s.plan} className="flex items-center justify-between">
                <Badge text={s.plan} color={planBadge(s.plan)} />
                <div className="flex items-center gap-3">
                  <div className="h-1.5 bg-slate-800 rounded-full w-24 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${Math.min((s._count.plan / Math.max(totalUsers, 1)) * 100 * 3, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-white w-6 text-right">{s._count.plan}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Trials expirando */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 lg:col-span-2">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <AlertTriangle size={12} className="text-amber-400" />
            Trials Expirando em 3 Dias
          </h2>
          {trialExpiringSoon.length === 0 ? (
            <p className="text-slate-600 text-xs font-medium py-4 text-center">Nenhum trial expirando em breve</p>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {trialExpiringSoon.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{s.user.name ?? s.user.email}</p>
                    <p className="text-[10px] text-slate-500 truncate">{s.user.email}</p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-[10px] font-bold text-amber-400">
                      {s.trialEndsAt
                        ? new Date(s.trialEndsAt).toLocaleDateString("pt-BR")
                        : "—"}
                    </p>
                    <a href={`/admin/accounts/${s.userId}`} className="text-[9px] text-blue-400 hover:text-blue-300 uppercase tracking-wide">
                      Ver conta →
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Últimos usuários cadastrados */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800/60">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Últimos Cadastros</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-800/40">
            <tr>
              {["Usuário", "Plano", "Status", "Cadastro"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {recentUsers.map((u) => (
              <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-5 py-3">
                  <a href={`/admin/accounts/${u.id}`} className="hover:text-blue-400 transition-colors">
                    <p className="font-medium text-white">{u.name ?? "—"}</p>
                    <p className="text-[10px] text-slate-500">{u.email}</p>
                  </a>
                </td>
                <td className="px-5 py-3">
                  <Badge text={u.subscription?.plan ?? "sem plano"} color={planBadge(u.subscription?.plan ?? "")} />
                </td>
                <td className="px-5 py-3">
                  <Badge text={u.subscription?.status ?? "—"} color={statusBadge(u.subscription?.status ?? "")} />
                </td>
                <td className="px-5 py-3 text-[11px] text-slate-400">
                  {new Date(u.createdAt).toLocaleDateString("pt-BR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
