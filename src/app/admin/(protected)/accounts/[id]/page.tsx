"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Save, Key, AlertTriangle, CheckCircle, User, CreditCard, Link2, Activity, FileText } from "lucide-react";
import { PLANS } from "@/lib/plans";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Tab = "perfil" | "assinatura" | "senha" | "conexoes" | "historico";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "perfil", label: "Perfil", icon: User },
  { id: "assinatura", label: "Assinatura", icon: CreditCard },
  { id: "senha", label: "Redefinir Senha", icon: Key },
  { id: "conexoes", label: "Conexões", icon: Link2 },
  { id: "historico", label: "Histórico Admin", icon: FileText },
];

interface UserDetail {
  id: string; email: string; name: string | null; role: string;
  onboardingCompleted: boolean; forcePasswordChange: boolean;
  stripeCustomerId: string | null; createdAt: string; updatedAt: string;
  subscription: {
    plan: string; status: string; trialEndsAt: string | null;
    currentPeriodEnd: string | null; accountsLimit: number;
    stripeSubscriptionId: string | null;
  } | null;
  metaConnections: { id: string; name: string | null; fbUserId: string; createdAt: string; expiresAt: string | null }[];
  googleConnections: { id: string; email: string; connectedAt: string; scopes: string | null }[];
  workspace: {
    id: string; name: string; slug: string;
    integrations: { integration: { platform: string; name: string; adAccountId: string } }[];
  } | null;
  adminLogs: { id: string; action: string; details: string | null; adminIp: string | null; createdAt: string }[];
}

function Badge({ text, color }: { text: string; color: string }) {
  return <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide", color)}>{text}</span>;
}

