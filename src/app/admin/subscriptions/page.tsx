import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { PLANS } from "@/lib/plans";
import { CreditCard } from "lucide-react";

const PLAN_COLORS: Record<string, string> = {
  trial: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  start: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  plus: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  premium: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
};
const STATUS_COLORS: Record<string, string> = {
  active: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  trialing: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  expired: "text-red-400 bg-red-500/10 border-red-500/20",
  canceled: "text-slate-400 bg-slate-700/50 border-slate-600/50",
};

function Badge({ text, color }: { text: string; color: string }) {
  return <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${color}`}>{text}</span>;
}

export default async function SubscriptionsPage() {
  const subscriptions = await db.subscription.findMany({
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { updatedAt: "desc" },
  });

  const byPlan = Object.entries(PLANS).map(([key, def]) => ({
    key, def,
    count: subscriptions.filter((s) => s.plan === key).length,
    active: subscriptions.filter((s) => s.plan === key && s.status === "active").length,
  }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-black text-white flex items-center gap-2">
          <CreditCard size={20} className="text-purple-400" />
          Assinaturas
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">{subscriptions.length} assinaturas no sistema</p>
      </div>

      {/* Cards por plano */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {byPlan.map(({ key, def, count, active }) => (
          <div key={key} className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4">
            <Badge text={def.name} color={PLAN_COLORS[key] ?? "text-slate-400 bg-slate-800 border-slate-700"} />
            <p className="text-2xl font-black text-white mt-3">{count}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{active} ativos · {def.price > 0 ? formatCurrency(def.price) + "/mês" : "Grátis"}</p>
          </div>
        ))}
      </div>

      {/* Tabela */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-slate-800/50 border-b border-slate-700/50">
            <tr>
              {["Usuário", "Plano", "Status", "Trial Até", "Período Até", "Stripe ID"].map((h) => (
                <th key={h} className="px-5 py-3.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {subscriptions.map((s) => (
              <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-5 py-3.5">
                  <a href={`/admin/accounts/${s.userId}`} className="hover:text-blue-400 transition-colors">
                    <p className="font-medium text-white">{s.user.name ?? "—"}</p>
                    <p className="text-[10px] text-slate-500">{s.user.email}</p>
                  </a>
                </td>
                <td className="px-5 py-3.5"><Badge text={s.plan} color={PLAN_COLORS[s.plan] ?? "text-slate-400 bg-slate-800 border-slate-700"} /></td>
                <td className="px-5 py-3.5"><Badge text={s.status} color={STATUS_COLORS[s.status] ?? "text-slate-400 bg-slate-800 border-slate-700"} /></td>
                <td className="px-5 py-3.5 text-[11px] text-slate-400">{s.trialEndsAt ? new Date(s.trialEndsAt).toLocaleDateString("pt-BR") : "—"}</td>
                <td className="px-5 py-3.5 text-[11px] text-slate-400">{s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleDateString("pt-BR") : "—"}</td>
                <td className="px-5 py-3.5 text-[10px] text-slate-600 font-mono truncate max-w-[120px]">{s.stripeSubscriptionId ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
