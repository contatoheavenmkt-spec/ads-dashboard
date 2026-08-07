"use client";

import dynamic from "next/dynamic";

/**
 * Fronteira de carregamento do sparkline.
 *
 * API pública idêntica à anterior — `kpi-card.tsx` não mudou. Import pelo
 * barrel `./impl` para compartilhar o chunk do recharts.
 *
 * Este é o mais importante dos três: há vários KpiCards por tela, e com o
 * chart.js estático cada um deles obrigava a biblioteca inteira a entrar no
 * chunk inicial da página — inclusive no painel público do cliente.
 */
const Impl = dynamic(() => import("./impl").then((m) => m.SparklineImpl), {
  ssr: false,
  loading: () => <div className="w-full h-full" />,
});

export function Sparkline({ data, color }: { data: number[]; color: string }) {
  return <Impl data={data} color={color} />;
}
