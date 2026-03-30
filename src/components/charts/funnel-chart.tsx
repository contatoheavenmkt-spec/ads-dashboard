"use client";

interface FunnelData {
  impressions: number;
  clicks: number;
  revenue: number;
  conversions: number;
  impressionsLabel?: string;
  clicksLabel?: string;
  conversionLabel?: string;
  rateLabel1?: string;
  rateLabel2?: string;
}

export function FunnelChart({ data }: { data: FunnelData }) {
  const impressionsLabel = data.impressionsLabel || "Impressões";
  const clicksLabel = data.clicksLabel || "Cliques";
  const conversionLabel = data.conversionLabel || "Conversões";
  const rateLabel1 = data.rateLabel1 || "CTR";
  const rateLabel2 = data.rateLabel2 || "Conv";
  const rate1 = data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0;
  const rate2 = data.clicks > 0 ? (data.conversions / data.clicks) * 100 : 0;

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-0.5 w-full max-w-[240px] mx-auto">

      {/* Top bar */}
      <div className="w-full bg-blue-500/80 rounded-t-xl h-14 flex flex-col items-center justify-center text-center">
        <span className="text-[9px] text-blue-100 uppercase font-bold tracking-wider">{impressionsLabel}</span>
        <span className="text-base font-black text-white leading-tight">
          {data.impressions >= 1000 ? `${(data.impressions / 1000).toFixed(0)}K` : data.impressions.toLocaleString()}
        </span>
      </div>

      {/* Rate 1 */}
      <div className="flex items-center justify-center gap-2 py-0.5">
        <div className="flex-1 h-px bg-slate-700/50"></div>
        <span className="text-[9px] font-bold text-blue-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700/50">
          {rateLabel1} {rate1.toFixed(1)}%
        </span>
        <div className="flex-1 h-px bg-slate-700/50"></div>
      </div>

      {/* Middle bar */}
      <div className="w-[88%] bg-blue-400/80 h-12 flex flex-col items-center justify-center text-center">
        <span className="text-[9px] text-blue-100 uppercase font-bold tracking-wider">{clicksLabel}</span>
        <span className="text-base font-black text-white leading-tight">
          {data.clicks.toLocaleString()}
        </span>
      </div>

      {/* Rate 2 */}
      <div className="flex items-center justify-center gap-2 py-0.5 w-[88%]">
        <div className="flex-1 h-px bg-slate-700/50"></div>
        <span className="text-[9px] font-bold text-blue-300 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700/50">
          {rateLabel2} {rate2.toFixed(1)}%
        </span>
        <div className="flex-1 h-px bg-slate-700/50"></div>
      </div>

      {/* Conversões */}
      <div className="w-[68%] bg-blue-600/90 rounded-b-xl h-14 flex flex-col items-center justify-center text-center shadow-lg shadow-blue-500/20">
        <span className="text-[9px] text-blue-100 uppercase font-bold tracking-wider">{conversionLabel}</span>
        <span className="text-base font-black text-white leading-tight">
          {data.conversions.toLocaleString()}
        </span>
      </div>

    </div>
  );
}
