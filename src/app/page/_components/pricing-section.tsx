"use client";
import Link from "next/link";
import NumberFlow from "@number-flow/react";
import { motion } from "framer-motion";
import { useRef, useState } from "react";
import { Zap, Lock } from "lucide-react";
import { TimelineContent } from "./ui/timeline-animation";
import { Sparkles } from "./ui/sparkles";
import { VerticalCutReveal } from "./ui/vertical-cut-reveal";
import { cn } from "@/lib/utils";

// ─── Checkout URLs (Cakto) ────────────────────────────────────────────────────
const CHECKOUT = {
  // Mensal com 50% de desconto de lançamento
  monthly: {
    start:   "https://pay.cakto.com.br/47zzii9",
    plus:    "https://pay.cakto.com.br/gcjd5jb",
    premium: "https://pay.cakto.com.br/bfdwwca",
  },
  // Anual (desconto de ~2 meses, sem 50% extra)
  yearly: {
    start:   "https://pay.cakto.com.br/myb4z9x",
    plus:    "https://pay.cakto.com.br/jiamap9",
    premium: "https://pay.cakto.com.br/3649tjt",
  },
};

type PlanId = keyof typeof CHECKOUT.monthly;

const plans = [
  {
    name: "Starter",
    description:
      "Para gestores que querem sair das planilhas e entregar relatórios profissionais desde o primeiro cliente",
    monthlyFull: 49.9,     // preço cheio mensal (riscado)
    monthlyLaunch: 24.9,   // 50% off lançamento
    yearlyFull: 499.9,     // preço anual (equivale a 10 meses)
    yearlyMonthly: 41.66,  // equivalência mensal do anual (499,90 / 12)
    buttonTextMonthly: "Começar por R$24,90/mês",
    buttonTextYearly:  "Começar por R$499,90/ano",
    popular: false,
    planId: "start" as PlanId,
    label: "Starter inclui:",
    includes: [
      "Até 3 clientes ativos",
      "Dashboards automatizados em tempo real",
      "Integração com Meta Ads ou Google Ads",
      "Suporte por email",
    ],
    comingSoon: [] as string[],
  },
  {
    name: "Pro",
    description:
      "Para agências em crescimento que precisam de estrutura, velocidade e presença de marca própria",
    monthlyFull: 129.9,
    monthlyLaunch: 64.9,
    yearlyFull: 1299.9,
    yearlyMonthly: 108.33,
    buttonTextMonthly: "Quero o Pro por R$64,90/mês",
    buttonTextYearly:  "Quero o Pro por R$1.299,90/ano",
    popular: true,
    planId: "plus" as PlanId,
    label: "Tudo do Starter, mais:",
    includes: [
      "Até 10 clientes ativos",
      "Dashboards automatizados em tempo real",
      "Integração com Meta Ads, Google Ads e GA4",
      "Suporte por WhatsApp prioritário",
    ],
    comingSoon: [
      "App para Android e iOS na Play Store",
      "Notificações push em tempo real",
    ],
  },
  {
    name: "Enterprise",
    description:
      "Para agências consolidadas que exigem escala, suporte dedicado e uma parceria real no crescimento",
    monthlyFull: 299.9,
    monthlyLaunch: 149.9,
    yearlyFull: 2999.9,
    yearlyMonthly: 249.99,
    buttonTextMonthly: "Enterprise por R$149,90/mês",
    buttonTextYearly:  "Enterprise por R$2.999,90/ano",
    popular: false,
    planId: "premium" as PlanId,
    label: "Tudo do Pro, mais:",
    includes: [
      "Até 30 clientes ativos",
      "Dashboards automatizados em tempo real",
      "Integração com Meta Ads, Google Ads e GA4",
      "Suporte por WhatsApp prioritário",
      "Calls diretos com a equipe Dashfy para bugs e novas funções",
    ],
    comingSoon: [
      "App para Android e iOS na Play Store",
      "Notificações push em tempo real",
      "White label: domínio personalizado e logo da sua agência",
    ],
  },
];

