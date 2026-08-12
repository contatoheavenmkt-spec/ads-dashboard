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
    <div className="flex w-full flex-col items-center justify-center py-2">
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

      {/*
        Em FLUXO com margem negativa, não `absolute`.
        Posicionado de forma absoluta, este bloco vazava para fora do card:
        no celular o sublabel ("114 conv.") era cortado pela borda e ainda
        aparecia como um borrão atrás do backdrop-blur do card seguinte.
        Puxado por margem, o texto continua dentro do arco mas o card cresce
        junto e nada é cortado.
      */}
      <div className="-mt-[42px] flex flex-col items-center">
        <span className="text-2xl font-black tracking-tighter text-white">{format(value)}</span>
        <span className="mt-1 max-w-[140px] text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
          {label}
        </span>
        {sublabel && (
          <span className="mt-0.5 text-[10px] font-bold text-emerald-500">{sublabel}</span>
        )}
      </div>
    </div>
  );
}
