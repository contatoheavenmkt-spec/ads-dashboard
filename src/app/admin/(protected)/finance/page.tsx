import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { formatCurrency } from "@/lib/utils";
import { DollarSign, TrendingUp, TrendingDown, Minus } from "lucide-react";

export default async function FinancePage() {
  const subs = await db.subscription.findMany({ select: { plan: true, status: true, createdAt: true } });

  const active = subs.filter((s) => s.status === "active");
  const trialing = subs.filter((s) => s.status === "trialing");
  const canceled = subs.filter((s) => s.status === "canceled" || s.status === "expired");

  const mrr = active.reduce((sum, s) => sum + (PLANS[s.plan]?.price ?? 0), 0);
  const arr = mrr * 12;
  const avgTicket = active.length > 0 ? mrr / active.length : 0;

  // Receita por plano
  const revenueByPlan = Object.entries(PLANS).map(([key, def]) => ({
    plan: key,
    name: def.name,
    price: def.price,
    count: active.filter((s) => s.plan === key).length,
    revenue: active.filter((s) => s.plan === key).length * def.price,
  })).filter((p) => p.price > 0);

  // Novos no último mês
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const newThisMonth = subs.filter((s) => new Date(s.createdAt) >= oneMonthAgo).length;
  const canceledThisMonth = canceled.filter((s) => new Date(s.createdAt) >= oneMonthAgo).length;

  const cards = [
    { label: "MRR", value: formatCurrency(mrr), sub: "Receita mensal recorrente", icon: DollarSign, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
    { label: "ARR Estimado", value: formatCurrency(arr), sub: "MRR × 12", icon: TrendingUp, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
    { label: "Ticket Médio", value: formatCurrency(avgTicket), sub: `${active.length} assinantes ativos`, icon: Minus, color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
    { label: "Novos (30d)", value: String(newThisMonth), sub: `${canceledThisMonth} cancelados`, icon: TrendingDown, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-black text-white flex items-center gap-2">
          <DollarSign size={20} className="text-emerald-400" />
          Financeiro
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Visão financeira estimada do SaaS</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 flex items-start gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${color}`}>
              <Icon size={18} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</p>
              <p className="text-2xl font-black text-white leading-none">{value}</p>
              <p className="text-[10px] text-slate-500 mt-1">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Receita por plano */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-5">Receita por Plano</h2>
        <div className="space-y-4">
          {revenueByPlan.map((p) => {
            const pct = mrr > 0 ? (p.revenue / mrr) * 100 : 0;
            return (
              <div key={p.plan} className="space-y-1.5">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium text-slate-200">{p.name}</span>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span>{p.count} assinantes</span>
                    <span className="font-bold text-white">{formatCurrency(p.revenue)}/mês</span>
                    <span className="text-slate-600">{pct.toFixed(0)}%</span>
                  </div>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
          {revenueByPlan.length === 0 && (
            <p className="text-slate-600 text-sm text-center py-4">Nenhum plano pago ativo ainda.</p>
          )}
        </div>
      </div>

      {/* Status geral */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Pagantes Ativos", value: active.length, color: "text-emerald-400" },
          { label: "Em Trial", value: trialing.length, color: "text-amber-400" },
          { label: "Cancelados/Expirados", value: canceled.length, color: "text-red-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 text-center">
            <p className={`text-3xl font-black ${color}`}>{value}</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
