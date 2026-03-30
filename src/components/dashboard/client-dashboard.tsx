"use client";

import { useEffect, useState } from "react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PerformanceChart } from "@/components/charts/performance-chart";
import { CampaignsTable } from "@/components/dashboard/campaigns-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  DollarSign,
  Eye,
  MousePointer,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
interface MetricsData {
  timeSeries: { date: string; spend: number; impressions: number; clicks: number; conversions: number; revenue: number }[];
  totals: {
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
    cpc: number;
    cpa: number;
    roas: number;
    ctr: number;
  };
  campaigns: { id: string; name: string; accountId: string; objective: string; status: string; spend: number; impressions: number; clicks: number; conversions: number; cpc: number; cpa: number; roas: number; ctr: number }[];
}

interface ClientDashboardProps {
  workspaceId: string;
  workspaceName: string;
  logo?: string | null;
}

const PERIOD_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "60d", days: 60 },
  { label: "90d", days: 90 },
];

export function ClientDashboard({ workspaceId, workspaceName, logo }: ClientDashboardProps) {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/metrics?workspaceId=${workspaceId}&days=${days}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [workspaceId, days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!data || data.totals.spend === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <TrendingUp size={28} className="text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Nenhuma conta vinculada</h3>
        <p className="text-sm text-gray-400">
          Aguarde o administrador vincular as contas de anúncio ao seu workspace.
        </p>
      </div>
    );
  }

  const t = data.totals;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Período:</span>
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map((opt) => (
            <Button
              key={opt.days}
              variant={days === opt.days ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(opt.days)}
              className="h-7 px-3 text-xs"
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Investimento"
          value={formatCurrency(t.spend)}
          change={12.4}
          icon={DollarSign}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
        <KpiCard
          title="Impressões"
          value={formatNumber(t.impressions)}
          change={8.1}
          icon={Eye}
          iconColor="text-purple-600"
          iconBg="bg-purple-50"
        />
        <KpiCard
          title="Cliques"
          value={formatNumber(t.clicks)}
          change={5.7}
          icon={MousePointer}
          iconColor="text-green-600"
          iconBg="bg-green-50"
        />
        <KpiCard
          title="Conversões"
          value={formatNumber(t.conversions)}
          change={18.3}
          icon={Target}
          iconColor="text-orange-600"
          iconBg="bg-orange-50"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <KpiCard
          title="CPC"
          value={formatCurrency(t.cpc)}
          change={-3.2}
          icon={MousePointer}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
        <KpiCard
          title="CPA"
          value={formatCurrency(t.cpa)}
          change={-6.1}
          icon={Users}
          iconColor="text-indigo-600"
          iconBg="bg-indigo-50"
        />
        <KpiCard
          title="ROAS"
          value={`${t.roas.toFixed(2)}x`}
          change={9.8}
          icon={TrendingUp}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
        />
      </div>

      {/* Gráfico */}
      <Card>
        <CardHeader>
          <CardTitle>Evolução do Investimento — Últimos {days} dias</CardTitle>
        </CardHeader>
        <CardContent>
          <PerformanceChart
            data={data.timeSeries}
            metrics={["spend", "conversions"]}
          />
        </CardContent>
      </Card>

      {/* Cliques e Impressões */}
      <Card>
        <CardHeader>
          <CardTitle>Cliques e Impressões</CardTitle>
        </CardHeader>
        <CardContent>
          <PerformanceChart
            data={data.timeSeries}
            metrics={["clicks", "impressions"]}
          />
        </CardContent>
      </Card>

      {/* Campanhas */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Campanhas</CardTitle>
            <span className="text-sm text-gray-400">
              {data.campaigns?.filter((c) => c.status === "ACTIVE").length ?? 0} ativas
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0 pb-4">
          <CampaignsTable campaigns={data.campaigns ?? []} showExport />
        </CardContent>
      </Card>
    </div>
  );
}
