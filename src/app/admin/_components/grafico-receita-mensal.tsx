"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
// Direto de admin-format (e não de admin-ui): este chunk só precisa dos
// formatadores puros, não do toolkit de UI inteiro.
import { COR_SUPERFICIE, formatarMoeda } from "./admin-format";
import {
  COR_GRADE,
  CURSOR_LINHA,
  ESTILO_EIXO,
  ESTILO_ITEM_TOOLTIP,
  ESTILO_ROTULO_TOOLTIP,
  ESTILO_TOOLTIP,
} from "./chart-chrome";

/**
 * Desenho do gráfico "Receita mensal" do dashboard admin.
 *
 * Extraído de `(protected)/page.tsx` só para ser carregado via `next/dynamic`:
 * é o que mantém o recharts fora do chunk inicial do dashboard. Nenhuma regra
 * de dados mora aqui — a série chega pronta e a cor da linha vem de quem monta
 * a tela (COR_RECEITA continua definida lá, ao lado das outras cores de série).
 */

/**
 * Id fixo para o gradiente do <defs>, pelo mesmo motivo documentado em
 * world-map.tsx: `useId()` do React já mudou de formato entre versões e gera
 * caracteres que atrapalham dentro de `url(#...)`. O conteúdo do gradiente é
 * constante, então um id duplicado resolveria para algo idêntico.
 */
const ID_GRADIENTE_RECEITA = "dashfy-admin-grad-receita";

/** Eixo Y de dinheiro: "R$ 600" / "R$ 7,2 mil". Rótulo completo fica no tooltip. */
function moedaCompacta(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1000) {
    return `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  }
  return `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

interface PontoReceitaGrafico {
  /** Rótulo do eixo X, já formatado ("fev/26"). */
  rotulo: string;
  receita: number;
}

export function GraficoReceitaMensal({ serie, cor }: { serie: PontoReceitaGrafico[]; cor: string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={serie} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id={ID_GRADIENTE_RECEITA} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cor} stopOpacity={0.32} />
            <stop offset="100%" stopColor={cor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={COR_GRADE} strokeWidth={1} vertical={false} />
        <XAxis dataKey="rotulo" tick={ESTILO_EIXO} axisLine={false} tickLine={false} tickMargin={10} />
        <YAxis
          tick={ESTILO_EIXO}
          axisLine={false}
          tickLine={false}
          tickMargin={6}
          width={68}
          tickFormatter={(v) => moedaCompacta(Number(v))}
        />
        <Tooltip
          contentStyle={ESTILO_TOOLTIP}
          labelStyle={ESTILO_ROTULO_TOOLTIP}
          itemStyle={ESTILO_ITEM_TOOLTIP}
          cursor={CURSOR_LINHA}
          // Sem anotação de tipo nos parâmetros: o recharts tipa o
          // callback pelo contexto, e anotar aqui brigaria com o
          // genérico do Tooltip.
          formatter={(valor) => formatarMoeda(Number(valor))}
        />
        <Area
          type="monotone"
          dataKey="receita"
          name="Receita"
          stroke={cor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={`url(#${ID_GRADIENTE_RECEITA})`}
          dot={false}
          // Anel de 2px na cor da superfície: o ponto continua
          // legível mesmo quando cai em cima da própria linha.
          activeDot={{ r: 5, fill: cor, stroke: COR_SUPERFICIE, strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
