"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

function formatarRestante(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(total / 60);
  const seg = total % 60;
  return `${String(min).padStart(2, "0")}:${String(seg).padStart(2, "0")}`;
}

/**
 * Barra fixa exibida enquanto a sessão for impersonada.
 *
 * Fica montada no layout RAIZ, dentro de <Providers>, e usa useSession() — o
 * <Tracker /> já dispara a mesma chamada na mesma árvore, então a cobertura é
 * de 100% das rotas logadas com custo zero de request adicional e sem tornar
 * dinâmica nenhuma página pública.
 */
export function ImpersonationBanner() {
  const { data: session } = useSession();
  const imp = session?.user?.impersonatedBy;
  const until = session?.user?.impersonatedUntil;
  const email = session?.user?.email;

  const [restante, setRestante] = useState<number>(() =>
    typeof until === "number" ? until - Date.now() : 0
  );

  // Empurra o conteúdo para baixo enquanto a impersonação durar. É isto que
  // impede a barra fixa de cobrir a sidebar nos layouts `h-screen`; o cleanup
  // devolve o padding, então nada sobra depois de encerrar.
  useEffect(() => {
    if (!imp) return;
    document.body.style.paddingTop = "44px";
    return () => {
      document.body.style.paddingTop = "";
    };
  }, [imp]);

  // Prefixo no título da aba: sobrevive a modais e telas cheias, onde uma barra
  // sozinha some do campo de visão.
  useEffect(() => {
    if (!imp) return;
    const original = document.title;
    document.title = `[IMPERSONANDO] ${original}`;
    return () => {
      document.title = original;
    };
  }, [imp]);

  // Contagem regressiva: ao zerar, sai sozinho pela rota de saída.
  useEffect(() => {
    if (!imp || typeof until !== "number") return;

    const id = setInterval(() => {
      const falta = until - Date.now();
      setRestante(falta);
      if (falta <= 0) {
        clearInterval(id);
        window.location.assign("/api/admin/impersonate/exit?motivo=expirada");
      }
    }, 1000);

    return () => clearInterval(id);
  }, [imp, until]);

  if (!imp) return null;

  return (
    <>
      <div className="fixed top-0 inset-x-0 h-11 z-[100] flex items-center justify-between gap-3 px-4 bg-amber-500 text-amber-950 text-xs font-bold">
        <span className="truncate">
          MODO ADMIN — você está vendo o Dashfy como {email} · SOMENTE LEITURA · expira em{" "}
          {formatarRestante(restante)}
        </span>

        {/*
          OBRIGATORIAMENTE um <a href> GET, nunca button + fetch: quando a
          impersonação mais precisa acabar (tela do cliente com 402, erro de
          render, JS morto) é exatamente quando um fetch não responde. Um link
          sai em qualquer cenário, inclusive digitado na barra de endereços.
        */}
        <a
          href="/api/admin/impersonate/exit?motivo=manual"
          className="shrink-0 bg-amber-950 text-amber-50 px-3 py-1.5 rounded-lg hover:bg-amber-900 transition-colors"
        >
          Encerrar e voltar ao painel
        </a>
      </div>

      {/* Moldura permanente — visível mesmo com modal aberto por cima da barra. */}
      <div
        className="fixed inset-0 ring-4 ring-inset ring-amber-500/70 pointer-events-none z-[99]"
        aria-hidden
      />
    </>
  );
}
