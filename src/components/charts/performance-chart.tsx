"use client";

import dynamic from "next/dynamic";
import type { PerformanceChartProps } from "./impl/performance-chart-impl";

/**
 * Fronteira de carregamento do gráfico de performance.
 *
 * Este arquivo é só a casca: a API pública (nome, props) é EXATAMENTE a de
 * antes, então os 10 lugares que já usavam `<PerformanceChart …/>` não mudaram
 * uma linha. O que mudou é que o desenho — e o recharts junto — só é baixado
 * quando o componente entra em tela.
 *
 * O import vem do barrel `./impl` (nunca do arquivo do gráfico direto) para
 * cair no MESMO chunk das outras implementações; ver o comentário lá.
 *
 * `ssr: false` porque o recharts mede o container no browser. O `loading` tem a
 * mesma altura mínima do desenho real (`min-h-[180px]`) para a troca não
 * empurrar o layout.
 */
const Impl = dynamic(() => import("./impl").then((m) => m.PerformanceChartImpl), {
  ssr: false,
  loading: () => <div className="w-full h-full min-h-[180px] animate-pulse rounded-xl bg-slate-800/40" />,
});

export function PerformanceChart(props: PerformanceChartProps) {
  return <Impl {...props} />;
}
