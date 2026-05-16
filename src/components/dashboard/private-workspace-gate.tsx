import Link from "next/link";
import { Lock, LogIn, ArrowLeft } from "lucide-react";
import { DashfyLogoFull } from "@/components/logo/logo";

interface PrivateWorkspaceGateProps {
  slug: string;
  workspaceName: string;
}

/**
 * Mostrada quando alguém acessa `/cliente/[slug]` de um workspace existente
 * mas que **não está com Acesso Público habilitado**. Em vez de 404 cru,
 * direciona o usuário pra `/login` (que após autenticado redireciona pro
 * `/workspace/[slug]` autenticado).
 */
export function PrivateWorkspaceGate({ slug: _slug, workspaceName }: PrivateWorkspaceGateProps) {
  // /login redireciona CLIENT autenticado direto pra `/workspace/<seu-slug>`,
  // então não precisa passar next= — o usuário não escolhe workspace, é fixo
  // no DB (User.workspaceId).
  const loginHref = "/login";

  return (
    <div className="min-h-screen bg-slate-900 relative overflow-x-hidden">
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-[400px] h-[400px] bg-indigo-600/5 rounded-full blur-3xl pointer-events-none" />

      <div className="flex min-h-screen items-center justify-center px-4 py-6">
        <div className="w-full max-w-sm relative z-10">
          <div className="flex items-center justify-center mb-4">
            <DashfyLogoFull width={420} />
          </div>

          <div className="glass-panel rounded-2xl p-7 shadow-2xl">
            <div className="mb-6 flex items-start gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 shrink-0">
                <Lock size={18} className="text-blue-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-black text-white mb-0.5 uppercase tracking-tight">
                  Painel privado
                </h1>
                <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                  O painel <span className="text-white font-semibold">{workspaceName}</span> não está disponível publicamente. Faça login com a conta que recebeu pra acessar.
                </p>
              </div>
            </div>

            <Link
              href={loginHref}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold py-3 transition-colors"
            >
              <LogIn size={14} />
              Fazer login
            </Link>

            <Link
              href="/"
              className="mt-3 w-full flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-300 uppercase tracking-wider transition-colors"
            >
              <ArrowLeft size={12} />
              Voltar para Dashfy
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
