"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, AlertTriangle, Clock, Zap, ChevronRight } from "lucide-react";

interface SubscriptionInfo {
  plan: string;
  planName: string;
  status: string;
  trialEndsAt: string | null;
  accountsLimit: number;
  connectedCount: number;
  daysRemaining: number | null;
  isActive: boolean;
  plans: Record<string, { name: string; price: number; accountsLimit: number }>;
}

const PLAN_COLORS: Record<string, string> = {
  start: "from-blue-600 to-blue-500",
  plus: "from-violet-600 to-violet-500",
  premium: "from-amber-600 to-amber-500",
};

export function PlanGuard({ children }: { children: React.ReactNode }) {
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [trialBannerDismissed, setTrialBannerDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/subscription")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setSub(data);
      })
      .catch(() => {});
  }, []);

  const isExpired = sub && !sub.isActive;
  const isTrialing = sub?.status === "trialing";
  const showTrialBanner = isTrialing && !trialBannerDismissed && sub.daysRemaining !== null;

  return (
    <div className="flex flex-col flex-1 h-full relative overflow-hidden">
      {/* Trial banner */}
      {showTrialBanner && (
        <div className="relative z-40 flex items-center justify-between gap-3 px-4 py-2 bg-gradient-to-r from-blue-900/80 to-indigo-900/80 border-b border-blue-700/40 text-xs font-medium text-blue-200 shrink-0">
          <div className="flex items-center gap-2">
            <Clock size={13} className="text-blue-400 shrink-0" />
            <span>
              <strong className="text-white">Trial Premium</strong>{" — "}
              {sub.daysRemaining === 0
                ? "expira hoje."
                : sub.daysRemaining === 1
                ? "expira amanhã."
                : `${sub.daysRemaining} dias restantes.`}
              {" "}Acesso completo liberado · {sub.connectedCount}/{sub.accountsLimit} contas
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/dashboard/billing"
              className="flex items-center gap-1 text-blue-300 hover:text-white font-bold uppercase tracking-wide text-[10px] transition-colors"
            >
              <Zap size={11} />
              Assinar agora
            </Link>
            <button
              type="button"
              onClick={() => setTrialBannerDismissed(true)}
              className="text-blue-500 hover:text-blue-300 transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className={`flex-1 flex flex-col h-full overflow-hidden ${isExpired ? "pointer-events-none select-none" : ""}`}>
        {children}
      </div>

      {/* Expired overlay */}
      {isExpired && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-700/60 rounded-2xl p-8 max-w-lg w-full shadow-2xl">
            <div className="text-center space-y-5">
              {/* Icon */}
              <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto">
                <AlertTriangle size={24} className="text-rose-400" />
              </div>

              <div>
                <h2 className="text-lg font-black text-white mb-2">
                  {sub?.status === "expired" ? "Seu período expirou" : "Plano cancelado"}
                </h2>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Para continuar usando o Dashfy, assine um dos planos abaixo.
                </p>
              </div>

              {/* Plan cards */}
              {sub?.plans && (
                <div className="grid grid-cols-1 gap-2 text-left">
                  {Object.entries(sub.plans)
                    .filter(([key]) => key !== "trial")
                    .map(([key, plan]) => (
                      <button
                        key={key}
                        type="button"
                        className="flex items-center justify-between p-3.5 rounded-xl border border-slate-700/60 hover:border-slate-500 bg-slate-800/60 hover:bg-slate-800 transition-all group pointer-events-auto"
                        onClick={() => window.location.href = `/dashboard/billing`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${PLAN_COLORS[key] ?? "from-slate-500 to-slate-400"}`} />
                          <div>
                            <span className="text-sm font-bold text-white">{plan.name}</span>
                            <span className="text-[10px] text-slate-500 ml-2">até {plan.accountsLimit} contas</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-slate-300">
                            R$ {plan.price.toFixed(2).replace(".", ",")}
                            <span className="text-[10px] font-normal text-slate-500">/mês</span>
                          </span>
                          <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-300 transition-colors" />
                        </div>
                      </button>
                    ))}
                </div>
              )}

              <p className="text-[10px] text-slate-600 pt-2">
                Entre em contato via WhatsApp se precisar de ajuda.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