const PLAN_COLORS: Record<string, string> = {
  trial: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  start: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  plus: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  premium: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
};
const STATUS_COLORS: Record<string, string> = {
  active: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  trialing: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  expired: "text-red-400 bg-red-500/10 border-red-500/20",
  canceled: "text-slate-400 bg-slate-700/50 border-slate-600/50",
};

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("perfil");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [role, setRole] = useState("AGENCY");
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [plan, setPlan] = useState("trial");
  const [status, setStatus] = useState("trialing");
  const [trialEndsAt, setTrialEndsAt] = useState("");
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [forceChange, setForceChange] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/admin/accounts/${id}`).catch(() => null);
    if (res?.ok) {
      const data: UserDetail = await res.json();
      setUser(data);
      setName(data.name ?? "");
      setRole(data.role);
      setForcePasswordChange(data.forcePasswordChange);
      setPlan(data.subscription?.plan ?? "trial");
      setStatus(data.subscription?.status ?? "trialing");
      setTrialEndsAt(data.subscription?.trialEndsAt ? data.subscription.trialEndsAt.slice(0, 10) : "");
      setCurrentPeriodEnd(data.subscription?.currentPeriodEnd ? data.subscription.currentPeriodEnd.slice(0, 10) : "");
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  function showFeedback(ok: boolean, msg: string) {
    setFeedback({ ok, msg });
    setTimeout(() => setFeedback(null), 3500);
  }

  async function saveProfile() {
    setSaving(true);
    const res = await fetch(`/api/admin/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, role, forcePasswordChange }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) { showFeedback(true, "Perfil atualizado com sucesso"); load(); }
    else showFeedback(false, "Erro ao salvar perfil");
  }

  async function saveSubscription() {
    setSaving(true);
    const res = await fetch(`/api/admin/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, status, trialEndsAt: trialEndsAt || null, currentPeriodEnd: currentPeriodEnd || null }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) { showFeedback(true, "Assinatura atualizada"); load(); }
    else showFeedback(false, "Erro ao atualizar assinatura");
  }

  async function resetPassword() {
    if (newPassword !== confirmPassword) { showFeedback(false, "Senhas não coincidem"); return; }
    if (newPassword.length < 8) { showFeedback(false, "Senha deve ter pelo menos 8 caracteres"); return; }
    setSaving(true);
    const res = await fetch(`/api/admin/accounts/${id}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword, forcePasswordChange: forceChange }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) { showFeedback(true, "Senha redefinida com segurança"); setNewPassword(""); setConfirmPassword(""); }
    else showFeedback(false, "Erro ao redefinir senha");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <div className="p-6 text-slate-400">Usuário não encontrado.</div>;
  }

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => router.push("/admin/accounts")} className="text-slate-500 hover:text-white transition-colors mt-0.5">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-black text-white">{user.name ?? user.email}</h1>
            <Badge text={user.subscription?.plan ?? "sem plano"} color={PLAN_COLORS[user.subscription?.plan ?? ""] ?? "text-slate-400 bg-slate-800 border-slate-700"} />
            <Badge text={user.subscription?.status ?? "—"} color={STATUS_COLORS[user.subscription?.status ?? ""] ?? "text-slate-400 bg-slate-800 border-slate-700"} />
          </div>
          <p className="text-sm text-slate-500 mt-0.5">{user.email}</p>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={cn("flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border", feedback.ok ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400")}>
          {feedback.ok ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
          {feedback.msg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900/60 border border-slate-800/60 rounded-xl p-1 flex-wrap">
        {TABS.map(({ id: tid, label, icon: Icon }) => (
          <button
            key={tid}
            onClick={() => setTab(tid)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all",
              tab === tid ? "bg-slate-800 text-white shadow" : "text-slate-500 hover:text-slate-300"
            )}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-6">

        {/* ─── Perfil ─── */}
        {tab === "perfil" && (
          <div className="space-y-5">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Informações do Perfil</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nome</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-all" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Email</label>
                <input value={user.email} readOnly className="w-full bg-slate-800/30 border border-slate-700/40 rounded-xl px-4 py-2.5 text-sm text-slate-500 cursor-not-allowed" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Role</label>
                <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-all">
                  <option value="AGENCY">AGENCY</option>
                  <option value="CLIENT">CLIENT</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cadastrado em</label>
                <input value={new Date(user.createdAt).toLocaleDateString("pt-BR")} readOnly className="w-full bg-slate-800/30 border border-slate-700/40 rounded-xl px-4 py-2.5 text-sm text-slate-500 cursor-not-allowed" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="fpc" checked={forcePasswordChange} onChange={(e) => setForcePasswordChange(e.target.checked)} className="w-4 h-4 accent-amber-500" />
              <label htmlFor="fpc" className="text-sm text-slate-300">Forçar troca de senha no próximo login</label>
            </div>
            <button onClick={saveProfile} disabled={saving} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-all">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar Perfil
            </button>
          </div>
        )}

        {/* ─── Assinatura ─── */}
        {tab === "assinatura" && (
          <div className="space-y-5">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Gestão de Assinatura</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Plano</label>
                <select value={plan} onChange={(e) => setPlan(e.target.value)} className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50">
                  {Object.entries(PLANS).map(([key, def]) => (
                    <option key={key} value={key}>{def.name} — {def.price > 0 ? formatCurrency(def.price) + "/mês" : "Grátis"}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50">
                  <option value="trialing">Trialing</option>
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="canceled">Canceled</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Trial Termina Em</label>
                <input type="date" value={trialEndsAt} onChange={(e) => setTrialEndsAt(e.target.value)} className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Período Atual Termina Em</label>
                <input type="date" value={currentPeriodEnd} onChange={(e) => setCurrentPeriodEnd(e.target.value)} className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" />
              </div>
            </div>
            {/* Info plano */}
            {PLANS[plan] && (
              <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Preço</p>
                  <p className="text-sm font-black text-white">{PLANS[plan].price > 0 ? formatCurrency(PLANS[plan].price) : "Grátis"}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Limite de Contas</p>
                  <p className="text-sm font-black text-white">{PLANS[plan].accountsLimit}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Plataformas</p>
                  <p className="text-sm font-black text-white">{PLANS[plan].maxPlatforms ?? "Todas"}</p>
                </div>
              </div>
            )}
            <button onClick={saveSubscription} disabled={saving} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-all">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar Assinatura
            </button>
          </div>
        )}

        {/* ─── Senha ─── */}
        {tab === "senha" && (
          <div className="space-y-5 max-w-sm">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Redefinir Senha do Usuário</h2>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-xs text-amber-400 flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              A senha é armazenada com hash seguro (bcrypt). O admin nunca vê a senha atual.
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nova Senha</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 8 caracteres" className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Confirmar Senha</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repita a nova senha" className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" />
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="fc" checked={forceChange} onChange={(e) => setForceChange(e.target.checked)} className="w-4 h-4 accent-amber-500" />
                <label htmlFor="fc" className="text-sm text-slate-300">Forçar troca de senha no próximo login</label>
              </div>
            </div>
            <button onClick={resetPassword} disabled={saving || !newPassword} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-all">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
              Redefinir Senha
            </button>
          </div>
        )}

        {/* ─── Conexões ─── */}
        {tab === "conexoes" && (
          <div className="space-y-5">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Conexões de Plataformas</h2>
            {user.metaConnections.length > 0 && (
              <div>
                <p className="text-xs font-bold text-blue-400 mb-2">Meta Ads</p>
                <div className="space-y-2">
                  {user.metaConnections.map((c) => (
                    <div key={c.id} className="bg-slate-800/40 rounded-xl px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-white">{c.name ?? c.fbUserId}</p>
                        <p className="text-[10px] text-slate-500">ID: {c.fbUserId}</p>
                      </div>
                      <div className="text-right text-[10px] text-slate-500">
                        <p>Conectado: {new Date(c.createdAt).toLocaleDateString("pt-BR")}</p>
                        {c.expiresAt && <p>Expira: {new Date(c.expiresAt).toLocaleDateString("pt-BR")}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {user.googleConnections.length > 0 && (
              <div>
                <p className="text-xs font-bold text-cyan-400 mb-2">Google Ads</p>
                <div className="space-y-2">
                  {user.googleConnections.map((c) => (
                    <div key={c.id} className="bg-slate-800/40 rounded-xl px-4 py-3 flex items-center justify-between">
                      <p className="text-sm font-medium text-white">{c.email}</p>
                      <p className="text-[10px] text-slate-500">{new Date(c.connectedAt).toLocaleDateString("pt-BR")}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {user.workspace && (
              <div>
                <p className="text-xs font-bold text-slate-400 mb-2">Workspace: {user.workspace.name}</p>
                {user.workspace.integrations.length > 0 && (
                  <div className="space-y-2">
                    {user.workspace.integrations.map((wi, i) => (
                      <div key={i} className="bg-slate-800/40 rounded-xl px-4 py-2.5 flex items-center justify-between">
                        <p className="text-sm font-medium text-white">{wi.integration.name}</p>
                        <span className="text-[9px] font-bold text-slate-500 uppercase">{wi.integration.platform} · {wi.integration.adAccountId}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {user.metaConnections.length === 0 && user.googleConnections.length === 0 && (
              <p className="text-slate-600 text-sm">Nenhuma conexão encontrada.</p>
            )}
          </div>
        )}

        {/* ─── Histórico ─── */}
        {tab === "historico" && (
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Histórico de Ações Admin</h2>
            {user.adminLogs.length === 0 ? (
              <p className="text-slate-600 text-sm">Nenhuma ação registrada.</p>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {user.adminLogs.map((log) => (
                  <div key={log.id} className="py-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white font-mono">{log.action}</p>
                      {log.details && (
                        <p className="text-[10px] text-slate-500 mt-0.5 truncate">{log.details}</p>
                      )}
                      {log.adminIp && <p className="text-[9px] text-slate-700">IP: {log.adminIp}</p>}
                    </div>
                    <p className="text-[10px] text-slate-500 shrink-0">
                      {new Date(log.createdAt).toLocaleString("pt-BR")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