function PricingSwitch({ onSwitch }: { onSwitch: (value: string) => void }) {
  const [selected, setSelected] = useState("0");
  const handle = (v: string) => { setSelected(v); onSwitch(v); };

  return (
    <div className="flex justify-center">
      <div className="relative z-10 mx-auto flex w-fit rounded-full bg-neutral-900 border border-gray-700 p-1">
        {[
          { label: "Mensal", value: "0" },
          {
            label: (
              <span className="flex items-center gap-2">
                Anual
                <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
                  -2 meses
                </span>
              </span>
            ),
            value: "1",
          },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => handle(opt.value)}
            className={cn(
              "relative z-10 w-fit h-10 rounded-full sm:px-6 px-3 sm:py-2 py-1 font-medium transition-colors",
              selected === opt.value ? "text-white" : "text-gray-200"
            )}
          >
            {selected === opt.value && (
              <motion.span
                layoutId="switch"
                className="absolute top-0 left-0 h-10 w-full rounded-full border-4 shadow-sm shadow-[#165CFE] border-[#165CFE] bg-gradient-to-t from-[#165CFE] to-[#2d6fff]"
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}
            <span className="relative">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function PricingSection() {
  const [isYearly, setIsYearly] = useState(false);
  const pricingRef = useRef<HTMLDivElement>(null);

  const revealVariants = {
    visible: (i: number) => ({
      y: 0, opacity: 1, filter: "blur(0px)",
      transition: { delay: i * 0.4, duration: 0.5 },
    }),
    hidden: { filter: "blur(10px)", y: -20, opacity: 0 },
  };

  // Mensal: mostra preço cheio riscado + preço de lançamento 50% off
  // Anual: mostra equivalente mensal × 12 riscado + preço anual real
  const getStrikePrice = (plan: (typeof plans)[0]) =>
    isYearly ? plan.monthlyFull * 12 : plan.monthlyFull;
  const getActivePrice = (plan: (typeof plans)[0]) =>
    isYearly ? plan.yearlyFull : plan.monthlyLaunch;
  const getCheckoutUrl = (plan: (typeof plans)[0]) =>
    isYearly ? CHECKOUT.yearly[plan.planId] : CHECKOUT.monthly[plan.planId];

  return (
    <div id="pricing" className="mx-auto relative bg-[#0F172A] overflow-x-hidden py-16 pb-24" ref={pricingRef}>
      <TimelineContent
        animationNum={4}
        timelineRef={pricingRef}
        customVariants={revealVariants}
        className="absolute top-0 h-96 w-screen overflow-hidden [mask-image:radial-gradient(50%_50%,white,transparent)]"
      >
        <div className="absolute bottom-0 left-0 right-0 top-0 bg-[linear-gradient(to_right,#ffffff2c_1px,transparent_1px),linear-gradient(to_bottom,#3a3a3a01_1px,transparent_1px)] bg-[size:70px_80px]" />
        <Sparkles
          density={1800}
          direction="bottom"
          speed={1}
          color="#FFFFFF"
          className="absolute inset-x-0 bottom-0 h-full w-full [mask-image:radial-gradient(50%_50%,white,transparent_85%)]"
        />
      </TimelineContent>

      {/* Launch banner */}
      <TimelineContent
        animationNum={0}
        timelineRef={pricingRef}
        customVariants={revealVariants}
        className="relative z-50 flex justify-center pt-32 mb-6"
      >
        <div className="flex items-center gap-2 px-5 py-2 rounded-full bg-gradient-to-r from-emerald-500/15 to-emerald-600/15 border border-emerald-500/40 text-emerald-400 text-sm font-semibold">
          <Zap className="w-4 h-4 fill-emerald-400" />
          PREÇO DE LANÇAMENTO: 50% de desconto para quem assinar agora
          <Zap className="w-4 h-4 fill-emerald-400" />
        </div>
      </TimelineContent>

      <article className="text-center mb-6 max-w-3xl mx-auto space-y-3 relative z-50">
        <h2 className="text-4xl font-bold text-white">
          <VerticalCutReveal
            splitBy="words"
            staggerDuration={0.15}
            staggerFrom="first"
            reverse
            containerClassName="justify-center"
            transition={{ type: "spring", stiffness: 250, damping: 40, delay: 0 }}
          >
            Planos para todos os tamanhos de operação
          </VerticalCutReveal>
        </h2>

        <TimelineContent
          as="p"
          animationNum={1}
          timelineRef={pricingRef}
          customVariants={revealVariants}
          className="text-gray-300 text-lg"
        >
          Escolha o plano ideal para automatizar seus relatórios e impressionar seus clientes
        </TimelineContent>

        <TimelineContent
          as="div"
          animationNum={2}
          timelineRef={pricingRef}
          customVariants={revealVariants}
        >
          <PricingSwitch onSwitch={(v) => setIsYearly(Number(v) === 1)} />
        </TimelineContent>
      </article>

      <div className="grid md:grid-cols-3 max-w-6xl gap-5 py-6 mx-auto px-4">
        {plans.map((plan, index) => (
          <TimelineContent
            key={plan.name}
            animationNum={3 + index}
            timelineRef={pricingRef}
            customVariants={revealVariants}
          >
            <div
              className={cn(
                "relative text-white flex flex-col rounded-2xl border p-6",
                plan.popular
                  ? "border-[#165CFE]/60 bg-gradient-to-b from-[#165CFE]/10 via-neutral-900 to-neutral-950 shadow-xl shadow-[#165CFE]/20"
                  : "border-neutral-800 bg-gradient-to-b from-neutral-900 via-neutral-900 to-neutral-950"
              )}
            >
              {plan.popular && (
                <div className="absolute -top-3.5 left-0 right-0 flex justify-center">
                  <span className="text-xs font-bold px-4 py-1.5 rounded-full bg-gradient-to-r from-[#165CFE] to-[#2d6fff] text-white shadow-lg shadow-[#165CFE]/40">
                    ⭐ Mais Popular
                  </span>
                </div>
              )}

              <div className="text-left pb-4 mb-4 border-b border-neutral-800/60">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-2xl font-bold">{plan.name}</h3>
                  {!isYearly ? (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      50% OFF
                    </span>
                  ) : (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
                      ~16% OFF
                    </span>
                  )}
                </div>

                <div className="mb-1">
                  <div className="flex items-baseline gap-1.5 mb-0.5">
                    <span className="text-sm text-gray-500 line-through">
                      De R$
                      <NumberFlow
                        value={getStrikePrice(plan)}
                        format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
                        className="text-sm"
                      />
                    </span>
                    <span className="text-xs text-gray-500">/{isYearly ? "ano" : "mês"}</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-gray-300 text-base font-medium">R$</span>
                    <NumberFlow
                      value={getActivePrice(plan)}
                      format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
                      className="text-5xl font-bold text-white"
                    />
                    <span className="text-gray-400 text-sm ml-1">/{isYearly ? "ano" : "mês"}</span>
                  </div>
                  {isYearly && (
                    <p className="text-xs text-blue-400 mt-1">
                      ≈ R${plan.yearlyMonthly.toFixed(2)}/mês · 2 meses grátis
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-xs text-emerald-400 mb-1">
                  <Lock className="w-3 h-3" />
                  {isYearly
                    ? <span>Cobrado anualmente · Cancele quando quiser</span>
                    : <span>Preço garantido enquanto durar o lançamento</span>
                  }
                </div>

                <p className="text-sm text-gray-400 leading-relaxed">{plan.description}</p>
              </div>

              <div className="flex flex-col flex-1">
                {/* Primary CTA — direct checkout */}
                <a
                  href={getCheckoutUrl(plan)}
                  className={cn(
                    "w-full mb-3 py-4 px-6 text-base font-bold rounded-xl transition-all text-center",
                    plan.popular
                      ? "bg-gradient-to-r from-[#165CFE] to-[#2d6fff] shadow-lg shadow-[#165CFE]/40 border border-[#165CFE] text-white hover:shadow-xl hover:scale-[1.02]"
                      : "bg-gradient-to-r from-neutral-800 to-neutral-700 border border-neutral-600 text-white hover:border-neutral-500 hover:scale-[1.02]"
                  )}
                >
                  {isYearly ? plan.buttonTextYearly : plan.buttonTextMonthly}
                </a>

                {/* Secondary CTA — free trial */}
                <div className="mb-5 text-center">
                  <Link
                    href="/cadastro"
                    className="text-sm text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2"
                  >
                    Testar 7 dias grátis
                  </Link>
                  <p className="text-[11px] text-gray-600 mt-0.5">
                    Valor cheio após o período de teste
                  </p>
                </div>

                <div className="space-y-3 pt-4 border-t border-neutral-800">
                  <h4 className="font-semibold text-sm text-gray-300 uppercase tracking-wide">
                    {plan.label}
                  </h4>
                  <ul className="space-y-2.5">
                    {plan.includes.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="h-2 w-2 bg-[#165CFE] rounded-full flex-shrink-0 mt-1.5" />
                        <span className="text-sm text-gray-300 leading-snug">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {plan.comingSoon.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-neutral-800/60">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5">Em breve</p>
                      <ul className="space-y-2.5">
                        {plan.comingSoon.map((feature, i) => (
                          <li key={i} className="flex items-start gap-2.5 opacity-50">
                            <span className="h-2 w-2 rounded-full border border-gray-500 flex-shrink-0 mt-1.5" />
                            <span className="text-sm text-gray-400 leading-snug">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TimelineContent>
        ))}
      </div>

      {/* Disclaimer */}
      <TimelineContent
        animationNum={6}
        timelineRef={pricingRef}
        customVariants={revealVariants}
        className="relative z-50 max-w-xl mx-auto px-4"
      >
        <p className="text-center text-xs text-gray-600 leading-relaxed">
          * O desconto de 50% é exclusivo para quem assinar durante o lançamento.
          Quem optar pelos 7 dias de teste gratuito não terá acesso ao preço promocional —
          a assinatura após o teste será realizada pelo valor cheio.
        </p>
      </TimelineContent>
    </div>
  );
}
