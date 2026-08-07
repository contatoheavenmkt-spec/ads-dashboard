"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
// Direto de admin-format (e não de admin-ui): este chunk só precisa dos
// formatadores puros, não do toolkit de UI inteiro.
import { COR_SUPERFICIE, formatarMoeda } from "./admin-format";
import { ESTILO_ITEM_TOOLTIP, ESTILO_ROTULO_TOOLTIP, ESTILO_TOOLTIP } from "./chart-chrome";

/**
 * Desenho da rosca "Receita por plano" do dashboard admin.
 *
 * Extraído de `(protected)/page.tsx` só para ser carregado via `next/dynamic`
 * (recharts fora do chunk inicial). A cor de cada fatia já vem NA SÉRIE
 * (`corDoPlano` de admin-ui, resolvida por quem monta a tela) — este componente
 * não decide paleta nenhuma. O total no miolo da rosca e a legenda continuam na
 * página, por cima/abaixo deste desenho.
 */

interface FatiaPlanoGrafico {
  /** Chave crua do plano — é a `key` de cada <Cell>. */
  plano: string;
  /** Rótulo legível ("Premium") — é o `nameKey` do tooltip. */
  rotulo: string;
  receita: number;
  cor: string;
}

export function GraficoReceitaPorPlano({ serie }: { serie: FatiaPlanoGrafico[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Tooltip
          contentStyle={ESTILO_TOOLTIP}
          labelStyle={ESTILO_ROTULO_TOOLTIP}
          itemStyle={ESTILO_ITEM_TOOLTIP}
          formatter={(valor) => formatarMoeda(Number(valor))}
        />
        <Pie
          data={serie}
          dataKey="receita"
          nameKey="rotulo"
          cx="50%"
          cy="50%"
          innerRadius={58}
          outerRadius={88}
          // O vão entre fatias é o que separa duas cores vizinhas
          // — em especial premium (#059669) e plus (#ec4899), que
          // ficam num ΔE de fronteira. `paddingAngle` abre o
          // espaço e o `stroke` na COR DA SUPERFÍCIE (não uma
          // borda colorida) fecha os 2px exigidos.
          paddingAngle={serie.length > 1 ? 3 : 0}
          stroke={COR_SUPERFICIE}
          strokeWidth={2}
        >
          {serie.map((p) => (
            <Cell key={p.plano} fill={p.cor} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
