"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

function getOrCreateSessionId(): string {
  try {
    let sid = localStorage.getItem("_sid");
    if (!sid) {
      sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("_sid", sid);
    }
    return sid;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

/**
 * Rotas que NÃO entram na telemetria.
 *
 * O painel administrativo mede o tráfego do produto — se ele contar as próprias
 * visitas, o operador aparece nos números que está lendo. Com uma base pequena
 * a distorção é enorme: navegar por 6 telas do admin gera 6 PageViews e mantém
 * uma ActiveSession, inflando "visualizações hoje", "visitantes únicos",
 * "ativos agora" e empurrando /admin para o topo das páginas mais vistas.
 *
 * O `<Tracker />` fica montado no layout RAIZ (src/app/layout.tsx), então esta
 * é a única barreira — não há um layout intermediário onde ele possa deixar de
 * existir sem tirá-lo do site inteiro.
 */
const ROTAS_SEM_TELEMETRIA = ["/admin"];

function deveRastrear(pathname: string | null): boolean {
  if (!pathname) return false;
  return !ROTAS_SEM_TELEMETRIA.some(
    (prefixo) => pathname === prefixo || pathname.startsWith(`${prefixo}/`),
  );
}

export function Tracker() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const sessionIdRef = useRef<string | null>(null);
  // Navegar impersonado gravaria PageView e ActiveSession com o userId do
  // ALVO, inflando "ativos agora", "último acesso" e o mapa de presença —
  // exatamente os números que o dono lê em /admin.
  const impersonando = !!(session?.user as { impersonatedBy?: string } | undefined)?.impersonatedBy;
  const rastrear = deveRastrear(pathname) && !impersonando;

  useEffect(() => {
    sessionIdRef.current = getOrCreateSessionId();
  }, []);

  useEffect(() => {
    const sid = sessionIdRef.current;
    if (!sid || !rastrear) return;
    const userId = (session?.user as { id?: string } | undefined)?.id ?? undefined;

    fetch("/api/track/pageview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pathname, sessionId: sid, referrer: document.referrer || null, userId }),
    }).catch(() => {});
  }, [pathname, session, rastrear]);

  useEffect(() => {
    const sid = sessionIdRef.current;
    // Sem heartbeat no admin também: ele é o que mantém a linha em
    // ActiveSession viva, alimentando "ativos agora" e o mapa de presença.
    if (!sid || !rastrear) return;

    const interval = setInterval(() => {
      const userId = (session?.user as { id?: string } | undefined)?.id ?? undefined;
      fetch("/api/track/heartbeat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sid, path: window.location.pathname, userId }),
      }).catch(() => {});
    }, 30000);

    return () => clearInterval(interval);
  }, [session, rastrear]);

  // Captura de ERRO continua ativa no admin, de propósito e sem `rastrear`.
  // O que polui a analytics é contar acesso do operador como se fosse tráfego
  // do produto; um erro de JavaScript no painel é justamente o que se quer
  // saber, e o ErrorLog é uma tabela separada que não alimenta nenhuma métrica
  // de audiência.
  useEffect(() => {
    const sid = sessionIdRef.current ?? "";

    function handleError(event: ErrorEvent) {
      fetch("/api/track/error", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: window.location.pathname,
          errorType: event.error?.name ?? "Error",
          errorMessage: event.message,
          stackTrace: event.error?.stack ?? null,
          sessionId: sid,
        }),
      }).catch(() => {});
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      fetch("/api/track/error", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: window.location.pathname,
          errorType: "UnhandledRejection",
          errorMessage: String(event.reason),
          stackTrace: event.reason?.stack ?? null,
          sessionId: sid,
        }),
      }).catch(() => {});
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}
