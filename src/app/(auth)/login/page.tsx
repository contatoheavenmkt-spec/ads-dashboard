"use client";

import { Loader2 } from "lucide-react";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DashfyLogoFull } from "@/components/logo/logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Email ou senha inválidos");
      return;
    }

    const res = await fetch("/api/auth/session");
    const session = await res.json();
    const role = session?.user?.role;
    const slug = session?.user?.workspaceSlug;
    const onboardingCompleted = session?.user?.onboardingCompleted;

    if (role === "CLIENT" && slug) {
      router.push(`/workspace/${slug}`);
    } else if (!onboardingCompleted) {
      router.push("/integracoes?tab=inicio");
    } else {
      router.push("/dashboard");
    }
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-slate-900 relative overflow-x-hidden">
      {/* Background glow */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-[400px] h-[400px] bg-indigo-600/5 rounded-full blur-3xl pointer-events-none" />

      <div className="flex min-h-screen items-center justify-center px-4 py-6">
      <div className="w-full max-w-sm relative z-10" style={{ marginTop: "-5vh" }}>
        {/* Logo */}
        <div className="flex items-center justify-center mt-6 mb-2">
          <DashfyLogoFull width={520} />
        </div>

        {/* Card */}
        <div className="glass-panel rounded-2xl p-7 shadow-2xl">
          <div className="mb-6">
            <h1 className="text-lg font-black text-white mb-1 uppercase tracking-tight">Entrar na plataforma</h1>
            <p className="text-xs text-slate-400 font-medium">Acesse sua conta de gestão</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Email</label>
              <input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Senha</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2.5 rounded-xl">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm py-3 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Entrando...
                </>
              ) : (
                "Entrar"
              )}
            </button>
          </form>

          <p className="text-center text-xs text-slate-500 mt-6">
            Não tem uma conta?{" "}
            <Link href="/cadastro" className="text-blue-400 hover:text-blue-300 font-bold transition-colors">
              Criar conta
            </Link>
          </p>
        </div>

        <p className="text-center text-[10px] text-slate-600 mt-4 font-medium">
          Dashfy · Dashboard de Tráfego Pago
        </p>
        <p className="text-center text-[10px] text-slate-700 mt-2">
          <Link href="/privacy" className="hover:text-slate-500 transition-colors">Privacidade</Link>
          {" · "}
          <Link href="/terms" className="hover:text-slate-500 transition-colors">Termos de Uso</Link>
          {" · "}
          <Link href="/data-deletion" className="hover:text-slate-500 transition-colors">Exclusão de Dados</Link>
          {" · "}
          <Link href="/about" className="hover:text-slate-500 transition-colors">Sobre</Link>
        </p>
      </div>
      </div>
    </div>
  );
}
