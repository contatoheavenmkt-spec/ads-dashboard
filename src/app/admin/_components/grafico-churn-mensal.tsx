"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
// Direto de admin-format (e não de admin-ui): este chunk só precisa dos
// formatadores puros, não do toolkit de UI inteiro.
import { COR_SUPERFICIE, formatarPercentual } from "./admin-format";
import {
  COR_GRADE,
  CURSOR_LINHA,
  ESTILO_EIXO,
  ESTILO_ITEM_TOOLTIP,
  ESTILO_ROTULO_TOOLTIP,
  ESTILO_TOOLTIP,
} from "./chart-chrome";

/**
 * Desenho do gráfico "Churn mensal" do dashboard admin.
 *
 * Extraído de `(protected)/page.tsx` só para ser carregado via `next/dynamic`
 * (recharts fora do chunk inicial). A série chega pronta e a cor vem de quem
 * monta a tela (COR_CHURN — o vermelho de estado, legítimo porque a série
 * INTEIRA significa "coisa ruim acontecendo").
 */

interface PontoChurnGrafico {
  /** Rótulo do eixo X, já formatado ("fev/26"). */
  rotulo: string;
  /** Percentual de 0 a 100 (não fração). */
  taxa: number;
}

export function GraficoChurnMensal({ serie, cor }: { serie: PontoChurnGrafico[]; cor: string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={serie} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={COR_GRADE} strokeWidth={1} vertical={false} />
        <XAxis dataKey="rotulo" tick={ESTILO_EIXO} axisLine={false} tickLine={false} tickMargin={10} />
        <YAxis
          tick={ESTILO_EIXO}
          axisLine={false}
          tickLine={false}
          tickMargin={6}
          width={52}
          // Uma casa decimal: churn vive abaixo de 2%, e arredondar
          // para inteiro produziria ticks repetidos ("0%, 0%, 1%,
          // 1%") e um eixo que discorda do tooltip. Como é
          // `maximum`, valor inteiro continua saindo como "12%".
          tickFormatter={(v) => `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
        />
        <Tooltip
          contentStyle={ESTILO_TOOLTIP}
          labelStyle={ESTILO_ROTULO_TOOLTIP}
          itemStyle={ESTILO_ITEM_TOOLTIP}
          cursor={CURSOR_LINHA}
          formatter={(valor) => formatarPercentual(Number(valor))}
        />
        {/* Uma única escala Y: `cancelados` (contagem) NÃO entra
            aqui como segunda linha — duas medidas de escalas
            diferentes no mesmo plano inventam uma correlação que os
            dados não têm. O número do mês fica na legenda abaixo. */}
        <Line
          type="monotone"
          dataKey="taxa"
          name="Churn"
          stroke={cor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={{ r: 4, fill: cor, stroke: COR_SUPERFICIE, strokeWidth: 2 }}
          activeDot={{ r: 6, fill: cor, stroke: COR_SUPERFICIE, strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
