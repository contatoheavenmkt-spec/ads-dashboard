"use client";

import { useEffect, useState } from "react";
import { X, Clock, Zap, Check, Loader2, AlertTriangle, Rocket, Crown, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SubscriptionInfo {
  plan: string;
  planName: string;
  status: string;
  trialEndsAt: string | null;
  accountsLimit: number;
  connectedCount: number;
  daysRemaining: number | null;
  isActive: boolean;
}

// ─── Plan definitions ─────────────────────────────────────────────────────────

const PLAN_UI = {
  start: {
    name: "Start",
    price: "R$ 49,90",
    icon: Zap,
    color: "blue" as const,
    border: "border-blue-500/40",
    activeBg: "bg-blue-600/10",
    btn: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20",
    features: [
      "3 contas de anúncios",
      "1 plataforma à escolha",
      "Meta Ads OU Google Ads OU GA4",
      "Dashboard compartilhável com clientes",
    ],
  },
  plus: {
    name: "Plus",
    price: "R$ 129,90",
    icon: Rocket,
    color: "violet" as const,
    border: "border-violet-500/40",
    activeBg: "bg-violet-600/10",
    btn: "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20",
    features: [
      "10 contas de anúncios",
      "Meta Ads + Google Ads + GA4",
      "Dashboard em tempo real",
      "Tudo do plano Start",
    ],
  },
  premium: {
    name: "Premium",
    price: "R$ 299,90",
    icon: Crown,
    color: "amber" as const,
    border: "border-amber-500/40",
    activeBg: "bg-amber-600/10",
    btn: "bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-500/20",
    features: [
      "30 contas de anúncios",
      "Todas as plataformas",
      "Acesso completo a tudo",
      "Suporte prioritário",
    ],
  },
} as const;

type PlanKey = keyof typeof PLAN_UI;

// ─── Component ────────────────────────────────────────────────────────────────

export function PlanGuard({ children }: { children: React.ReactNode }) {
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [trialBannerDismissed, setTrialBannerDismissed] = useState(false);
  const [checkingOut, setCheckingOut] = useState<PlanKey | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/subscription")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setSub(data); })
      .catch(() => {});
  }, []);

  async function handleSubscribe(plan: PlanKey) {
    setCheckingOut(plan);
    setCheckoutError(null);
    try {
      const res = await fetch("/api/cakto/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setCheckoutError(data.error ?? "Erro ao criar sessão de pagamento.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setCheckoutError("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setCheckingOut(null);
    }
  }

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
              {sub.daysRemaining === 0 ? "expira hoje." : sub.daysRemaining === 1 ? "expira amanhã." : `${sub.daysRemaining} dias restantes.`}
              {" "}Acesso completo liberado · {sub.connectedCount}/{sub.accountsLimit} contas
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => handleSubscribe("plus")}
              disabled={!!checkingOut}
              className="flex items-center gap-1 text-blue-300 hover:text-white font-bold uppercase tracking-wide text-[10px] transition-colors disabled:opacity-50"
            >
              <Zap size={11} />
              Assinar agora
            </button>
            <button type="button" onClick={() => setTrialBannerDismissed(true)} className="text-blue-500 hover:text-blue-300 transition-colors">
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
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700/60 rounded-2xl w-full max-w-3xl shadow-2xl my-auto">

            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-slate-800/60 text-center">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle size={22} className="text-rose-400" />
              </div>
              <h2 className="text-lg font-black text-white">
                {sub?.status === "expired" ? "Seu período de trial expirou" : "Plano cancelado"}
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Escolha um plano abaixo para continuar usando o Dashfy
              </p>
            </div>

            {/* Error */}
            {checkoutError && (
              <div className="mx-6 mt-4 flex items-start gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs pointer-events-auto">
                <XCircle size={14} className="shrink-0 mt-0.5" />
                {checkoutError}
              </div>
            )}

            {/* Plan cards */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              {(Object.entries(PLAN_UI) as [PlanKey, typeof PLAN_UI[PlanKey]][]).map(([key, plan]) => {
                const Icon = plan.icon;
                const isLoading = checkingOut === key;
                const isDisabled = !!checkingOut;

                return (
                  <div
                    key={key}
                    className={cn(
                      "rounded-2xl border p-5 flex flex-col transition-all pointer-events-auto",
                      "bg-slate-800/60 hover:bg-slate-800/90",
                      plan.border
                    )}
                  >
                    {/* Plan header */}
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon size={16} className={`text-${plan.color}-400`} />
                        <span className="text-sm font-black text-white">{plan.name}</span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-black text-white">{plan.price}</span>
                        <span className="text-[11px] text-slate-500">/mês</span>
                      </div>
                    </div>

                    {/* Features */}
                    <ul className="space-y-2 flex-1 mb-5">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-xs text-slate-300">
                          <Check size={12} className={`text-${plan.color}-400 mt-0.5 shrink-0`} />
                          {f}
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <button
                      type="button"
                      onClick={() => handleSubscribe(key)}
                      disabled={isDisabled}
                      className={cn(
                        "flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed",
                        plan.btn
                      )}
                    >
                      {isLoading ? (
                        <><Loader2 size={14} className="animate-spin" /> Aguarde...</>
                      ) : (
                        <><Zap size={14} /> Assinar {plan.name}</>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            <p className="text-center text-[10px] text-slate-600 pb-5">
              Pagamentos processados com segurança via Cakto · PIX e cartão · Cancele a qualquer momento
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
