"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, ArrowRight, BarChart2, Share2, Loader2, Play, Link2 } from "lucide-react";
import { DashfyLogoFull } from "@/components/logo/logo";

const STEPS = [
  {
    icon: Link2,
    title: "Conecte suas contas",
    description: "Integre Meta Ads, Google Ads e GA4 em poucos cliques.",
  },
  {
    icon: BarChart2,
    title: "Visualize suas métricas",
    description: "Todos os dados em tempo real, num único painel centralizado.",
  },
  {
    icon: Share2,
    title: "Compartilhe com clientes",
    description: "Gere dashboards personalizados para cada cliente com acesso exclusivo.",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleStart() {
    setLoading(true);
    try {
      await fetch("/api/onboarding/complete", { method: "POST" });
    } catch {
      // continua mesmo com erro de rede
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-indigo-600/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-2xl relative z-10 flex flex-col items-center gap-10">

        {/* Logo */}
        <div className="flex items-center gap-3">
          <DashfyLogoFull width={140} />
        </div>

        {/* Welcome */}
        <div className="text-center">
          <h1 className="text-3xl font-black text-white tracking-tight mb-3">
            Bem-vindo à plataforma
          </h1>
          <p className="text-slate-400 text-sm max-w-md mx-auto leading-relaxed">
            Gerencie Meta Ads, Google Ads e GA4 de todos os seus clientes em um único lugar. Veja como funciona antes de começar.
          </p>
        </div>

        {/* Video */}
        <div className="w-full glass-panel rounded-2xl overflow-hidden shadow-2xl">
          <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src="https://www.youtube.com/embed/daxUwwbUBWc"
              title="Onboarding Dashfy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
            {/* Overlay play hint — some browsers block autoplay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0">
              <div className="w-16 h-16 bg-white/10 backdrop-blur rounded-full flex items-center justify-center">
                <Play size={24} className="text-white ml-1" />
              </div>
            </div>
          </div>
        </div>

        {/* 3 Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
          {STEPS.map((step, i) => (
            <div
              key={i}
              className="glass-panel rounded-2xl p-5 flex flex-col gap-3 border border-slate-800/60"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <step.icon size={15} className="text-blue-400" />
                </div>
                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">
                  Passo {i + 1}
                </span>
              </div>
              <div>
                <p className="text-sm font-bold text-white mb-1">{step.title}</p>
                <p className="text-xs text-slate-400 leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={handleStart}
          disabled={loading}
          className="w-full sm:w-auto flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold text-sm px-10 py-4 rounded-2xl transition-all active:scale-95 shadow-xl shadow-blue-500/20"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Carregando...
            </>
          ) : (
            <>
              Começar agora
              <ArrowRight size={16} />
            </>
          )}
        </button>

        <p className="text-[10px] text-slate-600 font-medium">
          Dashfy · Dashboard de Tráfego Pago
        </p>
      </div>
    </div>
  );
}
