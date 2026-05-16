"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  ImageIcon,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Tags,
  Trash2,
  Upload,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { METRIC_DEFINITIONS, METRIC_CATEGORIES, type VisibleMetrics, type MetricKey } from "@/lib/visible-metrics";
import { DEFAULT_LEAD_SOURCES } from "@/lib/lead-sources";

interface Integration {
  id: string;
  name: string;
  platform: string;
  adAccountId: string;
  bmName: string | null;
}

interface Client {
  id: string;
  email: string;
  name: string | null;
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  publicAccess: boolean;
  // O backend não retorna mais o hash da senha (segurança).
  // Apenas indica se existe uma senha definida.
  hasPassword: boolean;
  // null = auto-detect (padrão); objeto = customização explícita por KPI.
  visibleMetrics: VisibleMetrics | null;
  // Lista atual de origens (tags) pro CRM — sempre vem populada (defaults
  // quando o workspace não customizou).
  leadSources: string[];
  integrations: Array<{ integration: Integration }>;
  clients: Client[];
}

interface CreatedCredentials {
  email: string;
  password: string;
}

function Section({ icon, title, badge, children }: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-panel rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-slate-800/80 rounded-lg flex items-center justify-center border border-slate-700/50 text-blue-400">
            {icon}
          </div>
          <h2 className="text-xs font-black text-slate-200 uppercase tracking-widest">{title}</h2>
        </div>
        {badge && (
          <span className="text-[9px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700 uppercase tracking-wider">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function DarkInput({ value, onChange, placeholder, type = "text", readOnly = false, onKeyDown, className = "" }: {
  value: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  readOnly?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      readOnly={readOnly}
      onKeyDown={onKeyDown}
      className={`w-full bg-slate-900/80 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none transition-colors ${readOnly ? "cursor-default opacity-70" : ""} ${className}`}
    />
  );
}

export default function WorkspaceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [allIntegrations, setAllIntegrations] = useState<Integration[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [logo, setLogo] = useState("");
  const [publicAccess, setPublicAccess] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const [sharePassword, setSharePassword] = useState("");
  // null = "deixar auto"; objeto vazio = nenhuma marcada (escondem todas);
  // objeto com flags = customização explícita.
  const [customMetrics, setCustomMetrics] = useState(false);
  const [metricsState, setMetricsState] = useState<VisibleMetrics>({});
  const [leadSourcesState, setLeadSourcesState] = useState<string[]>(DEFAULT_LEAD_SOURCES);
  const [newSource, setNewSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [clients, setClients] = useState<Client[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [addingClient, setAddingClient] = useState(false);
  const [clientError, setClientError] = useState("");
  const [createdCredentials, setCreatedCredentials] = useState<CreatedCredentials | null>(null);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editPassword, setEditPassword] = useState("");
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/workspaces/${id}`).then((r) => r.json()),
      fetch("/api/integrations").then((r) => r.json()),
    ]).then(([ws, ints]) => {
      setWorkspace(ws);
      setAllIntegrations(ints);
      setName(ws.name);
      setLogo(ws.logo ?? "");
      setPublicAccess(ws.publicAccess);
      // Backend não retorna a senha — só `hasPassword`. Input começa vazio:
      // se o admin não digitar nada, a senha atual é preservada no save.
      setSharePassword("");
      setUsePassword(!!ws.hasPassword);
      setSelected(ws.integrations.map((i: { integration: Integration }) => i.integration.id));
      setClients(ws.clients ?? []);
      setCustomMetrics(ws.visibleMetrics !== null);
      setMetricsState(ws.visibleMetrics ?? {});
      setLeadSourcesState(ws.leadSources ?? DEFAULT_LEAD_SOURCES);
    });
  }, [id]);

  function toggleAccount(intId: string) {
    setSelected((prev) =>
      prev.includes(intId) ? prev.filter((x) => x !== intId) : [...prev, intId]
    );
  }

  async function handleSave() {
    setSaving(true);

    // Lógica do sharePassword:
    //  - toggle desligado    → sharePassword: null (limpa a senha)
    //  - toggle ligado + input vazio   → omitir o campo (mantém a senha atual)
    //  - toggle ligado + input preenchido → manda a nova senha (backend faz hash)
    const body: Record<string, unknown> = {
      name,
      logo: logo || null,
      publicAccess,
      integrationIds: selected,
    };
    if (!usePassword) {
      body.sharePassword = null;
    } else if (sharePassword.length > 0) {
      body.sharePassword = sharePassword;
    }

    // visibleMetrics: null = volta pra auto; objeto = customização explícita.
    body.visibleMetrics = customMetrics ? metricsState : null;

    // leadSources: array de strings. Backend reduz a null se igual ao default.
    body.leadSources = leadSourcesState;

    await fetch(`/api/workspaces/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    router.push("/workspaces");
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const json = await res.json();
    if (json.url) setLogo(json.url);
    setUploadingLogo(false);
    e.target.value = "";
  }

  async function handleDelete() {
    if (!confirm(`Excluir cliente "${workspace?.name}"? Esta ação não pode ser desfeita.`)) return;
    setDeleting(true);
    await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
    router.push("/workspaces");
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/cliente/${workspace?.slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Recarrega os dados do workspace do banco
  async function reloadWorkspace() {
    const ws = await fetch(`/api/workspaces/${id}`).then((r) => r.json());
    if (ws) {
      setWorkspace(ws);
      setName(ws.name);
      setLogo(ws.logo ?? "");
      setPublicAccess(ws.publicAccess);
      setSharePassword("");
      setUsePassword(!!ws.hasPassword);
      setSelected(ws.integrations.map((i: { integration: Integration }) => i.integration.id));
      setClients(ws.clients ?? []);
    }
  }

  async function handleAddClient() {
    if (!newEmail.trim()) return;
    setAddingClient(true);
    setClientError("");

    const res = await fetch(`/api/workspaces/${id}/clients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: newEmail.trim(),
        name: newClientName.trim() || null,
        password: newPassword || null,
      }),
    });

    setAddingClient(false);

    if (res.ok) {
      // Recarrega do banco para garantir que os dados estão atualizados
      await reloadWorkspace();
      if (newPassword) {
        setCreatedCredentials({ email: newEmail.trim(), password: newPassword });
      }
      setNewEmail("");
      setNewClientName("");
      setNewPassword("");
    } else {
      setClientError("Erro ao adicionar usuário.");
    }
  }

  async function handleRemoveClient(clientId: string) {
    const res = await fetch(`/api/workspaces/${id}/clients/${clientId}`, { method: "DELETE" });
    if (res.ok) {
      await reloadWorkspace();
    }
  }

  async function handleEditPassword(client: Client) {
    if (!editPassword.trim()) return;
    setSavingPassword(true);
    const res = await fetch(`/api/workspaces/${id}/clients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: client.email, name: client.name, password: editPassword }),
    });
    setSavingPassword(false);
    if (res.ok) {
      await reloadWorkspace();
      setCreatedCredentials({ email: client.email, password: editPassword });
      setEditingClientId(null);
      setEditPassword("");
      setShowEditPassword(false);
    }
  }

  if (!workspace) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-xs font-bold uppercase tracking-wider">Carregando...</span>
        </div>
      </div>
    );
  }

  const clientLink = typeof window !== "undefined"
    ? `${window.location.origin}/cliente/${workspace.slug}`
    : `/cliente/${workspace.slug}`;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header title={workspace.name} subtitle="Configurações do cliente" />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-5">

          <Link href="/workspaces">
            <button className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-xs font-bold uppercase tracking-wider transition-colors mb-2">
              <ArrowLeft size={14} />
              Voltar
            </button>
          </Link>

          {/* Informações */}
          <Section icon={<span className="text-xs font-black">ID</span>} title="Informações do Cliente">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nome</label>
              <DarkInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do cliente" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Logo do Cliente</label>
              <div className="flex items-center gap-4">
                {logo ? (
                  <img src={logo} alt="Logo" className="w-14 h-14 rounded-2xl object-cover border border-slate-700 shadow-lg" />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-600">
                    <ImageIcon size={20} />
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <label className={`cursor-pointer flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 rounded-xl text-xs font-bold text-slate-300 transition-all active:scale-95 ${uploadingLogo ? "opacity-60 pointer-events-none" : ""}`}>
                    {uploadingLogo ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                    {uploadingLogo ? "Enviando..." : logo ? "Trocar imagem" : "Enviar logo"}
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                  </label>
                  {logo && (
                    <button onClick={() => setLogo("")} className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-rose-400 transition-colors">
                      <X size={10} /> Remover
                    </button>
                  )}
                </div>
              </div>
            </div>
          </Section>

          {/* Link público */}
          <Section icon={<Link2 size={13} />} title="Link de Convite">
            <div className="flex gap-2">
              <DarkInput value={clientLink} readOnly className="flex-1 font-mono text-xs" />
              <button
                onClick={copyLink}
                className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-400 hover:text-blue-400 transition-all"
              >
                {copied ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </button>
              <a href={`/cliente/${workspace.slug}`} target="_blank" rel="noopener noreferrer">
                <button className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-400 hover:text-emerald-400 transition-all">
                  <ExternalLink size={14} />
                </button>
              </a>
            </div>
            <label className="flex items-center gap-3 cursor-pointer group">
              <div
                onClick={() => setPublicAccess((v) => !v)}
                className={`w-10 h-5 rounded-full transition-all relative flex-shrink-0 ${publicAccess ? "bg-blue-600" : "bg-slate-700"}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${publicAccess ? "left-5.5 translate-x-0.5" : "left-0.5"}`} />
              </div>
              <span className="text-xs font-bold text-slate-300">Acesso público (sem senha)</span>
            </label>
          </Section>

          {/* Senha do link */}
          <Section icon={<Lock size={13} />} title="Senha do Link">
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setUsePassword((v) => !v)}
                className={`w-10 h-5 rounded-full transition-all relative flex-shrink-0 ${usePassword ? "bg-blue-600" : "bg-slate-700"}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${usePassword ? "left-5.5 translate-x-0.5" : "left-0.5"}`} />
              </div>
              <span className="text-xs font-bold text-slate-300">Proteger link com senha</span>
            </label>
            {usePassword && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Senha de acesso</label>
                <DarkInput
                  value={sharePassword}
                  onChange={(e) => setSharePassword(e.target.value)}
                  placeholder={workspace.hasPassword ? "(senha definida — digite para alterar)" : "Senha de acesso ao link"}
                />
                <p className="text-[10px] text-slate-500">
                  {workspace.hasPassword
                    ? "Deixe em branco para manter a senha atual; digite para definir uma nova."
                    : "O cliente precisará digitar esta senha ao acessar o link."}
                </p>
              </div>
            )}
          </Section>

          {/* Contas de anúncio */}
          <Section
            icon={<span className="text-[10px] font-black">AD</span>}
            title="Contas de Anúncio"
            badge={`${selected.length} selecionada${selected.length !== 1 ? "s" : ""}`}
          >
            {allIntegrations.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4 font-bold uppercase tracking-wider">
                Nenhuma conta conectada.{" "}
                <Link href="/integracoes" className="text-blue-400 hover:underline">Ir para Integrações</Link>
              </p>
            ) : (
              <div className="space-y-2">
                {allIntegrations.map((int) => {
                  const isSelected = selected.includes(int.id);
                  return (
                    <div
                      key={int.id}
                      onClick={() => toggleAccount(int.id)}
                      className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${isSelected
                        ? "border-blue-500/60 bg-blue-500/10"
                        : "border-slate-700/50 bg-slate-800/40 hover:border-slate-600/60"
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center border text-xs font-black ${isSelected ? "bg-blue-600/20 border-blue-500/30 text-blue-400" : "bg-slate-800 border-slate-700 text-slate-400"
                          }`}>
                          {int.platform.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-100">{int.name}</p>
                          <p className="text-[10px] text-slate-500">{int.bmName ?? int.adAccountId}</p>
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 size={16} className="text-blue-400 shrink-0" />}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Métricas visíveis na dash do cliente */}
          <Section
            icon={<BarChart3 size={13} />}
            title="Métricas visíveis"
            badge={customMetrics ? "Personalizado" : "Auto"}
          >
            <div className="flex items-start justify-between gap-3 p-3 rounded-xl border border-slate-700/50 bg-slate-800/40">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-100">Escolher quais KPIs aparecem</p>
                <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                  Quando desligado, a dash mostra automaticamente os KPIs que têm dado &gt; 0 no período. Ligue para escolher manualmente — útil para esconder &quot;Vendas&quot; em cliente que só roda WhatsApp, ou &quot;Mensagens&quot; em cliente que só roda site.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCustomMetrics((v) => !v)}
                className={`w-10 h-5 rounded-full transition-all relative flex-shrink-0 ${customMetrics ? "bg-blue-600" : "bg-slate-700"}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${customMetrics ? "left-5.5 translate-x-0.5" : "left-0.5"}`} />
              </button>
            </div>

            {customMetrics && (
              <div className="space-y-4 mt-3">
                {/* Atalhos rápidos */}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const all: VisibleMetrics = {};
                      for (const def of METRIC_DEFINITIONS) all[def.key] = true;
                      setMetricsState(all);
                    }}
                    className="px-3 py-1 rounded-full bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 text-[10px] font-bold text-blue-300 uppercase tracking-wider transition-colors"
                  >
                    Marcar todas
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const none: VisibleMetrics = {};
                      for (const def of METRIC_DEFINITIONS) none[def.key] = false;
                      setMetricsState(none);
                    }}
                    className="px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-colors"
                  >
                    Desmarcar todas
                  </button>
                </div>

                {METRIC_CATEGORIES.map((cat) => {
                  const defs = METRIC_DEFINITIONS.filter((d) => d.category === cat.id);
                  return (
                    <div key={cat.id} className="space-y-2">
                      <div className="flex items-baseline gap-2">
                        <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{cat.label}</h4>
                        <span className="text-[10px] text-slate-500">— {cat.description}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {defs.map((def) => {
                          // Default visible quando não setado explicitamente (coerente com shouldShowMetric).
                          const checked = metricsState[def.key] !== false;
                          return (
                            <label
                              key={def.key}
                              className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-700/50 bg-slate-800/40 hover:border-slate-600/60 cursor-pointer transition-all"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  setMetricsState((prev) => ({ ...prev, [def.key as MetricKey]: e.target.checked }))
                                }
                                className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900 cursor-pointer shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-slate-100">{def.label}</p>
                                <p className="text-[10px] text-slate-500 leading-tight">{def.description}</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Tags do CRM */}
          <Section
            icon={<Tags size={13} />}
            title="Tags de origem do CRM"
            badge={leadSourcesState.length === DEFAULT_LEAD_SOURCES.length &&
              leadSourcesState.every((s, i) => s === DEFAULT_LEAD_SOURCES[i])
              ? "Padrão"
              : `${leadSourcesState.length} tag${leadSourcesState.length !== 1 ? "s" : ""}`}
          >
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Origens disponíveis no dropdown &quot;Origem&quot; ao cadastrar um lead. O padrão é <strong>Meta</strong>, <strong>Google Ads</strong>, <strong>Indicação</strong>. Adicione tags próprias se a equipe usa outras fontes (ex.: TikTok, Boca a boca, Site).
            </p>

            <div className="flex flex-wrap gap-2 mt-3">
              {leadSourcesState.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-xs font-bold text-blue-300"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => setLeadSourcesState((prev) => prev.filter((t) => t !== tag))}
                    className="p-1 rounded-full hover:bg-rose-500/20 hover:text-rose-300 transition-colors"
                    title="Remover tag"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2 mt-3">
              <input
                type="text"
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const t = newSource.trim();
                  if (!t || leadSourcesState.includes(t)) return;
                  setLeadSourcesState((prev) => [...prev, t]);
                  setNewSource("");
                }}
                placeholder="Nova tag (ex.: TikTok)"
                className="flex-1 px-3 py-2 bg-slate-800/60 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                maxLength={50}
              />
              <button
                type="button"
                onClick={() => {
                  const t = newSource.trim();
                  if (!t || leadSourcesState.includes(t)) return;
                  setLeadSourcesState((prev) => [...prev, t]);
                  setNewSource("");
                }}
                disabled={!newSource.trim() || leadSourcesState.includes(newSource.trim())}
                className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <Plus size={12} />
                Adicionar
              </button>
            </div>

            {(leadSourcesState.length !== DEFAULT_LEAD_SOURCES.length ||
              !leadSourcesState.every((s, i) => s === DEFAULT_LEAD_SOURCES[i])) && (
              <button
                type="button"
                onClick={() => setLeadSourcesState(DEFAULT_LEAD_SOURCES)}
                className="mt-3 text-[10px] font-bold text-slate-500 hover:text-blue-400 uppercase tracking-wider transition-colors"
              >
                ↺ Restaurar padrão
              </button>
            )}
          </Section>

          {/* Acesso com login/senha */}
          <Section
            icon={<KeyRound size={13} />}
            title="Acesso com Login e Senha"
            badge={`${clients.length} usuário${clients.length !== 1 ? "s" : ""}`}
          >
            <p className="text-[10px] text-slate-400">
              Crie um login para o cliente acessar o sistema com email e senha, vendo apenas o dashboard dele.
            </p>

            {/* Credenciais criadas */}
            {createdCredentials && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 space-y-2 relative">
                <button
                  onClick={() => setCreatedCredentials(null)}
                  className="absolute top-3 right-3 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <X size={13} />
                </button>
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                  <CheckCircle2 size={14} />
                  Acesso criado! Compartilhe com o cliente:
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 w-12 shrink-0">Email:</span>
                    <code className="bg-slate-900 px-2 py-0.5 rounded border border-slate-700 text-slate-200">{createdCredentials.email}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 w-12 shrink-0">Senha:</span>
                    <code className="bg-slate-900 px-2 py-0.5 rounded border border-slate-700 text-slate-200">{createdCredentials.password}</code>
                    <button
                      onClick={() => navigator.clipboard.writeText(`Email: ${createdCredentials.email}\nSenha: ${createdCredentials.password}`)}
                      className="p-1 text-slate-400 hover:text-blue-400 transition-colors"
                      title="Copiar credenciais"
                    >
                      <Copy size={11} />
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-emerald-400/70">Acesso via: <strong>{typeof window !== "undefined" ? window.location.origin : ""}/login</strong></p>
              </div>
            )}

            {/* Formulário */}
            <div className="space-y-3 border border-slate-700/50 rounded-xl p-4 bg-slate-800/30">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nome do cliente</label>
                  <input
                    placeholder="João Silva"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    className="w-full bg-slate-900/80 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email *</label>
                  <input
                    type="email"
                    placeholder="cliente@email.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddClient()}
                    className="w-full bg-slate-900/80 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none transition-colors"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Senha de acesso</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Crie uma senha para o cliente"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-slate-900/80 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-xl px-3 py-2 pr-9 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors"
                  >
                    {showNewPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
              {clientError && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl">{clientError}</p>
              )}
              <button
                onClick={handleAddClient}
                disabled={addingClient || !newEmail.trim()}
                className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all active:scale-95"
              >
                {addingClient ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
                Criar acesso
              </button>
            </div>

            {/* Lista de clientes */}
            {clients.length > 0 && (
              <div className="space-y-2">
                {clients.map((client) => (
                  <div key={client.id} className="rounded-xl border border-emerald-500/25 bg-emerald-500/5">
                    <div className="flex items-center justify-between p-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                          <KeyRound size={13} className="text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-100">{client.name ?? client.email}</p>
                          {client.name && <p className="text-[10px] text-slate-500">{client.email}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase">Ativo</span>
                        <button
                          onClick={() => {
                            setEditingClientId(editingClientId === client.id ? null : client.id);
                            setEditPassword("");
                            setShowEditPassword(false);
                          }}
                          className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"
                          title="Alterar senha"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleRemoveClient(client.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                          title="Remover acesso"
                        >
                          <UserMinus size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Edição inline de senha */}
                    {editingClientId === client.id && (
                      <div className="px-3.5 pb-3.5 pt-0 space-y-2 border-t border-emerald-500/15">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pt-3">Nova senha de acesso</p>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <input
                              type={showEditPassword ? "text" : "password"}
                              placeholder="Digite a nova senha"
                              value={editPassword}
                              onChange={(e) => setEditPassword(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && handleEditPassword(client)}
                              className="w-full bg-slate-900/80 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-xl px-3 py-2 pr-9 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none transition-colors"
                            />
                            <button
                              type="button"
                              onClick={() => setShowEditPassword((v) => !v)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors"
                            >
                              {showEditPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                          </div>
                          <button
                            onClick={() => handleEditPassword(client)}
                            disabled={savingPassword || !editPassword.trim()}
                            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all active:scale-95 whitespace-nowrap"
                          >
                            {savingPassword ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                            Salvar
                          </button>
                          <button
                            onClick={() => { setEditingClientId(null); setEditPassword(""); }}
                            className="p-2 text-slate-400 hover:text-slate-300 hover:bg-slate-700 rounded-xl transition-all"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Ações */}
          <div className="flex gap-3 pb-6">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all active:scale-95 shadow-lg shadow-blue-500/20"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {saving ? "Salvando..." : "Salvar Alterações"}
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-2 px-5 py-2.5 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-400 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Excluir Cliente
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
