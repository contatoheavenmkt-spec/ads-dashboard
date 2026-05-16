"use client";

import { useEffect, useState } from "react";

// Tipo do evento que o navegador dispara em browsers compatíveis com PWA.
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

// Store singleton em memória. `beforeinstallprompt` dispara UMA vez na vida da
// página — se múltiplos componentes querem reagir (ex.: banner automático +
// botão "Baixar app" na página /perfil), todos consomem desse store em vez de
// instalar listeners próprios (segundo listener nunca veria o evento).
let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  return Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

// Inicializa os listeners uma vez no client. Chamado pelo ServiceWorkerRegister.
let initialized = false;
export function initPwaStore() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  if (isStandalone()) {
    installed = true;
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    notify();
  });
}

export interface PwaState {
  /** Pode disparar o prompt nativo agora. */
  canInstall: boolean;
  /** Já está instalado (rodando em display-mode standalone). */
  isInstalled: boolean;
}

/**
 * Hook que reflete o estado atual do PWA install. Atualiza quando o evento
 * `beforeinstallprompt` ou `appinstalled` dispara.
 */
export function usePwaState(): PwaState {
  const [state, setState] = useState<PwaState>(() => ({
    canInstall: deferred !== null,
    isInstalled: installed,
  }));

  useEffect(() => {
    const update = () =>
      setState({ canInstall: deferred !== null, isInstalled: installed });
    listeners.add(update);
    // Sincroniza ao montar caso o evento já tenha disparado antes.
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);

  return state;
}

/**
 * Dispara o prompt nativo de instalação. Retorna outcome ou null se não há
 * prompt diferido disponível (browser não suporta ou evento ainda não disparou).
 */
export async function triggerInstall(): Promise<"accepted" | "dismissed" | null> {
  if (!deferred) return null;
  try {
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") {
      deferred = null;
      notify();
    }
    return choice.outcome;
  } catch {
    return null;
  }
}
