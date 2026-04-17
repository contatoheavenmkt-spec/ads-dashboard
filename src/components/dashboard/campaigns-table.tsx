"use client";

import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { Download, TrendingUp, Zap } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  accountId: string;
  objective: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpc: number;
  cpa: number;
  roas: number;
  ctr: number;
}

interface CampaignsTableProps {
  campaigns: Campaign[];
  limit?: number;
  showExport?: boolean;
}

function exportToCSV(campaigns: Campaign[]) {
  const headers = ["Campanha", "Status", "Investimento", "Impressões", "Cliques", "Conversões", "CPA", "ROAS"];
  const rows = campaigns.map((c) => [
    `"${c.name}"`,
    c.status,
    c.spend.toFixed(2),
    c.impressions,
    c.clicks,
    c.conversions,
    c.cpa.toFixed(2),
    c.roas.toFixed(2),
  ]);

  const csv = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `campanhas_marketing.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function CampaignsTable({ campaigns, limit, showExport }: CampaignsTableProps) {
  const data = limit ? campaigns.slice(0, limit) : campaigns;

  // Max values for relative bar background
  const maxSpend = Math.max(...campaigns.map(c => c.spend), 1);
  const maxConv = Math.max(...campaigns.map(c => c.conversions), 1);

  return (
    <div className="glass-panel rounded-xl overflow-hidden flex flex-col border-none shadow-2xl">
      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full text-left text-sm whitespace-nowrap min-w-[500px]">
          <thead className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-800/50 border-b border-slate-700/50">
            <tr>
              <th className="px-4 py-4 font-semibold" scope="col">#</th>
              <th className="px-4 py-4 font-semibold" scope="col">Campanha</th>
              <th className="px-4 py-4 font-semibold" scope="col">Objetivo</th>
              <th className="px-4 py-4 font-semibold text-right" scope="col">Investimento</th>
              <th className="px-4 py-4 font-semibold text-right" scope="col">CPA</th>
              <th className="px-4 py-4 font-semibold text-right" scope="col flex items-center justify-end gap-1">
                Conversões
                <TrendingUp size={12} className="text-blue-400 inline ml-1" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30 text-slate-300">
            {data.map((campaign, idx) => {
              const spendWidth = Math.min((campaign.spend / maxSpend) * 100, 100);
              const convWidth = Math.min((campaign.conversions / maxConv) * 100, 100);

              return (
                <tr key={campaign.id} className="hover:bg-slate-800/50 transition-colors group">
                  <td className="px-4 py-3.5 text-slate-500 text-xs">{idx + 1}.</td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-100 group-hover:text-blue-400 transition-colors">
                        {campaign.name}
                      </span>
                      <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">
                        ID: {campaign.accountId}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] uppercase font-bold text-slate-400 border border-slate-700">
                      {campaign.objective}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-medium relative overflow-hidden min-w-[140px]">
                    <div 
                      className="absolute inset-y-0 right-0 bg-blue-600/10 z-0 transition-all duration-1000" 
                      style={{ width: `${spendWidth}%` }}
                    />
                    <span className="relative z-10 text-blue-200">
                      {formatCurrency(campaign.spend)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right text-slate-400">
                    {formatCurrency(campaign.cpa)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-medium relative overflow-hidden min-w-[100px]">
                    <div 
                      className="absolute inset-y-0 right-0 bg-blue-500/30 z-0 transition-all duration-1000" 
                      style={{ width: `${convWidth}%` }}
                    />
                    <span className="relative z-10 text-white font-bold">
                      {campaign.conversions}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {data.length > 0 && (
            <tfoot className="font-bold text-slate-100 bg-slate-800/80 border-t border-slate-700/50">
              <tr>
                <td className="px-4 py-4" colSpan={3}>Totais do Período</td>
                <td className="px-4 py-4 text-right text-blue-300">
                  {formatCurrency(campaigns.reduce((acc, c) => acc + c.spend, 0))}
                </td>
                <td className="px-4 py-4 text-right">
                  {formatCurrency(campaigns.reduce((acc, c) => acc + c.spend, 0) / Math.max(campaigns.reduce((acc, c) => acc + c.conversions, 0), 1))}
                </td>
                <td className="px-4 py-4 text-right text-white">
                  {campaigns.reduce((acc, c) => acc + c.conversions, 0)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
        {data.length === 0 && (
          <div className="py-20 text-center text-slate-500 border-t border-slate-700/30">
            <Zap className="mx-auto mb-2 opacity-20" size={40} />
            Nenhuma campanha ativa encontrada para os filtros selecionados.
          </div>
        )}
      </div>
      
      <div className="px-4 py-3 border-t border-slate-700/50 flex justify-between items-center text-[10px] text-slate-500 uppercase font-bold bg-slate-900/40">
        <div className="flex items-center gap-4">
          <span>Mostrando {data.length} de {campaigns.length} itens</span>
          {showExport && (
            <button 
              onClick={() => exportToCSV(campaigns)}
              className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 rounded hover:bg-blue-500/10"
            >
              <Download size={12} />
              EXPORTAR RELATÓRIO
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button className="p-1 px-2 rounded bg-slate-800 border border-slate-700 hover:text-slate-200 transition-colors disabled:opacity-30">Anterior</button>
          <button className="p-1 px-2 rounded bg-slate-800 border border-slate-700 hover:text-slate-200 transition-colors disabled:opacity-30">Próximo</button>
        </div>
      </div>
    </div>
  );
}

