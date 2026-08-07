"use client";

import { useState } from "react";
import { Eye, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  userId: string;
  email: string;
  nome: string | null;
  statusAssinatura?: string | null;
}

export function BotaoImpersonar({ userId, email, nome, statusAssinatura }: Props) {
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const rotulo = nome ?? email;
  const planoRuim = statusAssinatura === "expired" || statusAssinatura === "canceled";

  async function entrar() {
    setEnviando(true);
    setErro(null);

    const res = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    }).catch(() => null);

    if (!res) {
      setEnviando(false);
      setErro("Erro ao iniciar impersonação");
      return;
    }

    if (res.ok) {
      const data = (await res.json().catch(() => null)) as { redirectTo?: string } | null;
      // NAVEGAÇÃO DURA, jamais router.push: o SessionProvider está com
      // refetchInterval={0} e refetchOnWindowFocus={false} (providers.tsx), e
      // sem reload o cliente continuaria com a sessão antiga e sem banner.
      window.location.assign(data?.redirectTo ?? "/dashboard");
      return;
    }

    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    setEnviando(false);

    if (res.status === 401) setErro("Sessão de admin expirada — faça login novamente");
    else if (res.status === 404) setErro("Usuário não encontrado");
    else if (res.status === 409) setErro(data?.error ?? "Impersonação já ativa");
    else if (res.status === 429) setErro("Muitas tentativas, aguarde");
    else if (res.status === 503) setErro("Não foi possível registrar a auditoria — impersonação cancelada");
    else setErro("Erro ao iniciar impersonação");
  }

  if (!confirmando) {
    return (
      <div className="space-y-2">
        <button
          onClick={() => { setErro(null); setConfirmando(true); }}
          className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all"
        >
          <Eye size={14} />
          Entrar como este usuário
        </button>
        {erro && (
          <p className="text-[11px] text-red-400 flex items-center gap-1.5">
            <AlertTriangle size={12} /> {erro}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-900/60 border border-amber-500/30 rounded-2xl p-4 space-y-3 max-w-md">
      <p className="text-xs text-slate-300 leading-relaxed">
        Você vai navegar o Dashfy como {rotulo} ({email}) em modo SOMENTE LEITURA. Nenhuma alteração
        pode ser feita. A sessão expira em 30 minutos e o acesso fica registrado no histórico desta
        conta.
      </p>

      {planoRuim && (
        <p className="text-[11px] text-amber-400 leading-relaxed flex items-start gap-1.5">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          Atenção: o plano deste usuário está {statusAssinatura} — as telas de métricas vão responder
          402. Isso é o estado real da conta, não um erro da impersonação.
        </p>
      )}

      {erro && (
        <p className="text-[11px] text-red-400 flex items-center gap-1.5">
          <AlertTriangle size={12} /> {erro}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => setConfirmando(false)}
          disabled={enviando}
          className="text-xs font-medium text-slate-400 hover:text-slate-200 px-3 py-2 rounded-lg transition-colors disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          onClick={entrar}
          disabled={enviando}
          className={cn(
            "flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all"
          )}
        >
          {enviando ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
          Entrar como {rotulo}
        </button>
      </div>
    </div>
  );
}
