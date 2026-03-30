"use client";

import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp, ArrowUp, ArrowDown } from "lucide-react";
import { Sparkline } from "@/components/charts/sparkline";

interface KpiCardProps {
  title: string;
  value: string;
  change?: number;
  sparklineData?: number[];
  sparklineColor?: string;
  icon?: any;
  iconColor?: string;
  iconBg?: string;
}

export function KpiCard({
  title,
  value,
  change,
  sparklineData = [10, 15, 8, 12, 18, 14, 20, 15, 25, 22],
  sparklineColor = "#3b82f6",
  icon: Icon,
  iconColor,
  iconBg,
}: KpiCardProps) {
  const isPositive = change !== undefined && change >= 0;

  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col justify-between h-28 relative overflow-hidden group">
      <div className="relative z-10">
        <div className="flex justify-between items-start mb-1">
          <h3 className="text-xs text-slate-400 font-medium uppercase tracking-wider">{title}</h3>
          {Icon && (
            <div className={cn("p-1.5 rounded-lg", iconBg || "bg-slate-800")}>
              <Icon size={14} className={iconColor || "text-slate-400"} />
            </div>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl lg:text-2xl font-bold text-slate-100">{value}</span>
          {change !== undefined && (
            <span className={cn(
              "text-[10px] flex items-center gap-0.5 font-bold px-1.5 py-0.5 rounded-full",
              isPositive ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10"
            )}>
              {isPositive ? <ArrowUp size={10} strokeWidth={3} /> : <ArrowDown size={10} strokeWidth={3} />}
              {Math.abs(change).toFixed(1)}%
            </span>
          )}
        </div>
      </div>
      
      {/* Background Sparkline */}
      <div className="absolute bottom-0 left-0 right-0 h-12 opacity-60 pointer-events-none group-hover:opacity-100 transition-opacity">
        <Sparkline data={sparklineData} color={sparklineColor} />
      </div>
      
      {/* Hover decoration */}
      <div className={cn(
        "absolute top-0 right-0 w-16 h-16 blur-2xl opacity-0 group-hover:opacity-20 transition-opacity",
        isPositive ? "bg-emerald-500" : "bg-rose-500"
      )}></div>
    </div>
  );
}

