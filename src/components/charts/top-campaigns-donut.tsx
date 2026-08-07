"use client";

import dynamic from "next/dynamic";
import type { TopCampaignsDonutProps } from "./impl/top-campaigns-donut-impl";

/**
 * Fronteira de carregamento da rosca de campanhas.
 *
 * Casca com a API pública idêntica à anterior — os 5 lugares que usam
 * `<TopCampaignsDonut campaigns={…} />` não mudaram. Import pelo barrel
 * `./impl` para compartilhar o chunk do recharts.
 *
 * O `loading` reserva os mesmos 176px (w-44/h-44) do anel, mais o espaço da
 * legenda de duas colunas, para não haver salto de layout.
 */
const Impl = dynamic(() => import("./impl").then((m) => m.TopCampaignsDonutImpl), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center w-full">
      <div className="w-44 h-44 rounded-full animate-pulse bg-slate-800/40" />
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 w-full">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-2 rounded animate-pulse bg-slate-800/40" />
        ))}
      </div>
    </div>
  ),
});

export function TopCampaignsDonut(props: TopCampaignsDonutProps) {
  return <Impl {...props} />;
}
