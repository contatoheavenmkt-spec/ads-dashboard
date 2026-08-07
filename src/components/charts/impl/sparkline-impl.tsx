"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";

/**
 * Sparkline — linha suave, sem eixo, sem grade, sem tooltip.
 *
 * Porta direta do que o chart.js desenhava: `tension: 0.4` (curva suave),
 * `pointRadius: 0` (sem marcadores), `borderWidth: 2`, preenchimento na mesma
 * cor a 10% e todos os eixos ocultos. O equivalente em recharts é um AreaChart
 * com `type="monotone"`, `dot={false}` e nenhum eixo declarado.
 *
 * `isAnimationActive={false}`: é um enfeite dentro de um KpiCard e pode haver
 * vários na tela — animar todos a cada render custa mais do que entrega.
 */
export function SparklineImpl({ data, color }: { data: number[]; color: string }) {
  const serie = data.map((v, i) => ({ i, v }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={serie} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={2}
          fill={color}
          fillOpacity={0.1}
          dot={false}
          activeDot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
