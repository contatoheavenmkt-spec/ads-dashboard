"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BarChart2, Share2, Loader2, Link2, Play } from "lucide-react";
import { Header } from "@/components/layout/header";

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
    router.push("/integracoes");
    router.refresh();
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header
        title="Boas-vindas"
        subtitle="Tutorial | Conheça a plataforma"
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Intro Card */}
          <div className="glass-panel rounded-2xl p-6 bg-gradient-to-br from-blue-600/10 to-indigo-600/10 border border-blue-500/30">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-blue-600/20 rounded-2xl flex items-center justify-center shrink-0 border border-blue-500/30">
                <Play size={28} className="text-blue-400 ml-1" />
              </div>
              <div className="flex-1 space-y-2">
                <h2 className="text-lg font-black text-white uppercase tracking-tight">
                  Tutorial da Plataforma
                </h2>
                <p className="text-slate-400 text-sm leading-relaxed max-w-2xl">
                  Em menos de 2 minutos, aprenda a conectar suas contas de anúncios e visualizar todos os dados em um único lugar.
                </p>
              </div>
            </div>
          </div>

          {/* Video */}
          <div className="glass-panel rounded-2xl overflow-hidden shadow-2xl border border-slate-800/60">
            <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
              <iframe
                className="absolute inset-0 w-full h-full"
                src="https://www.youtube.com/embed/dQw4w9WgXcQ"
                title="Tutorial da Plataforma"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>

          {/* 3 Steps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STEPS.map((step, i) => (
              <div
                key={i}
                className="glass-panel rounded-2xl p-6 flex flex-col gap-4 border border-slate-800/60 hover:border-blue-500/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/20 flex items-center justify-center shrink-0">
                    <step.icon size={18} className="text-blue-400" />
                  </div>
                  <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">
                    Passo {i + 1}
                  </span>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-bold text-white">{step.title}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="flex justify-center pt-4 pb-8">
            <button
              onClick={handleStart}
              disabled={loading}
              className="flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold text-sm px-10 py-4 rounded-2xl transition-all active:scale-95 shadow-xl shadow-blue-500/20"
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
          </div>

        </div>
      </div>
    </div>
  );
}
