"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
// Direto de admin-format (e não de admin-ui): este chunk só precisa dos
// formatadores puros, não do toolkit de UI inteiro.
import { COR_SUPERFICIE, formatarNumero } from "./admin-format";
import {
  COR_GRADE,
  CURSOR_LINHA,
  ESTILO_EIXO,
  ESTILO_ITEM_TOOLTIP,
  ESTILO_ROTULO_TOOLTIP,
  ESTILO_TOOLTIP,
} from "./chart-chrome";

/**
 * Desenho do gráfico "Visualizações por dia" do /admin/analytics.
 *
 * Extraído de `analytics/page.tsx` só para ser carregado via `next/dynamic`
 * (recharts fora do chunk inicial). As cores vêm de quem monta a tela
 * (COR_VISUALIZACOES / COR_UNICOS — a mesma matiz em dois passos de
 * luminosidade, porque `unique` é um SUBCONJUNTO de `views`); a legenda que as
 * nomeia continua na página, logo abaixo deste desenho.
 */

/** Ids fixos dos gradientes: o conteúdo é constante, então dois <defs> iguais
 *  resolvem para a mesma coisa. `useId()` já mudou de formato entre versões do
 *  React e gera caracteres que atrapalham dentro de `url(#...)`. */
const ID_GRAD_VIEWS = "dashfy-analytics-grad-views";
const ID_GRAD_UNICOS = "dashfy-analytics-grad-unicos";

/**
 * "2026-06-28" → "28/06".
 *
 * Fatia a string; NÃO usa Date. A forma curta ISO é lida como UTC pelo JS e,
 * num fuso negativo (Brasília = UTC-3), `new Date("2026-06-28")` cai às 21h de
 * 27/06 — era assim que o eixo inteiro do gráfico antigo exibia o dia errado.
 */
function rotuloDia(data: string): string {
  if (typeof data !== "string") return "—";
  const [, mes, dia] = data.split("-");
  if (!mes || !dia) return data || "—";
  return `${dia}/${mes}`;
}

/** "2026-06-28" → "28/06/2026" (rótulo do tooltip). Mesma regra de cima. */
function rotuloDiaCompleto(data: string): string {
  if (typeof data !== "string") return "—";
  const [ano, mes, dia] = data.split("-");
  if (!ano || !mes || !dia) return data || "—";
  return `${dia}/${mes}/${ano}`;
}

interface PontoDiaGrafico {
  /** "2026-06-28" — data pura, SEM hora. Nunca passe por `new Date`. */
  date: string;
  views: number;
  unique: number;
}

export function GraficoVisualizacoesDia({
  serie,
  corViews,
  corUnicos,
}: {
  serie: PontoDiaGrafico[];
  corViews: string;
  corUnicos: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={serie} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
        <defs>
          {/* Gradiente vertical: opaco na linha, dissolvendo até
              zero no chão — o preenchimento dá o volume sem
              competir com a linha, que é quem carrega o valor. */}
          <linearGradient id={ID_GRAD_VIEWS} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={corViews} stopOpacity={0.34} />
            <stop offset="100%" stopColor={corViews} stopOpacity={0} />
          </linearGradient>
          <linearGradient id={ID_GRAD_UNICOS} x1="0" y1="0" x2="0" y2="1">
            {/* Metade da opacidade da série de cima: as duas áreas
                se sobrepõem (únicos ⊆ visualizações) e um fill
                forte embaixo enlamearia a região comum. */}
            <stop offset="0%" stopColor={corUnicos} stopOpacity={0.16} />
            <stop offset="100%" stopColor={corUnicos} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Grade só horizontal: o eixo X é tempo contínuo, e uma
            linha vertical por dia viraria uma cerca sobre a curva. */}
        <CartesianGrid stroke={COR_GRADE} strokeWidth={1} vertical={false} />

        <XAxis
          dataKey="date"
          tickFormatter={(v) => rotuloDia(String(v))}
          tick={ESTILO_EIXO}
          axisLine={false}
          tickLine={false}
          tickMargin={10}
          interval="preserveStartEnd"
          // 90 dias não cabem como 90 rótulos: o recharts descarta
          // ticks até respeitar este vão mínimo entre eles.
          minTickGap={28}
        />
        <YAxis
          tick={ESTILO_EIXO}
          axisLine={false}
          tickLine={false}
          tickMargin={6}
          width={52}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={ESTILO_TOOLTIP}
          labelStyle={ESTILO_ROTULO_TOOLTIP}
          itemStyle={ESTILO_ITEM_TOOLTIP}
          cursor={CURSOR_LINHA}
          labelFormatter={(rotulo) => rotuloDiaCompleto(String(rotulo))}
          // Sem anotação de tipo nos parâmetros: o recharts tipa o
          // callback pelo contexto e anotar aqui brigaria com o
          // genérico do Tooltip.
          formatter={(valor) => formatarNumero(Number(valor))}
        />

        {/* Ordem importa: o total vai primeiro (fica ATRÁS) e os
            únicos por cima. Como únicos ≤ views sempre, a série
            menor nunca é encoberta pela maior. */}
        <Area
          type="monotone"
          dataKey="views"
          name="Visualizações"
          stroke={corViews}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={`url(#${ID_GRAD_VIEWS})`}
          dot={false}
          // Anel de 2px na cor da superfície: o ponto continua
          // legível mesmo caindo em cima da própria linha.
          activeDot={{ r: 5, fill: corViews, stroke: COR_SUPERFICIE, strokeWidth: 2 }}
        />
        <Area
          type="monotone"
          dataKey="unique"
          name="Visitantes únicos"
          stroke={corUnicos}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={`url(#${ID_GRAD_UNICOS})`}
          dot={false}
          activeDot={{ r: 5, fill: corUnicos, stroke: COR_SUPERFICIE, strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
