"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Link2,
  Loader2,
  LogIn,
  Plus,
  Trash2,
  UserCheck,
  ArrowRight,
  PlayCircle,
} from "lucide-react";

function FacebookIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

interface Integration {
  id: string;
  platform: string;
  adAccountId: string;
  name: string;
  bmId: string | null;
  bmName: string | null;
  status: string;
}

interface MetaAdAccount {
  id: string;
  name: string;
  business?: { id: string; name: string };
  account_status: number;
}

interface MetaBM {
  id: string;
  name: string;
  platform: "meta";
  accounts: MetaAdAccount[];
}

interface MetaConn {
  id: string;
  name: string | null;
  fbUserId: string;
}

export default function IntegracoesPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [bms, setBms] = useState<MetaBM[]>([]);
  const [connections, setConnections] = useState<MetaConn[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(true);
  const [loadingBms, setLoadingBms] = useState(true);
  const [bmsError, setBmsError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<{
    connected: boolean;
    email: string | null;
    isExpired?: boolean;
  } | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleAccounts, setGoogleAccounts] = useState<{ customerId: string; name: string; isManager: boolean; currency: string }[]>([]);
  const [googleAccountsLoading, setGoogleAccountsLoading] = useState(false);
  const [googleAccountsError, setGoogleAccountsError] = useState<string | null>(null);
  const [connectingGoogle, setConnectingGoogle] = useState<string | null>(null);

  async function loadGoogleAccounts() {
    setGoogleAccountsLoading(true);
    setGoogleAccountsError(null);
    try {
      const r = await fetch("/api/google/accounts");
      const data = await r.json();
      if (data.error === "NO_TOKEN" || data.error === "RECONNECT") {
        setGoogleAccounts([]);
        setGoogleAccountsError(data.message || (data.error === "NO_TOKEN" ? "Conecte sua conta Google primeiro" : data.message));
      } else if (data.error) {
        setGoogleAccountsError(data.error);
      } else {
        setGoogleAccounts(data.accounts ?? []);
      }
    } catch {
      setGoogleAccountsError("Erro ao carregar contas Google Ads");
    }
    setGoogleAccountsLoading(false);
  }

  useEffect(() => {
    // Check onboarding status and connected accounts
    Promise.all([
      fetch("/api/onboarding/status").then(r => r.json()),
      fetch("/api/connections/status").then(r => r.json()),
      fetch("/api/auth/google/status").then(r => r.json()),
    ]).then(([onboardingData, connectionsData, googleData]) => {
      const connectedCount = connectionsData?.connectedCount ?? 0;

      if (connectedCount === 0 || !onboardingData.onboardingCompleted) {
        setShowWelcomeBanner(true);
      }

      setGoogleStatus(googleData);
      if (googleData?.connected) {
        loadGoogleAccounts();
      }
    }).catch(() => null);
  }, []);

  function openGoogleOAuth() {
    setGoogleLoading(true);
    const w = 600, h = 700;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;

    const popup = window.open(
      "/api/auth/google/start", "google-oauth",
      `width=${w},height=${h},left=${left},top=${top},scrollbars=yes`
    );

    function onMessage(e: MessageEvent) {
      if (e.data?.type === "GOOGLE_AUTH_SUCCESS") {
        window.removeEventListener("message", onMessage);
        setGoogleLoading(false);
        popup?.close();
        fetch("/api/auth/google/status").then(r => r.json()).then((data) => {
          setGoogleStatus(data);
          if (data?.connected) loadGoogleAccounts();
        });
      } else if (e.data?.type === "GOOGLE_AUTH_ERROR") {
        window.removeEventListener("message", onMessage);
        setGoogleLoading(false);
        console.error("Erro na autenticação Google:", e.data.message);
      }
    }
    window.addEventListener("message", onMessage);

    const timer = setInterval(() => {
      if (popup?.closed) {
        clearInterval(timer);
        window.removeEventListener("message", onMessage);
        setGoogleLoading(false);
        fetch("/api/auth/google/status").then(r => r.json()).then((data) => {
          setGoogleStatus(data);
          if (data?.connected) loadGoogleAccounts();
        });
      }
    }, 500);
  }

  async function disconnectGoogle() {
    if (!googleStatus?.email) return;

    if (confirm("Deseja realmente desconectar sua conta Google?")) {
      await fetch("/api/auth/google/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: googleStatus.email }),
      });
      setGoogleStatus({ connected: false, email: null });
    }
  }


  async function connectGoogle(account: { customerId: string; name: string }) {
    setConnectingGoogle(account.customerId);
    const res = await fetch("/api/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: "google",
        adAccountId: account.customerId,
        name: account.name,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setGoogleAccountsError(err.error ?? `Erro ${res.status} ao adicionar conta`);
    } else {
      setGoogleAccountsError(null);
    }
    await loadIntegrations();
    setConnectingGoogle(null);
  }

  async function loadIntegrations() {
    const r = await fetch("/api/integrations");
    const data = await r.json();
    setIntegrations(data);
    setLoadingIntegrations(false);
  }

  async function loadAccounts() {
    setLoadingBms(true);
    setBmsError(null);
    const r = await fetch("/api/meta/accounts");
    const data = await r.json();
    if (data.error === "NO_TOKEN") {
      setBmsError("NO_TOKEN");
    } else if (data.error) {
      setBmsError(data.error);
    } else {
      setBms(data.bms ?? []);
      setConnections(data.connections ?? []);
    }
    setLoadingBms(false);
  }

  useEffect(() => {
    loadIntegrations();
    loadAccounts();
  }, []);

  function openMetaOAuth() {
    setOauthLoading(true);
    const w = 600, h = 700;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;

    const popup = window.open(
      "/api/meta/oauth/start", "meta-oauth",
      `width=${w},height=${h},left=${left},top=${top},scrollbars=yes`
    );

    function onMessage(e: MessageEvent) {
      if (e.data?.type === "META_AUTH_SUCCESS") {
        window.removeEventListener("message", onMessage);
        setOauthLoading(false);
        popup?.close();
        loadAccounts();
      } else if (e.data?.type === "META_AUTH_ERROR") {
        window.removeEventListener("message", onMessage);
        setOauthLoading(false);
        setBmsError(e.data.message ?? "Erro na autenticação");
      }
    }
    window.addEventListener("message", onMessage);

    const timer = setInterval(() => {
      if (popup?.closed) {
        clearInterval(timer);
        window.removeEventListener("message", onMessage);
        setOauthLoading(false);
        loadAccounts();
      }
    }, 500);
  }

  async function disconnectMeta(connId: string) {
    await fetch(`/api/meta/connections/${connId}`, { method: "DELETE" });
    loadAccounts();
  }

  async function connect(account: MetaAdAccount, bm: MetaBM) {
    setConnecting(account.id);
    const res = await fetch("/api/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: "meta",
        adAccountId: account.id,
        name: account.name,
        bmId: bm.id !== "sem-bm" ? bm.id : null,
        bmName: bm.id !== "sem-bm" ? bm.name : null,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setBmsError(err.error ?? `Erro ${res.status} ao adicionar conta`);
    } else {
      setBmsError(null);
    }
    await loadIntegrations();
    setConnecting(null);
  }

  async function disconnect(id: string) {
    await fetch(`/api/integrations/${id}`, { method: "DELETE" });
    await loadIntegrations();
  }

  const connectedAccountIds = new Set(integrations.map((i) => i.adAccountId));

  const accountStatusLabel = (status: number) => {
    if (status === 1) return null;
    if (status === 2) return "Desabilitada";
    if (status === 3) return "Inadimplente";
    if (status === 7) return "Arquivada";
    return "Inativa";
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header
        title="Integrações"
        subtitle="Plataformas | Conecte contas de anúncios"
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Welcome Banner - First Time or No Accounts */}
        {showWelcomeBanner && (
          <div className="glass-panel rounded-2xl p-6 bg-gradient-to-br from-blue-600/10 to-indigo-600/10 border border-blue-500/30">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-600/20 rounded-xl flex items-center justify-center shrink-0 border border-blue-500/30">
                <PlayCircle size={24} className="text-blue-400" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h2 className="text-sm font-black text-white uppercase tracking-tight">Comece por aqui!</h2>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Assista ao tutorial rápido e aprenda a conectar suas contas de anúncios em poucos minutos.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/integracoes/onboarding"
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all active:scale-95 shadow-lg shadow-blue-500/20"
                  >
                    <PlayCircle size={14} />
                    Ver tutorial
                  </Link>
                  <button
                    onClick={() => setShowWelcomeBanner(false)}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs px-4 py-2.5 rounded-xl transition-all border border-slate-700"
                  >
                    Já conheço a plataforma
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Contas ativas no dashboard */}
        {!loadingIntegrations && integrations.length > 0 && (
          <div className="glass-panel rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              <h2 className="text-xs font-black text-slate-200 uppercase tracking-widest">
                Contas no Dashboard
              </h2>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                {integrations.length} ATIVAS
              </span>
            </div>
            <div className="space-y-2">
              {integrations.map((integration) => (
                <div key={integration.id} className="flex items-center justify-between p-3 bg-slate-800/40 rounded-xl border border-slate-700/50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center border border-blue-500/20">
                      <span className="text-xs font-black text-blue-400">{integration.platform === "google" ? "G" : "M"}</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-100">{integration.name}</p>
                      <p className="text-[10px] text-slate-500">
                        {integration.bmName ? `${integration.bmName} · ` : ""}{integration.adAccountId}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase">Ativo</span>
                    <button
                      onClick={() => disconnect(integration.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Meta Ads Section */}
        <div className="glass-panel rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#1877F2]/20 rounded-lg flex items-center justify-center border border-[#1877F2]/30">
                <FacebookIcon size={16} />
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-100 uppercase tracking-tight">Meta Ads</h2>
                {connections.length > 0 && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <UserCheck size={10} className="text-emerald-400" />
                    <span className="text-[10px] font-bold text-emerald-400">{connections.map((c) => c.name ?? c.fbUserId).join(", ")}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={openMetaOAuth}
                disabled={oauthLoading}
                className="flex items-center gap-2 px-3 py-2 bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all active:scale-95"
              >
                {oauthLoading ? <Loader2 size={13} className="animate-spin" /> : <FacebookIcon size={13} />}
                {connections.length > 0 ? "Adicionar conta" : "Entrar com Facebook"}
              </button>
              {connections.map((conn) => (
                <button
                  key={conn.id}
                  onClick={() => disconnectMeta(conn.id)}
                  className="flex items-center gap-1.5 px-3 py-2 text-rose-400 hover:bg-rose-500/10 rounded-xl text-xs font-bold transition-all"
                >
                  <Trash2 size={12} />
                  Desconectar
                </button>
              ))}
            </div>
          </div>

          {/* States */}
          {loadingBms ? (
            <div className="flex items-center gap-3 py-10 justify-center text-slate-500">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-xs font-bold uppercase tracking-wider">Carregando contas da Meta...</span>
            </div>

          ) : bmsError === "NO_TOKEN" ? (
            <div className="flex flex-col items-center text-center py-12 gap-5">
              <div className="w-16 h-16 bg-[#1877F2]/10 rounded-2xl flex items-center justify-center text-[#1877F2] border border-[#1877F2]/20">
                <FacebookIcon size={32} />
              </div>
              <div>
                <p className="font-black text-slate-100 mb-1.5 uppercase tracking-tight">Nenhuma conta Meta conectada</p>
                <p className="text-xs text-slate-400 max-w-md">
                  Conecte via OAuth ou cole um token do Graph API Explorer para importar suas contas de anúncio.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={openMetaOAuth}
                  disabled={oauthLoading}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all active:scale-95"
                >
                  {oauthLoading ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />}
                  Entrar com Facebook
                </button>
              </div>
            </div>

          ) : bmsError ? (
            <div className="flex items-start gap-3 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl">
              <AlertCircle size={16} className="text-rose-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-bold text-rose-300 uppercase tracking-wide">Erro ao carregar contas</p>
                <p className="text-[11px] text-rose-400/70 mt-1">{bmsError}</p>
                <div className="flex gap-2 mt-3">
                  <button onClick={openMetaOAuth} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-[11px] font-bold transition-all">
                    <FacebookIcon size={11} /> Reconectar
                  </button>
                </div>
              </div>
            </div>

          ) : bms.length === 0 ? (
            <p className="text-center text-slate-500 text-xs py-8 font-bold uppercase tracking-widest">
              Nenhuma conta de anúncios encontrada neste perfil
            </p>

          ) : (
            <div className="space-y-4">
              {bms.map((bm) => (
                <div key={bm.id} className="bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/50">
                    <div className="w-7 h-7 bg-blue-600/20 rounded-lg flex items-center justify-center border border-blue-500/20">
                      <Link2 size={12} className="text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-slate-100 uppercase tracking-tight truncate">{bm.name}</p>
                      <p className="text-[10px] text-slate-500">
                        {bm.accounts.filter((a) => connectedAccountIds.has(a.id)).length}/{bm.accounts.length} contas no dashboard
                      </p>
                    </div>
                    <span className="text-[9px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20 uppercase">Meta Ads</span>
                  </div>
                  <div className="p-3 space-y-2">
                    {bm.accounts.map((account) => {
                      const isConnected = connectedAccountIds.has(account.id);
                      const isLoading = connecting === account.id;
                      const statusLabel = accountStatusLabel(account.account_status);
                      return (
                        <div key={account.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl border border-slate-700/30 hover:border-slate-600/50 transition-colors">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-bold text-slate-100">{account.name}</p>
                              {statusLabel && (
                                <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full uppercase">{statusLabel}</span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5">{account.id}</p>
                          </div>
                          {isConnected ? (
                            <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase">No dashboard</span>
                          ) : (
                            <button
                              onClick={() => connect(account, bm)}
                              disabled={isLoading}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 border border-slate-600 text-slate-200 rounded-lg text-[11px] font-bold transition-all active:scale-95"
                            >
                              {isLoading ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                              Adicionar
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Google Ads */}
        <div className="glass-panel rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-800/60 rounded-xl flex items-center justify-center border border-slate-700/50">
                <img src="/icon-google-ads.webp" alt="Google Ads" className="w-6 h-6 object-contain" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-black text-slate-200 uppercase tracking-tight">Google Ads</p>
                {googleStatus?.connected && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <CheckCircle2 size={10} className="text-emerald-400" />
                    <span className="text-[10px] font-bold text-emerald-400">{googleStatus.email}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {googleStatus?.connected ? (
                <>
                  <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase">
                    {googleStatus.isExpired ? "Expirado" : "Conectado"}
                  </span>
                  {googleStatus.isExpired && (
                    <button
                      onClick={openGoogleOAuth}
                      disabled={googleLoading}
                      className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all"
                    >
                      <LogIn size={12} />
                      Reconectar
                    </button>
                  )}
                  <button
                    onClick={disconnectGoogle}
                    disabled={googleLoading}
                    className="flex items-center gap-1.5 px-3 py-2 text-rose-400 hover:bg-rose-500/10 rounded-xl text-xs font-bold transition-all"
                  >
                    <Trash2 size={12} />
                    Desconectar
                  </button>
                </>
              ) : (
                <button
                  onClick={openGoogleOAuth}
                  disabled={googleLoading}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-100 disabled:opacity-50 text-gray-800 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-lg"
                >
                  {googleLoading ? <Loader2 size={13} className="animate-spin" /> : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                  )}
                  Conectar Google
                </button>
              )}
            </div>
          </div>

          {/* Info box — não conectado */}
          {!googleStatus?.connected && (
            <div className="flex flex-col items-center text-center py-8 gap-5">
              <div className="w-16 h-16 bg-slate-800/60 rounded-2xl flex items-center justify-center border border-slate-700/50">
                <img src="/icon-google-ads.webp" alt="Google Ads" className="w-8 h-8 object-contain" />
              </div>
              <div>
                <p className="font-black text-slate-100 mb-1.5 uppercase tracking-tight">Conecte sua conta Google</p>
                <p className="text-xs text-slate-400 max-w-md">
                  Autentique-se com sua conta Google para acessar Google Ads e Google Analytics 4.
                  <br />
                  <span className="text-slate-500">Seus dados são armazenados com segurança e você pode desconectar a qualquer momento.</span>
                </p>
              </div>
            </div>
          )}

          {/* Contas Google Ads reais */}
          {googleStatus?.connected && (
            <>
              {googleAccountsLoading ? (
                <div className="flex items-center gap-3 py-10 justify-center text-slate-500">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-xs font-bold uppercase tracking-wider">Carregando contas Google Ads...</span>
                </div>
              ) : googleAccountsError ? (
                <div className="flex items-start gap-3 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                  <AlertCircle size={16} className="text-rose-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-rose-300 uppercase tracking-wide">Erro ao carregar contas</p>
                    <p className="text-[11px] text-rose-400/70 mt-1">{googleAccountsError}</p>
                    <div className="flex gap-2 mt-3">
                      <button onClick={loadGoogleAccounts} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-[11px] font-bold transition-all">
                        <LogIn size={11} /> Recarregar
                      </button>
                    </div>
                  </div>
                </div>
              ) : googleAccounts.length === 0 ? (
                <div className="flex flex-col items-center text-center py-8 gap-5">
                  <div className="w-16 h-16 bg-slate-800/60 rounded-2xl flex items-center justify-center border border-slate-700/50">
                    <img src="/icon-google-ads.webp" alt="Google Ads" className="w-8 h-8 object-contain opacity-50" />
                  </div>
                  <div>
                    <p className="font-black text-slate-100 mb-1.5 uppercase tracking-tight">Nenhuma conta Google Ads encontrada</p>
                    <p className="text-xs text-slate-400 max-w-md">
                      Nenhuma conta de anúncio Google Ads foi encontrada para este email.
                      <br />
                      <span className="text-slate-500">Verifique se você tem acesso a alguma conta Google Ads.</span>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/50">
                      <div className="w-7 h-7 bg-cyan-600/20 rounded-lg flex items-center justify-center border border-cyan-500/20">
                        <Link2 size={12} className="text-cyan-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-slate-100 uppercase tracking-tight truncate">Contas Google Ads</p>
                        <p className="text-[10px] text-slate-500">
                          {googleAccounts.filter((a) => connectedAccountIds.has(a.customerId)).length}/{googleAccounts.length} contas no dashboard
                        </p>
                      </div>
                      <span className="text-[9px] font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20 uppercase">Google Ads</span>
                    </div>
                    <div className="p-3 space-y-2">
                      {googleAccounts.map((account) => {
                        const isConnected = connectedAccountIds.has(account.customerId);
                        const isLoading = connectingGoogle === account.customerId;
                        return (
                          <div key={account.customerId} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl border border-slate-700/30 hover:border-slate-600/50 transition-colors">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-bold text-slate-100">{account.name}</p>
                                {account.isManager && (
                                  <span className="text-[9px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded-full uppercase">MCC</span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                {account.customerId}{account.currency ? ` · ${account.currency}` : ""}
                              </p>
                            </div>
                            {isConnected ? (
                              <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase">No dashboard</span>
                            ) : (
                              <button
                                onClick={() => connectGoogle(account)}
                                disabled={isLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 border border-slate-600 text-slate-200 rounded-lg text-[11px] font-bold transition-all active:scale-95"
                              >
                                {isLoading ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                                Adicionar
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
}
