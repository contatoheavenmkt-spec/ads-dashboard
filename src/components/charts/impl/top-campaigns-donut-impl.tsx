"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  COR_OUTRAS,
  COR_SUPERFICIE,
  ESTILO_ITEM_TOOLTIP,
  ESTILO_ROTULO_TOOLTIP,
  ESTILO_TOOLTIP,
  PALETA_CATEGORICA,
} from "../paleta";

export interface Campanha {
  id: string;
  name: string;
  conversions: number;
}

export interface TopCampaignsDonutProps {
  campaigns: Campanha[];
  conversionLabel?: string;
}

/**
 * Rosca das campanhas que mais converteram.
 *
 * Mantém a forma anterior: top 7 + "Outras", furo de 70%, rótulo central com o
 * total e legenda própria em duas colunas. O que mudou por dentro foi a
 * biblioteca (chart.js → recharts) e as cores, que agora vêm de `paleta.ts`
 * validada contra daltonismo — a anterior tinha fatias vizinhas com ΔE 0,9,
 * literalmente a mesma cor para quem tem protanopia.
 *
 * A legenda com o nome de cada campanha ao lado do ponto colorido é a
 * codificação secundária: a identidade nunca depende só da cor.
 */
export function TopCampaignsDonutImpl({
  campaigns,
  conversionLabel = "CONVERSÕES",
}: TopCampaignsDonutProps) {
  const topCampanhas = [...campaigns].sort((a, b) => b.conversions - a.conversions).slice(0, 7);

  const outras =
    campaigns.length > 7 ? campaigns.slice(7).reduce((acc, c) => acc + c.conversions, 0) : 0;

  // "Outras" fica FORA da ordem categórica, em cinza: é ausência de identidade,
  // não mais uma categoria. Regra do guia: o 8º item não ganha hue novo.
  const fatias = [
    ...topCampanhas.map((c, i) => ({
      nome: c.name,
      valor: c.conversions,
      cor: PALETA_CATEGORICA[i % PALETA_CATEGORICA.length],
    })),
    ...(outras > 0 ? [{ nome: "Outras", valor: outras, cor: COR_OUTRAS }] : []),
  ];

  const total = campaigns.reduce((acc, c) => acc + c.conversions, 0);
  const temDado = fatias.some((f) => f.valor > 0);

  return (
    <div className="flex flex-col items-center w-full">
      <div className="w-44 h-44 relative">
        {temDado && (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={fatias}
                dataKey="valor"
                nameKey="nome"
                innerRadius="70%"
                outerRadius="100%"
                // 2px de superfície entre fatias: separa vizinhas sem depender
                // da diferença de cor (era `spacing: 4` no chart.js).
                paddingAngle={2}
                stroke={COR_SUPERFICIE}
                strokeWidth={2}
                isAnimationActive={false}
              >
                {fatias.map((f) => (
                  <Cell key={f.nome} fill={f.cor} />
                ))}
              </Pie>
              {/* Tooltip nativo: `TooltipProps` do recharts 3 não expõe
                  `payload`, então `content` customizado não compila. */}
              <Tooltip
                contentStyle={ESTILO_TOOLTIP}
                labelStyle={ESTILO_ROTULO_TOOLTIP}
                itemStyle={ESTILO_ITEM_TOOLTIP}
                formatter={(valor) => Number(valor ?? 0).toLocaleString("pt-BR")}
              />
            </PieChart>
          </ResponsiveContainer>
        )}

        {/* Rótulo central — total de conversões. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
          <span className="text-[10px] text-slate-500 font-medium uppercase tracking-tighter leading-none">
            {conversionLabel}
          </span>
          <span className="text-lg font-bold text-slate-100">{total}</span>
        </div>
      </div>

      {/* Legenda própria: nome ao lado do ponto, para a identidade não ser só cor. */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 w-full">
        {topCampanhas.map((c, i) => (
          <div key={c.id ?? i} className="flex items-center gap-2 min-w-0">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: PALETA_CATEGORICA[i % PALETA_CATEGORICA.length] }}
            />
            <span className="text-[9px] text-slate-400 truncate">{c.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
