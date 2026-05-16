"use client";

import { useState } from "react";
import { Calendar, X } from "lucide-react";

interface DateRangeModalProps {
  /** Range inicial (pré-preenche os inputs ao reabrir). */
  initial?: { since: string; until: string } | null;
  onClose: () => void;
  onApply: (range: { since: string; until: string }) => void;
}

function todayIso(): string {
  const now = new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function isoDaysAgo(n: number): string {
  const t = todayIso();
  const [y, m, d] = t.split("-").map(Number);
  const ref = new Date(Date.UTC(y, m - 1, d));
  ref.setUTCDate(ref.getUTCDate() - n);
  return ref.toISOString().slice(0, 10);
}

export function DateRangeModal({ initial, onClose, onApply }: DateRangeModalProps) {
  const today = todayIso();
  const [since, setSince] = useState(initial?.since ?? isoDaysAgo(29));
  const [until, setUntil] = useState(initial?.until ?? today);
  const [error, setError] = useState<string | null>(null);

  function handleApply() {
    if (!since || !until) {
      setError("Selecione data inicial e final.");
      return;
    }
    if (since > until) {
      setError("Data inicial não pode ser depois da final.");
      return;
    }
    const diffMs = Date.parse(`${until}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > 366) {
      setError("Intervalo máximo é 1 ano.");
      return;
    }
    onApply({ since, until });
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-950 border border-slate-700 rounded-2xl shadow-2xl max-w-sm w-full p-5"
      >
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Calendar size={18} className="text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white mb-0.5">Período personalizado</h2>
              <p className="text-xs text-slate-400">Escolha as datas exatas que quer analisar.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
              Data inicial
            </label>
            <input
              type="date"
              value={since}
              max={until || today}
              onChange={(e) => { setSince(e.target.value); setError(null); }}
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
              Data final
            </label>
            <input
              type="date"
              value={until}
              min={since}
              max={today}
              onChange={(e) => { setUntil(e.target.value); setError(null); }}
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {[
              { label: "Últimos 7 dias", since: isoDaysAgo(6), until: today },
              { label: "Mês anterior", since: previousMonth(today).since, until: previousMonth(today).until },
              { label: "Este mês", since: thisMonthStart(today), until: today },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => { setSince(p.since); setUntil(p.until); setError(null); }}
                className="px-2.5 py-1 rounded-full text-[10px] font-bold text-slate-400 hover:text-blue-400 bg-slate-800/60 hover:bg-blue-500/10 border border-slate-700 hover:border-blue-500/30 transition-colors uppercase tracking-wider"
              >
                {p.label}
              </button>
            ))}
          </div>

          {error && (
            <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 font-medium">
              {error}
            </p>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleApply}
            className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}

function thisMonthStart(todayStr: string): string {
  const [y, m] = todayStr.split("-");
  return `${y}-${m}-01`;
}

function previousMonth(todayStr: string): { since: string; until: string } {
  const [y, m] = todayStr.split("-").map(Number);
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  const mm = String(prevMonth).padStart(2, "0");
  const dd = String(lastDay).padStart(2, "0");
  return {
    since: `${prevYear}-${mm}-01`,
    until: `${prevYear}-${mm}-${dd}`,
  };
}
