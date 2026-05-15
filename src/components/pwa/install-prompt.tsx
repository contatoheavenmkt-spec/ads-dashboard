"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Tipo do evento que o navegador dispara em browsers compatíveis com PWA.
// Não está no lib.dom.d.ts, então declaramos a interface mínima.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISS_KEY = "dashfy.pwa.installDismissed";
// Quanto tempo após dismiss não mostramos de novo. Usuário pode mudar de ideia,
// então não some pra sempre; aparece de novo após 30 dias.
const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS expõe via navigator.standalone (legado, fora do tipo padrão).
  return Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

function dismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!ts || isNaN(ts)) return false;
    return Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || dismissedRecently()) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => {
      setVisible(false);
      setDeferred(null);
    };
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  async function handleInstall() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") {
      setVisible(false);
      setDeferred(null);
    } else {
      handleDismiss();
    }
  }

  function handleDismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Se localStorage falhar (modo privado), o banner reaparece no próximo
      // load — comportamento aceitável.
    }
    setVisible(false);
    setDeferred(null);
  }

  if (!visible || !deferred) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-[200] max-w-sm",
        "bg-slate-950/95 backdrop-blur-xl border border-slate-700 rounded-xl shadow-2xl",
        "p-4 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300",
      )}
    >
      <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 shrink-0">
        <Download size={18} className="text-blue-400" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-bold text-white mb-0.5">Baixar app Dashfy</h3>
        <p className="text-[11px] text-slate-400 leading-tight mb-3">
          Acesse mais rápido pela sua tela inicial, sem precisar abrir o navegador.
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleInstall}
            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
          >
            Baixar
          </button>
          <button
            onClick={handleDismiss}
            className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
          >
            Agora não
          </button>
        </div>
      </div>
      <button
        onClick={handleDismiss}
        className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors shrink-0"
        aria-label="Fechar"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/**
 * Registra o service worker. Chamado uma vez no client. Falha silenciosa se
 * o browser não suportar (Safari < 11.1, modo privado em alguns).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Falha aqui não compromete uso normal — só desabilita PWA/push.
    });
  }, []);
  return null;
}
