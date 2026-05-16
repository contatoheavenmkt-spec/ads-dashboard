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
    // Quem instala o app provavelmente quer receber notificações também.
    // Dispara o subscribe em background — se permissão for negada, falha
    // silenciosa (banner de notificação ainda aparece pra próxima tentativa).
    subscribeToPush().catch(() => {});
  });
}

function urlBase64ToBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

/**
 * Pede permissão de notificação, cria a subscription via PushManager e
 * registra no backend. Retorna true se finalizou com sucesso. Idempotente:
 * se já está subscrito (mesmo endpoint), o backend faz upsert.
 *
 * Usado em 3 lugares:
 *   - banner NotificationOptIn (após user clicar "Ativar")
 *   - botão da /perfil (após user clicar "Ativar")
 *   - automaticamente após o evento `appinstalled` do PWA
 */
export async function subscribeToPush(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const keyRes = await fetch("/api/notifications/vapid-public-key");
  if (!keyRes.ok) return false;
  const { publicKey } = (await keyRes.json()) as { publicKey: string };

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToBuffer(publicKey),
  });

  const json = sub.toJSON();
  const res = await fetch("/api/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      userAgent: navigator.userAgent,
    }),
  });
  return res.ok;
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
