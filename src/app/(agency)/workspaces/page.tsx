"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Building2,
  ExternalLink,
  Plus,
  Settings,
  Users,
} from "lucide-react";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  publicAccess: boolean;
  createdAt: string;
  integrations: Array<{
    integration: { id: string; name: string; platform: string };
  }>;
  clients: Array<{ id: string; email: string }>;
}

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then(setWorkspaces)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="Clientes"
        subtitle="Gerencie os workspaces e dashboards dos seus clientes"
      />

      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-gray-500">
            {workspaces.length} workspace{workspaces.length !== 1 ? "s" : ""} criado{workspaces.length !== 1 ? "s" : ""}
          </p>
          <Link href="/workspaces/novo">
            <Button>
              <Plus size={16} />
              Novo Cliente
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : workspaces.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Users size={28} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Nenhum cliente criado</h3>
            <p className="text-sm text-gray-500 mb-6">
              Crie um workspace para cada cliente e vincule as contas de anúncios
            </p>
            <Link href="/workspaces/novo">
              <Button>
                <Plus size={16} />
                Criar primeiro cliente
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workspaces.map((ws) => (
              <Card key={ws.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-sm">
                        {ws.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{ws.name}</h3>
                        <p className="text-xs text-gray-400">/{ws.slug}</p>
                      </div>
                    </div>
                    <Badge variant={ws.publicAccess ? "success" : "outline"}>
                      {ws.publicAccess ? "Público" : "Privado"}
                    </Badge>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <BarChart3 size={14} />
                      <span>{ws.integrations.length} conta{ws.integrations.length !== 1 ? "s" : ""} de anúncio</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Users size={14} />
                      <span>{ws.clients.length} usuário{ws.clients.length !== 1 ? "s" : ""} cliente</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Link href={`/workspace/${ws.slug}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        <BarChart3 size={13} />
                        Ver Dashboard
                      </Button>
                    </Link>
                    <Link href={`/workspaces/${ws.id}`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Settings size={14} />
                      </Button>
                    </Link>
                    <a
                      href={`/cliente/${ws.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ExternalLink size={14} />
                      </Button>
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
