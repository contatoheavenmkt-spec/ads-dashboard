"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (next !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    if (next.length < 6) {
      setError("A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Erro ao trocar senha.");
        setLoading(false);
        return;
      }
      // Força relogin para gerar JWT novo (com forcePasswordChange=false e role atualizado).
      await signOut({ callbackUrl: "/login?changed=1" });
    } catch {
      setError("Erro de conexão.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <PasswordField
        label="Senha atual"
        value={current}
        onChange={setCurrent}
        show={showCurrent}
        onToggle={() => setShowCurrent((v) => !v)}
        autoFocus
      />
      <PasswordField
        label="Nova senha"
        value={next}
        onChange={setNext}
        show={showNext}
        onToggle={() => setShowNext((v) => !v)}
        minLength={6}
      />
      <PasswordField
        label="Confirme a nova senha"
        value={confirm}
        onChange={setConfirm}
        show={showConfirm}
        onToggle={() => setShowConfirm((v) => !v)}
        minLength={6}
      />

      {error && (
        <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 font-medium">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className={cn(
          "w-full rounded-xl text-sm font-bold py-3 transition-all flex items-center justify-center gap-2",
          "bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        {loading && <Loader2 size={14} className="animate-spin" />}
        {loading ? "Salvando..." : "Trocar senha"}
      </button>
    </form>
  );
}

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  autoFocus?: boolean;
  minLength?: number;
}

function PasswordField({ label, value, onChange, show, onToggle, autoFocus, minLength }: PasswordFieldProps) {
  return (
    <div>
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          autoFocus={autoFocus}
          minLength={minLength}
          className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 pr-11 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-slate-500 hover:text-slate-300 transition-colors"
          aria-label={show ? "Esconder senha" : "Mostrar senha"}
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}
