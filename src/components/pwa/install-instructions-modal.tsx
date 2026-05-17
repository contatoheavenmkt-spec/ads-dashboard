"use client";

import { Info, Smartphone, Apple, ExternalLink } from "lucide-react";

interface InstallInstructionsModalProps {
  onClose: () => void;
}

/**
 * Modal explicando como instalar o app manualmente quando o browser não
 * dispara o evento `beforeinstallprompt`. Casos:
 *   - Chrome desktop: precisa de critério de engagement antes do prompt
 *   - Safari iOS: não tem prompt automático, instalação é via "Compartilhar"
 *   - Browsers fora do Chromium: não suportam install prompt
 *
 * Usado tanto na página /perfil quanto no header da dash do cliente final.
 */
export function InstallInstructionsModal({ onClose }: InstallInstructionsModalProps) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-950 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full p-5 sm:p-6"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Info size={18} className="text-blue-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-white mb-1">Como instalar o app</h2>
            <p className="text-xs text-slate-400">Siga as instruções do seu dispositivo.</p>
          </div>
        </div>

        <div className="space-y-4">
          <InstructionBlock title="Chrome / Edge (desktop)" icon={<ExternalLink size={14} />}>
            Abra o menu do navegador (⋮) → <strong>Instalar Dashfy</strong>. Se não aparecer, use a Dashfy por alguns minutos e tente de novo — o navegador precisa identificar uso recorrente.
          </InstructionBlock>
          <InstructionBlock title="Android (Chrome)" icon={<Smartphone size={14} />}>
            Menu (⋮) → <strong>Adicionar à tela inicial</strong> ou <strong>Instalar app</strong>.
          </InstructionBlock>
          <InstructionBlock title="iPhone / iPad (Safari)" icon={<Apple size={14} />}>
            Toque no botão <strong>Compartilhar</strong> (□↑) → <strong>Adicionar à Tela de Início</strong>.
          </InstructionBlock>
        </div>

        <button
          onClick={onClose}
          className="mt-5 w-full px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}

function InstructionBlock({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-slate-800 rounded-xl p-3 bg-slate-900/40">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-slate-500">{icon}</span>
        <h4 className="text-xs font-bold text-white uppercase tracking-wider">{title}</h4>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">{children}</p>
    </div>
  );
}
