"use client";

import { Loader2 } from "lucide-react";
import { signIn } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { DashfyLogoFull } from "@/components/logo/logo";
import { PLANS, type PlanKey } from "@/lib/plans";

const PLAN_LABELS: Record<string, string> = {
  trial: "Trial gratuito — 7 dias sem compromisso",
  start: "Plano Start — R$ 49,90/mês · até 3 contas",
  plus: "Plano Plus — R$ 129,90/mês · até 10 contas",
  premium: "Plano Premium — R$ 299,90/mês · até 30 contas",
};

export default function CadastroPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planParam = searchParams.get("plan") as PlanKey | null;
  const selectedPlan: PlanKey = planParam && PLANS[planParam] ? planParam : "trial";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }

    if (password.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres.");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Erro ao criar conta.");
      setLoading(false);
      return;
    }

    // Auto-login após cadastro
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      router.push("/login");
      return;
    }

    // Se veio de um plano pago, redireciona para página de planos
    if (selectedPlan !== "trial") {
      router.push(`/planos?plan=${selectedPlan}`);
    } else {
      router.push("/integracoes?tab=inicio");
    }
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-slate-900 relative overflow-x-hidden">
      {/* Background glow */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-[400px] h-[400px] bg-indigo-600/5 rounded-full blur-3xl pointer-events-none" />

      <div className="flex min-h-screen items-start justify-center px-4 pt-1 pb-6">
      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="flex items-center justify-center mt-2 mb-1">
          <DashfyLogoFull width={440} />
        </div>

        {/* Plan badge */}
        {selectedPlan && (
          <div className="mb-2 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-600/10 border border-blue-500/20 text-xs text-blue-300 font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
            {PLAN_LABELS[selectedPlan]}
            {selectedPlan !== "trial" && (
              <span className="ml-auto text-[10px] text-blue-500">Trial de 7 dias incluído</span>
            )}
          </div>
        )}

        {/* Card */}
        <div className="glass-panel rounded-2xl px-6 py-5 shadow-2xl">
          <div className="mb-4">
            <h1 className="text-base font-black text-white mb-0.5 uppercase tracking-tight">Criar conta</h1>
            <p className="text-xs text-slate-400 font-medium">Preencha os dados para começar</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Nome</label>
              <input
                type="text"
                placeholder="Seu nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Email</label>
              <input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Senha</label>
              <input
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Confirmar senha</label>
              <input
                type="password"
                placeholder="Repita a senha"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm py-2.5 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 mt-1"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Criando conta...
                </>
              ) : (
                "Criar conta"
              )}
            </button>
          </form>

          <p className="text-center text-xs text-slate-500 mt-4">
            Já tem uma conta?{" "}
            <Link href="/login" className="text-blue-400 hover:text-blue-300 font-bold transition-colors">
              Entrar
            </Link>
          </p>
        </div>

        <p className="text-center text-[10px] text-slate-600 mt-4 font-medium">
          Dashfy · Dashboard de Tráfego Pago
        </p>
      </div>
      </div>
    </div>
  );
}
