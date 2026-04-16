"use client";

import React from 'react';
import { motion } from 'framer-motion';

interface GaugeChartProps {
  value: number;
  max?: number;
  label: string;
  sublabel?: string;
  color?: string;
  format?: (v: number) => string;
}

export function GaugeChart({ 
  value, 
  max = 100, 
  label, 
  sublabel, 
  color = "#3b82f6", 
  format = (v) => `${v}%` 
}: GaugeChartProps) {
  const percentage = Math.min(Math.max(value / max, 0), 1);
  const rotation = (percentage * 180) - 90; // -90 to 90 degrees

  return (
    <div className="flex flex-col items-center justify-center relative py-2 w-full">
      <svg width="100%" height="100" viewBox="0 0 180 100" className="overflow-visible" style={{ maxWidth: 180 }}>
        {/* Background Track */}
        <path
          d="M20 90 A 70 70 0 0 1 160 90"
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        
        {/* Progress Value Track */}
        <motion.path
          initial={{ pathLength: 0 }}
          animate={{ pathLength: percentage }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          d="M20 90 A 70 70 0 0 1 160 90"
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          className="drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]"
          style={{ stroke: color }}
        />

        {/* Needle */}
        <motion.g
          initial={{ rotate: -90 }}
          animate={{ rotate: (percentage * 180) - 90 }}
          transition={{ duration: 1.5, bounce: 0.5, type: 'spring' }}
          style={{ originX: '90px', originY: '90px' }}
        >
          <line
            x1="90" y1="90" x2="90" y2="30"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="90" cy="90" r="5" fill="white" />
        </motion.g>
      </svg>

      <div className="absolute top-[65px] flex flex-col items-center">
        <span className="text-2xl font-black text-white tracking-tighter">{format(value)}</span>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1 text-center max-w-[120px]">
          {label}
        </span>
        {sublabel && (
          <span className="text-[10px] text-emerald-500 font-bold mt-0.5">{sublabel}</span>
        )}
      </div>
    </div>
  );
}
