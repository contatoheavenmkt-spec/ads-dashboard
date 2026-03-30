"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, Loader2, Plus } from "lucide-react";

interface Integration {
  id: string;
  name: string;
  platform: string;
  adAccountId: string;
  bmName: string | null;
}

export default function NovoWorkspacePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [logo, setLogo] = useState("");
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/integrations").then((r) => r.json()).then(setIntegrations);
  }, []);

  function toggleAccount(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Nome do cliente é obrigatório");
      return;
    }

    setSaving(true);
    setError("");

    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, logo, integrationIds: selected }),
    });

    if (res.ok) {
      router.push("/workspaces");
    } else {
      const data = await res.json();
      setError(data.error ?? "Erro ao criar workspace");
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Novo Cliente" subtitle="Crie um workspace para um novo cliente" />

      <div className="p-6 max-w-2xl">
        <Link href="/workspaces">
          <Button variant="ghost" size="sm" className="mb-6">
            <ArrowLeft size={14} />
            Voltar
          </Button>
        </Link>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informações do Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">Nome do Cliente *</Label>
                <Input
                  id="name"
                  placeholder="Ex: Loja de Roupas Fashion"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="logo">URL do Logo (opcional)</Label>
                <Input
                  id="logo"
                  type="url"
                  placeholder="https://..."
                  value={logo}
                  onChange={(e) => setLogo(e.target.value)}
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Contas de Anúncio</CardTitle>
                <span className="text-sm text-gray-400">{selected.length} selecionada{selected.length !== 1 ? "s" : ""}</span>
              </div>
            </CardHeader>
            <CardContent>
              {integrations.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-gray-400 mb-3">
                    Nenhuma conta conectada ainda.
                  </p>
                  <Link href="/integracoes">
                    <Button variant="outline" size="sm">
                      <Plus size={12} />
                      Conectar contas
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {integrations.map((int) => {
                    const isSelected = selected.includes(int.id);
                    return (
                      <div
                        key={int.id}
                        onClick={() => toggleAccount(int.id)}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-100 hover:border-gray-200"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              isSelected ? "bg-blue-100" : "bg-gray-100"
                            }`}
                          >
                            <span className="text-xs font-bold uppercase text-gray-600">
                              {int.platform.slice(0, 1)}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{int.name}</p>
                            <p className="text-xs text-gray-400">{int.bmName}</p>
                          </div>
                        </div>
                        {isSelected && (
                          <CheckCircle2 size={18} className="text-blue-500" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">{error}</p>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Criando...
                </>
              ) : (
                "Criar Workspace"
              )}
            </Button>
            <Link href="/workspaces">
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
