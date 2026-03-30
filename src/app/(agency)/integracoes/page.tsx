"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  Key,
  Link2,
  Loader2,
  LogIn,
  Plus,
  Trash2,
  UserCheck,
  X,
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

  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState("");

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

  async function handleTokenSubmit() {
    if (!tokenInput.trim()) return;
    setTokenLoading(true);
    setTokenError("");

    const res = await fetch("/api/meta/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: tokenInput.trim() }),
    });
    const data = await res.json();
    setTokenLoading(false);

    if (data.error) {
      setTokenError(data.error);
    } else {
      setTokenInput("");
      setShowTokenInput(false);
      loadAccounts();
    }
  }

  async function disconnectMeta(connId: string) {
    await fetch(`/api/meta/connections/${connId}`, { method: "DELETE" });
    loadAccounts();
  }

  async function connect(account: MetaAdAccount, bm: MetaBM) {
    setConnecting(account.id);
    await fetch("/api/integrations", {
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

      <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">

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
                      <span className="text-xs font-black text-blue-400">M</span>
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
              <button
                onClick={() => setShowTokenInput((v) => !v)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all active:scale-95"
              >
                <Key size={13} />
                Token
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

          {/* Token input */}
          {showTokenInput && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardPaste size={14} className="text-blue-400" />
                  <span className="text-xs font-bold text-blue-300 uppercase tracking-wider">Colar Token de Acesso</span>
                </div>
                <button onClick={() => { setShowTokenInput(false); setTokenError(""); }} className="text-slate-500 hover:text-slate-300 transition-colors">
                  <X size={15} />
                </button>
              </div>
              <p className="text-[10px] text-slate-400">
                Gere um token no <strong className="text-slate-200">Meta for Developers → Graph API Explorer</strong> com permissões <code className="bg-slate-800 px-1 rounded text-blue-300">ads_read</code> e <code className="bg-slate-800 px-1 rounded text-blue-300">ads_management</code>
              </p>
              <div className="flex gap-2">
                <input
                  placeholder="Cole seu access token aqui..."
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleTokenSubmit()}
                  className="flex-1 bg-slate-900/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 font-mono transition-colors"
                />
                <button
                  onClick={handleTokenSubmit}
                  disabled={tokenLoading || !tokenInput.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all active:scale-95"
                >
                  {tokenLoading ? <Loader2 size={13} className="animate-spin" /> : "Conectar"}
                </button>
              </div>
              {tokenError && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl">{tokenError}</p>
              )}
            </div>
          )}

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
                <button
                  onClick={() => setShowTokenInput(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all active:scale-95"
                >
                  <Key size={13} />
                  Colar Token
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
                  <button onClick={() => setShowTokenInput(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-[11px] font-bold transition-all">
                    <Key size={11} /> Novo token
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
        <div className="glass-panel rounded-2xl p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-800/60 rounded-xl flex items-center justify-center border border-slate-700/50">
              <span className="text-sm font-black text-slate-400">G</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-black text-slate-200 uppercase tracking-tight">Google Ads</p>
              <p className="text-xs text-slate-500">Integração em desenvolvimento</p>
            </div>
            <span className="text-[9px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700 uppercase tracking-widest">Em breve</span>
          </div>
        </div>

      </div>
    </div>
  );
}
