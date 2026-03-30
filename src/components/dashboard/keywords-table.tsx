"use client";

import { Search, TrendingUp, MousePointer2, Target } from "lucide-react";

interface Keyword {
  kw: string;
  matchType: string;
  ctr: string;
  clicks: number;
  conversions: number;
}

interface KeywordsTableProps {
  keywords: Keyword[];
}

export function KeywordsTable({ keywords }: KeywordsTableProps) {
  return (
    <div className="glass-panel rounded-2xl overflow-hidden border border-slate-700/50">
      <div className="p-4 border-b border-slate-700/50 flex items-center justify-between bg-slate-800/30">
        <div className="flex items-center gap-2">
          <Search size={16} className="text-cyan-400" />
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Principais Palavras-Chave</h3>
        </div>
        <span className="text-[10px] font-bold text-slate-500 uppercase">Google Ads</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800/50 bg-slate-900/20">
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Palavra-Chave</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Tipo</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Cliques</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">CTR</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Conv.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {keywords.map((k, i) => (
              <tr key={i} className="group hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3">
                  <span className="text-xs font-medium text-slate-200 group-hover:text-cyan-400 transition-colors">{k.kw}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/50 uppercase tracking-tighter">
                    {k.matchType}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="text-xs font-bold text-white">{k.clicks.toLocaleString()}</span>
                    <MousePointer2 size={10} className="text-slate-600" />
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="text-xs font-bold text-cyan-400">{k.ctr}</span>
                    <TrendingUp size={10} className="text-cyan-800" />
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="text-xs font-bold text-emerald-400">{k.conversions}</span>
                    <Target size={10} className="text-emerald-800" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {keywords.length === 0 && (
        <div className="p-8 text-center text-slate-500 text-xs font-medium italic">
          Nenhuma palavra-chave encontrada para o período.
        </div>
      )}
    </div>
  );
}
