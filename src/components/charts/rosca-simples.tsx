"use client";

import dynamic from "next/dynamic";
import type { RoscaSimplesProps } from "./impl/rosca-simples-impl";

/**
 * Fronteira de carregamento da rosca simples.
 *
 * Substitui as 11 chamadas inline de `<Pie>` do chart.js espalhadas por 5
 * arquivos de página. Além de tirar a biblioteca dos arquivos de página, isto
 * remove a duplicação: eram 11 blocos de ~10 linhas com a mesma configuração.
 *
 * Import pelo barrel `./impl` para compartilhar o chunk do recharts.
 */
const Impl = dynamic(() => import("./impl").then((m) => m.RoscaSimplesImpl), {
  ssr: false,
  loading: () => <div className="w-full h-full rounded-full animate-pulse bg-slate-800/40" />,
});

export function RoscaSimples(props: RoscaSimplesProps) {
  return <Impl {...props} />;
}
