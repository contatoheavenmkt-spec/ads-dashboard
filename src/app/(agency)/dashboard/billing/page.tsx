"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/header";
import {
  Check,
  Zap,
  Crown,
  Rocket,
  Loader2,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SubscriptionInfo {
  plan: string;
  planName: string;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  accountsLimit: number;
  connectedCount: number;
  daysRemaining: number | null;
  isActive: boolean;
  stripeSubscriptionId?: string;
}

// ─── Plan definitions for UI ──────────────────────────────────────

const PLAN_UI = {
  start: {
    name: "Start",
    price: "R$ 49,90",
    period: "/mês",
    icon: Zap,
    color: "blue",
    borderColor: "border-blue-500/40",
    activeBg: "bg-blue-600/10",
    badgeColor: "bg-blue-600/20 text-blue-300 border-blue-500/30",
    btnClass: "bg-blue-600 hover:bg-blue-500 text-white",
    accountsLimit: 3,
    features: [
      "3 contas conectadas",
      "1 plataforma à sua escolha",
      "Meta Ads OU Google Ads OU GA4",
      "Compartilhamento com clientes",
    ],
  },
  plus: {
    name: "Plus",
    price: "R$ 129,90",
    period: "/mês",
    icon: Rocket,
    color: "violet",
    borderColor: "border-violet-500/40",
    activeBg: "bg-violet-600/10",
    badgeColor: "bg-violet-600/20 text-violet-300 border-violet-500/30",
    btnClass: "bg-violet-600 hover:bg-violet-500 text-white",
    accountsLimit: 10,
    features: [
      "10 contas conectadas",
      "Meta Ads + Google Ads + GA4",
      "Dashboard em tempo real",
      "Tudo do plano Start",
    ],
  },
  premium: {
    name: "Premium",
    price: "R$ 299,90",
    period: "/mês",
    icon: Crown,
    color: "amber",
    borderColor: "border-amber-500/40",
    activeBg: "bg-amber-600/10",
    badgeColor: "bg-amber-600/20 text-amber-300 border-amber-500/30",
    btnClass: "bg-amber-600 hover:bg-amber-500 text-white",
    accountsLimit: 30,
    features: [
      "30 contas conectadas",
      "Tudo do plano Plus",
      "Acesso completo a todas as funcionalidades",
      "Suporte prioritário",
    ],
  },
} as const;

type PlanKey = keyof typeof PLAN_UI;

export default function BillingPage() {
  const searchParams = useSearchParams();
  const successParam = searchParams.get("success");
  const canceledParam = searchParams.get("canceled");
  const planParam = searchParams.get("plan");

  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = searchParams.get("session_id");

    // Se voltou do Stripe com session_id, verifica e ativa antes de carregar
    if (successParam && sessionId) {
      setVerifying(true);
      fetch(`/api/stripe/verify-session?session_id=${sessionId}`)
        .then((r) => r.json())
        .then(() => {
          // Após verificar, busca subscription atualizada
          return fetch("/api/subscription").then((r) => (r.ok ? r.json() : null));
        })
        .then((data) => { setSub(data); })
        .catch(() => {})
        .finally(() => { setVerifying(false); setLoading(false); });
      return;
    }

    fetch("/api/subscription")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setSub(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [successParam, searchParams]);

  async function handleSubscribe(plan: PlanKey) {
    setCheckingOut(plan);
    setCheckoutError(null);
    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setCheckoutError(data.error || "Erro ao criar sessão de pagamento.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setCheckoutError("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setCheckingOut(null);
    }
  }

  async function handlePortal() {
    setOpeningPortal(true);
    try {
      const res = await fetch("/api/stripe/create-portal-session", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Erro ao abrir portal de cobrança.");
        return;
      }
      window.location.href = data.url;
    } catch {
      alert("Erro de conexão. Tente novamente.");
    } finally {
      setOpeningPortal(false);
    }
  }

  const currentPlan = sub?.plan as PlanKey | undefined;
  const isTrialing = sub?.status === "trialing";
  const isExpired = sub && !sub.isActive;
  const hasPaidStripe = sub?.status === "active" && sub.plan !== "trial";

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header title="Cobrança" subtitle="Planos e assinatura" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Success / Cancel banners */}
        {successParam && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm font-medium">
            <CheckCircle2 size={18} className="shrink-0" />
            Pagamento confirmado! Seu plano {planParam ? `(${planParam})` : ""} foi ativado.
          </div>
        )}
        {canceledParam && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm font-medium">
            <XCircle size={18} className="shrink-0" />
            Pagamento cancelado. Nenhuma cobrança foi realizada.
          </div>
        )}

        {loading || verifying ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            {verifying && (
              <p className="text-sm text-slate-400 animate-pulse">Ativando seu plano...</p>
            )}
          </div>
        ) : (
          <>
            {/* Current plan card */}
            {sub && (
              <div className="glass-panel rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Plano atual</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xl font-black text-white">{sub.planName}</span>

                    {/* Status badge */}
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border",
                      isExpired
                        ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                        : isTrialing
                        ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                        : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    )}>
                      {isExpired ? "Expirado" : isTrialing ? "Trial" : "Ativo"}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-400">
                    <span>{sub.connectedCount}/{sub.accountsLimit} contas conectadas</span>
                    {isTrialing && sub.daysRemaining !== null && (
                      <span className="text-amber-400 font-semibold">
                        {sub.daysRemaining === 0 ? "Expira hoje" : `${sub.daysRemaining} dias de trial restantes`}
                      </span>
                    )}
                    {sub.currentPeriodEnd && !isTrialing && (
                      <span>Renova em {formatDate(sub.currentPeriodEnd)}</span>
                    )}
                    {isTrialing && sub.trialEndsAt && (
                      <span>Trial expira em {formatDate(sub.trialEndsAt)}</span>
                    )}
                  </div>
                </div>

                {/* Portal link for active paid subscribers */}
                {hasPaidStripe && (
                  <button
                    type="button"
                    onClick={handlePortal}
                    disabled={openingPortal}
                    className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
                  >
                    {openingPortal ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                    Gerenciar assinatura
                  </button>
                )}
              </div>
            )}

            {/* Checkout error */}
            {checkoutError && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                <XCircle size={15} className="shrink-0 mt-0.5" />
                <span>{checkoutError}</span>
              </div>
            )}

            {/* Plan grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {(Object.entries(PLAN_UI) as [PlanKey, typeof PLAN_UI[PlanKey]][]).map(([key, plan]) => {
                const Icon = plan.icon;
                const isCurrent = currentPlan === key && sub?.status !== "expired";
                const isLoading = checkingOut === key;

                return (
                  <div
                    key={key}
                    className={cn(
                      "glass-panel rounded-2xl p-6 flex flex-col border transition-all",
                      isCurrent
                        ? `${plan.borderColor} ${plan.activeBg}`
                        : "border-slate-700/40 hover:border-slate-600/60"
                    )}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-5">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Icon size={18} className={`text-${plan.color}-400`} />
                          <span className="text-base font-black text-white">{plan.name}</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-black text-white">{plan.price}</span>
                          <span className="text-xs text-slate-500">{plan.period}</span>
                        </div>
                      </div>

                      {isCurrent && (
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full border",
                          plan.badgeColor
                        )}>
                          Atual
                        </span>
                      )}
                    </div>

                    {/* Features */}
                    <ul className="space-y-2.5 flex-1 mb-6">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-xs text-slate-300">
                          <Check size={13} className={`text-${plan.color}-400 mt-0.5 shrink-0`} />
                          {f}
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    {isCurrent ? (
                      <div className="flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-700/50 text-xs font-bold text-slate-400">
                        <Check size={14} />
                        Plano atual
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSubscribe(key)}
                        disabled={isLoading || !!checkingOut}
                        className={cn(
                          "flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed",
                          plan.btnClass
                        )}
                      >
                        {isLoading ? (
                          <><Loader2 size={15} className="animate-spin" /> Aguarde...</>
                        ) : (
                          <><Zap size={15} /> Assinar {plan.name}</>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Expiry warning */}
            {isExpired && (
              <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs">
                <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-400" />
                <span>
                  Seu plano expirou. Escolha um plano acima para reativar o acesso completo à plataforma.
                </span>
              </div>
            )}

            {/* Fine print */}
            <p className="text-center text-[11px] text-slate-600 pb-2">
              Pagamentos processados com segurança via Stripe · Cancele a qualquer momento · Sem fidelidade
            </p>
          </>
        )}
      </div>
    </div>
  );
}
