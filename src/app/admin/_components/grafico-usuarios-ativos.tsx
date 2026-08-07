"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
// Direto de admin-format (e não de admin-ui): este chunk só precisa dos
// formatadores puros, não do toolkit de UI inteiro.
import { formatarNumero } from "./admin-format";
import {
  COR_GRADE,
  ESTILO_EIXO,
  ESTILO_ITEM_TOOLTIP,
  ESTILO_ROTULO_TOOLTIP,
  ESTILO_TOOLTIP,
} from "./chart-chrome";

/**
 * Desenho das barras "Usuários ativos vs inativos" do dashboard admin.
 *
 * Extraído de `(protected)/page.tsx` só para ser carregado via `next/dynamic`
 * (recharts fora do chunk inicial). As cores já vêm NA SÉRIE (COR_ATIVO /
 * COR_INATIVO, definidas na página ao lado das outras cores de série).
 */

interface BarraUsuariosGrafico {
  rotulo: string;
  quantidade: number;
  cor: string;
}

export function GraficoUsuariosAtivos({ serie }: { serie: BarraUsuariosGrafico[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={serie} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={COR_GRADE} strokeWidth={1} vertical={false} />
        <XAxis dataKey="rotulo" tick={ESTILO_EIXO} axisLine={false} tickLine={false} tickMargin={10} />
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
          cursor={{ fill: "rgba(148,163,184,0.06)" }}
          formatter={(valor) => formatarNumero(Number(valor))}
        />
        {/* Barra fina, topo arredondado em 4px e base quadrada
            ancorada no eixo — a barra cresce do zero, e um
            arredondamento embaixo faria a origem parecer flutuar. */}
        <Bar dataKey="quantidade" name="Usuários" radius={[4, 4, 0, 0]} maxBarSize={32}>
          {serie.map((u) => (
            <Cell key={u.rotulo} fill={u.cor} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
