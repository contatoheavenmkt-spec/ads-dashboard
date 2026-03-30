"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  Trash2,
  UserMinus,
  UserPlus,
} from "lucide-react";

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
  sharePassword: string | null;
  integrations: Array<{ integration: Integration }>;
  clients: Client[];
}

interface CreatedCredentials {
  email: string;
  password: string;
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
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Criação de usuário cliente
  const [clients, setClients] = useState<Client[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [addingClient, setAddingClient] = useState(false);
  const [clientError, setClientError] = useState("");
  const [createdCredentials, setCreatedCredentials] = useState<CreatedCredentials | null>(null);

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
      setSharePassword(ws.sharePassword ?? "");
      setUsePassword(!!ws.sharePassword);
      setSelected(ws.integrations.map((i: { integration: Integration }) => i.integration.id));
      setClients(ws.clients ?? []);
    });
  }, [id]);

  function toggleAccount(intId: string) {
    setSelected((prev) =>
      prev.includes(intId) ? prev.filter((x) => x !== intId) : [...prev, intId]
    );
  }

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/workspaces/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        logo: logo || null,
        publicAccess,
        sharePassword: usePassword && sharePassword ? sharePassword : null,
        integrationIds: selected,
      }),
    });
    setSaving(false);
    router.push("/workspaces");
  }

  async function handleDelete() {
    if (!confirm(`Excluir cliente "${workspace?.name}"? Esta ação não pode ser desfeita.`)) return;
    setDeleting(true);
    await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
    router.push("/workspaces");
  }

  function copyLink() {
    navigator.clipboard.writeText(
      `${window.location.origin}/cliente/${workspace?.slug}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleAddClient() {
    if (!newEmail.trim()) return;
    setAddingClient(true);
    setClientError("");
    setCreatedCredentials(null);

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
      const newClient = await res.json();
      setClients((prev) => {
        if (prev.find((c) => c.id === newClient.id)) {
          return prev.map((c) => (c.id === newClient.id ? newClient : c));
        }
        return [...prev, newClient];
      });
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
    await fetch(`/api/workspaces/${id}/clients/${clientId}`, { method: "DELETE" });
    setClients((prev) => prev.filter((c) => c.id !== clientId));
  }

  if (!workspace) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  const clientLink = typeof window !== "undefined"
    ? `${window.location.origin}/cliente/${workspace.slug}`
    : `/cliente/${workspace.slug}`;

  return (
    <div className="flex flex-col min-h-screen">
      <Header title={workspace.name} subtitle="Configurações do cliente" />

      <div className="p-6 max-w-2xl space-y-6">
        <Link href="/workspaces">
          <Button variant="ghost" size="sm">
            <ArrowLeft size={14} />
            Voltar
          </Button>
        </Link>

        {/* Informações do cliente */}
        <Card>
          <CardHeader><CardTitle>Informações do Cliente</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="wsName">Nome</Label>
              <Input
                id="wsName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
                placeholder="Nome do cliente"
              />
            </div>
            <div>
              <Label htmlFor="wsLogo">URL do Logo (opcional)</Label>
              <Input
                id="wsLogo"
                type="url"
                value={logo}
                onChange={(e) => setLogo(e.target.value)}
                className="mt-1"
                placeholder="https://..."
              />
              {logo && (
                <div className="mt-2 flex items-center gap-2">
                  <img src={logo} alt="Logo preview" className="w-10 h-10 rounded-lg object-cover border" />
                  <span className="text-xs text-gray-400">Preview do logo</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Link público */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Link2 size={16} />
              <CardTitle>Link de Convite</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Input readOnly value={clientLink} className="text-xs text-gray-500" />
              <Button variant="outline" size="icon" onClick={copyLink}>
                {copied ? <CheckCircle2 size={14} className="text-green-500" /> : <Copy size={14} />}
              </Button>
              <a href={`/cliente/${workspace.slug}`} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="icon">
                  <ExternalLink size={14} />
                </Button>
              </a>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="publicAccess"
                checked={publicAccess}
                onChange={(e) => setPublicAccess(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="publicAccess" className="text-sm">Acesso público (sem senha)</Label>
            </div>
          </CardContent>
        </Card>

        {/* Senha do link */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock size={16} />
              <CardTitle>Senha do Link</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="usePassword"
                checked={usePassword}
                onChange={(e) => setUsePassword(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="usePassword" className="text-sm">Proteger link com senha</Label>
            </div>
            {usePassword && (
              <div>
                <Label htmlFor="sharePassword" className="text-sm">Senha</Label>
                <Input
                  id="sharePassword"
                  type="text"
                  placeholder="Senha de acesso ao link"
                  value={sharePassword}
                  onChange={(e) => setSharePassword(e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-gray-400 mt-1">
                  O cliente precisará digitar esta senha ao acessar o link.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contas de anúncio */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Contas de Anúncio</CardTitle>
              <span className="text-sm text-gray-400">{selected.length} selecionada{selected.length !== 1 ? "s" : ""}</span>
            </div>
          </CardHeader>
          <CardContent>
            {allIntegrations.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                Nenhuma conta conectada. Vá em{" "}
                <Link href="/integracoes" className="text-blue-600 underline">Integrações</Link>.
              </p>
            ) : (
              <div className="space-y-2">
                {allIntegrations.map((int) => {
                  const isSelected = selected.includes(int.id);
                  return (
                    <div
                      key={int.id}
                      onClick={() => toggleAccount(int.id)}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                        isSelected ? "border-blue-500 bg-blue-50" : "border-gray-100 hover:border-gray-200"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">{int.name}</p>
                        <p className="text-xs text-gray-400">{int.bmName ?? int.adAccountId}</p>
                      </div>
                      {isSelected && <CheckCircle2 size={18} className="text-blue-500" />}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Usuários Cliente com login/senha */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound size={16} />
                <CardTitle>Acesso com Login e Senha</CardTitle>
              </div>
              <span className="text-sm text-gray-400">{clients.length} usuário{clients.length !== 1 ? "s" : ""}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-gray-500">
              Crie um login para o cliente acessar o sistema com email e senha, vendo apenas o dashboard dele.
            </p>

            {/* Credenciais criadas com sucesso */}
            {createdCredentials && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-green-700 font-medium text-sm">
                  <CheckCircle2 size={16} />
                  Acesso criado! Compartilhe com o cliente:
                </div>
                <div className="text-sm space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 w-14">Email:</span>
                    <code className="bg-white px-2 py-0.5 rounded border text-xs">{createdCredentials.email}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 w-14">Senha:</span>
                    <code className="bg-white px-2 py-0.5 rounded border text-xs">{createdCredentials.password}</code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => navigator.clipboard.writeText(`Email: ${createdCredentials.email}\nSenha: ${createdCredentials.password}`)}
                    >
                      <Copy size={12} />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-green-600">Acesso via: <strong>{window.location.origin}/login</strong></p>
              </div>
            )}

            {/* Formulário */}
            <div className="space-y-3 border border-gray-100 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Nome do cliente</Label>
                  <Input
                    placeholder="João Silva"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Email *</Label>
                  <Input
                    type="email"
                    placeholder="cliente@email.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddClient()}
                    className="mt-1 h-8 text-sm"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Senha de acesso</Label>
                <div className="relative mt-1">
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Crie uma senha para o cliente"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-8 text-sm pr-9"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowNewPassword((v) => !v)}
                  >
                    {showNewPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              {clientError && (
                <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{clientError}</p>
              )}
              <Button
                size="sm"
                onClick={handleAddClient}
                disabled={addingClient || !newEmail.trim()}
                className="w-full"
              >
                {addingClient ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                Criar acesso
              </Button>
            </div>

            {/* Lista de clientes */}
            {clients.length > 0 && (
              <div className="space-y-2">
                {clients.map((client) => (
                  <div key={client.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{client.name ?? client.email}</p>
                      {client.name && <p className="text-xs text-gray-400">{client.email}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Cliente</Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-gray-400 hover:text-red-500"
                        onClick={() => handleRemoveClient(client.id)}
                      >
                        <UserMinus size={13} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : "Salvar Alterações"}
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Excluir Cliente
          </Button>
        </div>
      </div>
    </div>
  );
}
