"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { subscribeToPush } from "./pwa-store";

const DISMISS_KEY = "dashfy.push.dismissed";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // mostra de novo após 7 dias

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

/**
 * Banner pedindo permissão de push. Só aparece se:
 *   - browser suporta SW + Push
 *   - permissão atual é "default" (nunca decidiu) — `granted` e `denied`
 *     não mostram porque ou já tá ativo ou foi negado conscientemente
 *   - não dismissou nos últimos 7 dias
 */
export function NotificationOptIn() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission !== "default") return;
    if (dismissedRecently()) return;

    // Pequeno delay pra não competir com o InstallPrompt no momento do load.
    const t = setTimeout(() => setVisible(true), 4000);
    return () => clearTimeout(t);
  }, []);

  async function handleEnable() {
    setLoading(true);
    try {
      const ok = await subscribeToPush();
      if (!ok && Notification.permission === "denied") markDismissed();
      setVisible(false);
    } catch (err) {
      console.error("[push] subscribe failed", err);
      markDismissed();
      setVisible(false);
    } finally {
      setLoading(false);
    }
  }

  function markDismissed() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // localStorage indisponível — banner aparece de novo no próximo load.
    }
  }

  function handleDismiss() {
    markDismissed();
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 left-4 z-[199] max-w-sm",
        "bg-slate-950/95 backdrop-blur-xl border border-slate-700 rounded-xl shadow-2xl",
        "p-4 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300",
      )}
    >
      <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 shrink-0">
        <Bell size={18} className="text-blue-400" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-bold text-white mb-0.5">Receber notificações</h3>
        <p className="text-[11px] text-slate-400 leading-tight mb-3">
          Avisamos quando campanhas mudarem, saldo acabar e o resumo do dia.
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleEnable}
            disabled={loading}
            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
          >
            {loading ? "Ativando..." : "Ativar"}
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
