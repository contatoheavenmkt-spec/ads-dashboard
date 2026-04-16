"use client";

import { useEffect, useState } from "react";

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

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} mil`;
  return n.toLocaleString("pt-BR");
}

export function FunnelChart({ data }: { data: FunnelData }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  const impressionsLabel = data.impressionsLabel ?? "Impressões";
  const clicksLabel      = data.clicksLabel      ?? "Cliques";
  const conversionLabel  = data.conversionLabel  ?? "Conversões";
  const rateLabel1       = data.rateLabel1       ?? "CTR";
  const rateLabel2       = data.rateLabel2       ?? "Taxa Conv.";

  const ctr         = data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0;
  const convRate    = data.clicks > 0 ? (data.conversions / data.clicks) * 100 : 0;
  const overallRate = data.impressions > 0 ? (data.conversions / data.impressions) * 100 : 0;

  const W = 200;
  const H = 58;   // height of each funnel step
  const G = 10;   // gap between steps
  const TOTAL = 3 * H + 2 * G; // 194

  // Each step: top-left, top-right, bottom-right, bottom-left (correct trapezoid order)
  const insets = [
    { tl: 0,         tr: W,         bl: W * 0.10, br: W * 0.90 },  // Step 1
    { tl: W * 0.10,  tr: W * 0.90,  bl: W * 0.24, br: W * 0.76 },  // Step 2
    { tl: W * 0.24,  tr: W * 0.76,  bl: W * 0.38, br: W * 0.62 },  // Step 3
  ];

  const steps = [
    { label: impressionsLabel, value: data.impressions, grad: "g0", delay: 0 },
    { label: clicksLabel,      value: data.clicks,      grad: "g1", delay: 150 },
    { label: conversionLabel,  value: data.conversions, grad: "g2", delay: 300 },
  ];

  const rates = [
    { label: rateLabel1, value: `${ctr.toFixed(2).replace(".", ",")}%`,      delay: 80  },
    { label: rateLabel2, value: `${convRate.toFixed(2).replace(".", ",")}%`, delay: 230 },
  ];

  const bottomStats = [
    { label: rateLabel1,   value: `${ctr.toFixed(2).replace(".", ",")}%`         },
    { label: rateLabel2,   value: `${convRate.toFixed(2).replace(".", ",")}%`     },
    { label: "Taxa Geral", value: `${overallRate.toFixed(2).replace(".", ",")}%`  },
  ];

  return (
    <div className="flex-1 flex flex-col w-full h-full min-h-0 select-none">
      {/* Funnel */}
      <div className="flex-1 flex items-center justify-center min-h-0">
        <div className="w-full" style={{ maxWidth: 220 }}>
          <svg
            viewBox={`0 0 ${W} ${TOTAL}`}
            width="100%"
            preserveAspectRatio="xMidYMid meet"
            overflow="visible"
          >
            <defs>
              <linearGradient id="g0" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1e3a8a" />
                <stop offset="100%" stopColor="#1d4ed8" />
              </linearGradient>
              <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1d4ed8" />
                <stop offset="100%" stopColor="#2563eb" />
              </linearGradient>
              <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
              <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="white" stopOpacity="0.14" />
                <stop offset="100%" stopColor="white" stopOpacity="0"    />
              </linearGradient>
              <filter id="stepglow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {steps.map((step, i) => {
              const ins = insets[i];
              const yOff = i * (H + G);

              // Correct trapezoid: top-left, top-right, bottom-right, bottom-left
              const mainPts = `${ins.tl},${yOff} ${ins.tr},${yOff} ${ins.br},${yOff + H} ${ins.bl},${yOff + H}`;
              const cx = W / 2;
              const cy = yOff + H / 2;

              return (
                <g
                  key={i}
                  style={{
                    opacity:    visible ? 1 : 0,
                    transform:  visible ? "none" : "translateY(14px)",
                    transition: `opacity 0.55s ease ${step.delay}ms, transform 0.55s ease ${step.delay}ms`,
                  }}
                >
                  {/* Drop shadow */}
                  <polygon
                    points={mainPts}
                    fill={`rgba(37,99,235,0.3)`}
                    transform="translate(0,5)"
                    style={{ filter: "blur(7px)" }}
                  />
                  {/* Main fill */}
                  <polygon points={mainPts} fill={`url(#${step.grad})`} />
                  {/* Shine */}
                  <polygon points={mainPts} fill="url(#shine)" />
                  {/* Top edge highlight */}
                  <line
                    x1={ins.tl} y1={yOff}
                    x2={ins.tr} y2={yOff}
                    stroke="rgba(255,255,255,0.22)"
                    strokeWidth="1"
                  />

                  {/* Step label */}
                  <text
                    x={cx} y={cy - 9}
                    textAnchor="middle"
                    fill="rgba(191,219,254,0.85)"
                    fontSize="7"
                    fontWeight="800"
                    letterSpacing="1.4"
                  >
                    {step.label.toUpperCase()}
                  </text>
                  {/* Step value */}
                  <text
                    x={cx} y={cy + 11}
                    textAnchor="middle"
                    fill="white"
                    fontSize="15"
                    fontWeight="900"
                  >
                    {fmt(step.value)}
                  </text>
                </g>
              );
            })}

            {/* Rate badges in gaps between steps */}
            {rates.map((rate, i) => {
              const gapCenterY = (i + 1) * H + i * G + G / 2;
              const badgeW = 94;
              const badgeH = 13;
              const bx = (W - badgeW) / 2;
              const by = gapCenterY - badgeH / 2;

              return (
                <g
                  key={i}
                  style={{
                    opacity:    visible ? 1 : 0,
                    transition: `opacity 0.45s ease ${rate.delay + 250}ms`,
                  }}
                >
                  {/* Left line */}
                  <line
                    x1={insets[i].bl + 4} y1={gapCenterY}
                    x2={bx - 2}           y2={gapCenterY}
                    stroke="rgba(59,130,246,0.3)"
                    strokeWidth="0.8"
                    strokeDasharray="3 2"
                  />
                  {/* Badge background */}
                  <rect
                    x={bx} y={by}
                    width={badgeW} height={badgeH}
                    rx="6.5"
                    fill="rgba(8,17,38,0.92)"
                    stroke="rgba(59,130,246,0.45)"
                    strokeWidth="0.8"
                  />
                  {/* Badge text */}
                  <text
                    x={W / 2} y={gapCenterY + 4.5}
                    textAnchor="middle"
                    fill="#93c5fd"
                    fontSize="7"
                    fontWeight="700"
                  >
                    {rate.label}: {rate.value}
                  </text>
                  {/* Right line */}
                  <line
                    x1={bx + badgeW + 2} y1={gapCenterY}
                    x2={insets[i + 1].tr - 4} y2={gapCenterY}
                    stroke="rgba(59,130,246,0.3)"
                    strokeWidth="0.8"
                    strokeDasharray="3 2"
                  />
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Bottom stats */}
      <div
        className="grid grid-cols-3 gap-1 sm:gap-1.5 mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-slate-700/40"
        style={{
          opacity:    visible ? 1 : 0,
          transition: "opacity 0.5s ease 650ms",
        }}
      >
        {bottomStats.map((s, i) => (
          <div
            key={i}
            className="flex flex-col items-center justify-center bg-slate-800/60 rounded-lg py-1.5 sm:py-2 border border-slate-700/30 gap-0.5 min-w-0"
          >
            <span className="text-[6px] sm:text-[7px] font-bold text-slate-500 uppercase tracking-wider text-center leading-tight px-0.5 sm:px-1 truncate w-full">
              {s.label}
            </span>
            <span className="text-[10px] sm:text-[11px] font-black text-blue-400">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
