import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, KeyRound, ArrowLeft } from "lucide-react";
import { DashfyLogoFull } from "@/components/logo/logo";
import { ChangePasswordForm } from "./form";

export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const forced = !!(session.user as { forcePasswordChange?: boolean }).forcePasswordChange;

  return (
    <div className="min-h-screen bg-slate-900 relative overflow-x-hidden">
      {/* Background glow — consistente com /login e dashboards */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-[400px] h-[400px] bg-indigo-600/5 rounded-full blur-3xl pointer-events-none" />

      <div className="flex min-h-screen items-center justify-center px-4 py-6">
        <div className="w-full max-w-sm relative z-10">

          {!forced && (
            <Link
              href="/perfil"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-blue-400 uppercase tracking-wider mb-4 transition-colors"
            >
              <ArrowLeft size={14} />
              Voltar
            </Link>
          )}

          {/* Logo */}
          <div className="flex items-center justify-center mb-4">
            <DashfyLogoFull width={420} />
          </div>

          {/* Card */}
          <div className="glass-panel rounded-2xl p-7 shadow-2xl">
            <div className="mb-6 flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 shrink-0">
                <KeyRound size={18} className="text-amber-400" />
              </div>
              <div>
                <h1 className="text-base font-black text-white mb-0.5 uppercase tracking-tight">Trocar senha</h1>
                <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                  Use no mínimo 6 caracteres. Após a alteração, você será deslogado e precisará entrar novamente.
                </p>
              </div>
            </div>

            {forced && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 mb-5">
                <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-300 font-medium leading-relaxed">
                  Você precisa trocar sua senha antes de continuar usando a plataforma.
                </p>
              </div>
            )}

            <ChangePasswordForm />
          </div>
        </div>
      </div>
    </div>
  );
}
