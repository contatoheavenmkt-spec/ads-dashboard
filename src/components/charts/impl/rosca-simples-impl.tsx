"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  COR_SUPERFICIE,
  ESTILO_ITEM_TOOLTIP,
  ESTILO_ROTULO_TOOLTIP,
  ESTILO_TOOLTIP,
} from "../paleta";

export interface RoscaSimplesProps {
  rotulos: string[];
  valores: number[];
  cores: readonly string[];
  /** Tamanho do furo central. "70%" (padrão) ou "65%", como no chart.js. */
  furo?: string;
  /** Sufixo do valor no tooltip — "%" nas roscas de share, vazio nas de volume. */
  sufixo?: string;
}

/**
 * Rosca sem legenda própria — as telas que a usam já desenham a legenda por
 * fora, junto com percentuais e valores.
 *
 * Substitui as 11 chamadas inline de `<Pie>` do chart.js, todas com a mesma
 * forma: rótulos + valores + array de cores, furo de 65% ou 70%, legenda
 * desligada. Aqui a chamada fica declarativa e a biblioteca sai dos arquivos de
 * página.
 *
 * As cores continuam vindo de quem chama. Nas roscas demográficas elas são
 * RAMPAS de um mesmo tom (ex.: laranja claro → escuro): a distinção é por
 * luminosidade, que sobrevive a qualquer tipo de daltonismo, então foram
 * portadas como estavam. Onde havia paleta CATEGÓRICA com cores que se
 * confundiam, a correção está em `paleta.ts`.
 *
 * Ganho ao trocar de biblioteca: o tooltip, que o chart.js desligava aqui,
 * passa a existir de graça — dá para ler o valor exato de cada fatia.
 */
export function RoscaSimplesImpl({ rotulos, valores, cores, furo = "70%", sufixo }: RoscaSimplesProps) {
  const fatias = rotulos.map((nome, i) => ({
    nome,
    valor: Number(valores[i] ?? 0),
    cor: cores[i % cores.length],
  }));

  // Recharts desenha um anel cinza vazio quando tudo é zero; melhor não montar.
  if (!fatias.some((f) => f.valor > 0)) return null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={fatias}
          dataKey="valor"
          nameKey="nome"
          innerRadius={furo}
          outerRadius="100%"
          paddingAngle={2}
          stroke={COR_SUPERFICIE}
          strokeWidth={2}
          isAnimationActive={false}
        >
          {fatias.map((f) => (
            <Cell key={f.nome} fill={f.cor} />
          ))}
        </Pie>
        {/* Tooltip nativo: no recharts 3 o tipo `TooltipProps` não expõe
            `payload`, então um `content` customizado não compila. Mesmo padrão
            dos gráficos do admin. */}
        <Tooltip
          contentStyle={ESTILO_TOOLTIP}
          labelStyle={ESTILO_ROTULO_TOOLTIP}
          itemStyle={ESTILO_ITEM_TOOLTIP}
          formatter={(valor) => `${Number(valor ?? 0).toLocaleString("pt-BR")}${sufixo ?? ""}`}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
