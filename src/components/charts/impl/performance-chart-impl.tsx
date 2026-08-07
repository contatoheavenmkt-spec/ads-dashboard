"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  COR_EIXO,
  COR_GRADE,
  COR_METRICA,
  ESTILO_ITEM_TOOLTIP,
  ESTILO_ROTULO_TOOLTIP,
  ESTILO_TOOLTIP,
} from "../paleta";

export type ChaveMetrica = "spend" | "clicks" | "conversions" | "impressions" | "revenue";

export interface PontoSerie {
  date: string;
  spend: number;
  clicks: number;
  conversions: number;
  impressions: number;
  revenue?: number;
}

export interface PerformanceChartProps {
  data: PontoSerie[];
  metrics?: ChaveMetrica[];
  customLabels?: Partial<Record<ChaveMetrica, string>>;
}

/**
 * Configuração por métrica. Rótulo e formatador são os mesmos de antes; só as
 * cores mudaram, e vêm de `paleta.ts` — onde estão validadas contra daltonismo.
 */
const CONFIG_METRICA: Record<ChaveMetrica, { label: string; color: string; format: (n: number) => string }> = {
  spend: { label: "Investimento", color: COR_METRICA.spend, format: formatCurrency },
  clicks: { label: "Cliques", color: COR_METRICA.clicks, format: formatNumber },
  conversions: { label: "Conversões", color: COR_METRICA.conversions, format: formatNumber },
  impressions: { label: "Impressões", color: COR_METRICA.impressions, format: formatNumber },
  revenue: { label: "Faturamento", color: COR_METRICA.revenue, format: formatCurrency },
};

/** "2026-07-29" → "29/07". Idêntico ao formatDate anterior, inclusive no caso curto. */
function rotuloData(dateStr: string): string {
  const partes = dateStr.split("-");
  if (partes.length < 3) return dateStr;
  const [, mes, dia] = partes;
  return `${dia}/${mes}`;
}

/** 1200 → "1k". Mesma regra do callback do eixo Y no chart.js. */
function rotuloEixoY(v: number): string {
  return v >= 1000 ? `${Math.round(v / 1000)}k` : String(v);
}

export function PerformanceChartImpl({
  data,
  metrics = ["spend", "revenue"],
  customLabels,
}: PerformanceChartProps) {
  // O eixo X mostra a data já formatada; o dado bruto continua intacto.
  const serie = data.map((d) => ({ ...d, _rotulo: rotuloData(d.date) }));

  return (
    <div className="w-full h-full min-h-[180px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={COR_GRADE} vertical={false} />
          <XAxis
            dataKey="_rotulo"
            tick={{ fill: COR_EIXO, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={{ fill: COR_EIXO, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={rotuloEixoY}
            domain={[0, "auto"]}
          />
          {/* Crosshair + tooltip por índice: o chart.js usava
              `interaction: { mode: "index" }`, e é o comportamento certo para
              série temporal — passar o mouse em qualquer ponto do eixo mostra
              todas as séries daquele dia.

              Tooltip NATIVO com contentStyle/itemStyle em vez de um `content`
              próprio: no recharts 3 o tipo `TooltipProps` não expõe `payload`,
              e um componente customizado não compila. É o mesmo padrão dos
              gráficos do admin, que já rodam em produção. */}
          <Tooltip
            contentStyle={ESTILO_TOOLTIP}
            labelStyle={ESTILO_ROTULO_TOOLTIP}
            itemStyle={ESTILO_ITEM_TOOLTIP}
            cursor={{ stroke: COR_EIXO, strokeWidth: 1, strokeDasharray: "3 3" }}
            // Sem anotação de tipo nos parâmetros: o recharts tipa o callback
            // pelo contexto e anotar aqui briga com o genérico.
            formatter={(valor, _nome, item) => {
              const chave = item?.dataKey as ChaveMetrica | undefined;
              const cfg = chave ? CONFIG_METRICA[chave] : undefined;
              return cfg ? cfg.format(Number(valor ?? 0)) : String(valor ?? "");
            }}
          />
          {metrics.map((m) => {
            const cfg = CONFIG_METRICA[m];
            if (!cfg) return null;
            return (
              <Line
                key={m}
                type="monotone"
                dataKey={m}
                // `name` é o rótulo que o tooltip mostra ao lado do valor.
                name={customLabels?.[m] ?? cfg.label}
                stroke={cfg.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                isAnimationActive={false}
                connectNulls
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
