"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import {
  UserCircle, Bell, BellOff, Download, KeyRound, CreditCard, LogOut,
  Check, Smartphone, ChevronRight, Info, Loader2, Apple, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Header } from "@/components/layout/header";
import { triggerInstall, usePwaState, subscribeToPush } from "@/components/pwa/pwa-store";

interface UserInfo {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
}

interface SubscriptionInfo {
  plan: string;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  accountsLimit: number;
}

interface ProfileClientProps {
  user: UserInfo;
  subscription: SubscriptionInfo | null;
}

const PLAN_LABELS: Record<string, string> = {
  trial: "Trial",
  start: "Start",
  plus: "Plus",
  premium: "Premium",
};

export function ProfileClient({ user, subscription }: ProfileClientProps) {
  const { canInstall, isInstalled } = usePwaState();
  const [notifEnabled, setNotifEnabled] = useState<boolean | null>(null);
  const [notifBusy, setNotifBusy] = useState(false);
  const [installModal, setInstallModal] = useState(false);

  // Carrega status atual das notificações
  useEffect(() => {
    fetch("/api/notifications/status")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((data) => setNotifEnabled(Boolean(data.enabled)))
      .catch(() => setNotifEnabled(false));
  }, []);

  async function enableNotifications() {
    setNotifBusy(true);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        alert("Seu navegador não suporta notificações push. Use Chrome/Edge desktop ou Android.");
        return;
      }
      const ok = await subscribeToPush();
      if (ok) {
        setNotifEnabled(true);
      } else if (Notification.permission === "denied") {
        alert("Permissão negada. Para ativar, vá em Configurações do site no seu navegador.");
      }
    } catch (err) {
      console.error("[profile] enable notifications failed", err);
    } finally {
      setNotifBusy(false);
    }
  }

  async function disableNotifications() {
    setNotifBusy(true);
    try {
      if (!("serviceWorker" in navigator)) return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/notifications/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setNotifEnabled(false);
    } finally {
      setNotifBusy(false);
    }
  }

  async function handleInstall() {
    if (canInstall) {
      const outcome = await triggerInstall();
      if (outcome === null) setInstallModal(true);
    } else {
      // Sem evento beforeinstallprompt — mostra instruções manuais por OS.
      setInstallModal(true);
    }
  }

  const planLabel = subscription ? PLAN_LABELS[subscription.plan] ?? subscription.plan : "Sem assinatura";
  const isTrial = subscription?.status === "trialing";

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header title="Perfil" subtitle="Sua conta e preferências" />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">

        {/* Cabeçalho do user */}
        <div className="glass-panel rounded-2xl p-5 sm:p-6 flex items-center gap-4">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-blue-500/30 to-blue-700/20 border border-blue-500/30 flex items-center justify-center shrink-0">
            <UserCircle size={40} className="text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-white truncate">
              {user.name || user.email.split("@")[0]}
            </h2>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/15 text-blue-300 border border-blue-500/30">
                {user.role === "AGENCY" ? "Agência" : "Cliente"}
              </span>
              {subscription && (
                <span className={cn(
                  "inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                  isTrial
                    ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                    : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
                )}>
                  Plano {planLabel}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* App PWA */}
        <SectionCard icon={<Smartphone size={18} className="text-blue-400" />} title="App Dashfy">
          {isInstalled ? (
            <div className="flex items-center gap-2 text-sm text-emerald-400 font-medium">
              <Check size={16} />
              App já instalado neste dispositivo
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                Acesse a Dashfy direto da tela inicial, em tela cheia, sem precisar abrir o navegador. Funciona offline pras telas já carregadas.
              </p>
              <button
                onClick={handleInstall}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
              >
                <Download size={16} />
                {canInstall ? "Baixar app" : "Como baixar"}
              </button>
            </>
          )}
        </SectionCard>

        {/* Notificações */}
        <SectionCard
          icon={notifEnabled ? <Bell size={18} className="text-blue-400" /> : <BellOff size={18} className="text-slate-500" />}
          title="Notificações push"
        >
          <p className="text-xs text-slate-400 mb-3 leading-relaxed">
            Receba avisos de campanhas iniciando/pausando, saldo acabando e o resumo do dia direto neste dispositivo.
          </p>
          {notifEnabled === null ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 size={12} className="animate-spin" />
              Carregando...
            </div>
          ) : notifEnabled ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm text-emerald-400 font-medium">
                <Check size={16} />
                Notificações ativadas
              </div>
              <button
                onClick={disableNotifications}
                disabled={notifBusy}
                className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-xs font-medium transition-colors"
              >
                {notifBusy ? "..." : "Desativar"}
              </button>
            </div>
          ) : (
            <button
              onClick={enableNotifications}
              disabled={notifBusy}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              <Bell size={16} />
              {notifBusy ? "Ativando..." : "Ativar notificações"}
            </button>
          )}
        </SectionCard>

        {/* Plano */}
        <Link href="/dashboard/billing" className="block">
          <SectionCard
            icon={<CreditCard size={18} className="text-emerald-400" />}
            title="Plano e cobrança"
            arrow
          >
            <p className="text-xs text-slate-400 leading-relaxed">
              {subscription ? (
                <>
                  Você está no plano <span className="text-white font-semibold">{planLabel}</span>
                  {isTrial && subscription.trialEndsAt && (
                    <> — trial até {new Date(subscription.trialEndsAt).toLocaleDateString("pt-BR")}</>
                  )}
                  . Limite de {subscription.accountsLimit} contas conectadas.
                </>
              ) : (
                "Veja os planos disponíveis e faça upgrade."
              )}
            </p>
          </SectionCard>
        </Link>

        {/* Trocar senha */}
        <Link href="/account/change-password" className="block">
          <SectionCard
            icon={<KeyRound size={18} className="text-amber-400" />}
            title="Trocar senha"
            arrow
          >
            <p className="text-xs text-slate-400 leading-relaxed">
              Atualize sua senha de acesso.
            </p>
          </SectionCard>
        </Link>

        {/* Sair */}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full glass-panel rounded-2xl p-4 sm:p-5 flex items-center gap-3 hover:bg-slate-900/40 transition-colors text-left group"
        >
          <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
            <LogOut size={18} className="text-rose-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-white">Sair</h3>
            <p className="text-xs text-slate-400">Encerrar sessão neste dispositivo</p>
          </div>
        </button>

      </div>

      {installModal && (
        <InstallInstructionsModal onClose={() => setInstallModal(false)} />
      )}
    </div>
  );
}

interface SectionCardProps {
  icon: React.ReactNode;
  title: string;
  arrow?: boolean;
  children: React.ReactNode;
}

function SectionCard({ icon, title, arrow, children }: SectionCardProps) {
  return (
    <div className="glass-panel rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60">
            {icon}
          </div>
          <h3 className="text-sm font-bold text-white">{title}</h3>
        </div>
        {arrow && <ChevronRight size={16} className="text-slate-600" />}
      </div>
      <div>{children}</div>
    </div>
  );
}

function InstallInstructionsModal({ onClose }: { onClose: () => void }) {
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

function InstructionBlock({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
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
