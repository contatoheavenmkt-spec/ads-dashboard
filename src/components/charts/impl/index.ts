/**
 * Barrel ÚNICO das implementações de gráfico do painel de agência/cliente.
 *
 * Por que ele existe: cada origem de módulo diferente num `dynamic()` vira uma
 * fronteira de chunk própria, e o bundler copia o recharts INTEIRO para dentro
 * de cada uma. Isso já custou 1,4 MB no painel admin nesta base (4 chunks de
 * 348 KB, um por gráfico) até os `dynamic()` passarem a apontar todos para um
 * barrel só — ver `src/app/admin/_components/graficos-lazy.ts`.
 *
 * Com as quatro implementações saindo DESTE módulo, as fronteiras compartilham
 * o mesmo grupo de chunks: recharts entra uma vez e é reaproveitado entre o
 * dashboard da agência, o painel do cliente e o admin.
 *
 * REGRA: gráfico novo com recharts? Exporte-o AQUI e faça o `dynamic()` apontar
 * para este arquivo. Nunca `dynamic(() => import("./o-grafico"))` direto.
 */
export { SparklineImpl } from "./sparkline-impl";
export { PerformanceChartImpl } from "./performance-chart-impl";
export { TopCampaignsDonutImpl } from "./top-campaigns-donut-impl";
export { RoscaSimplesImpl } from "./rosca-simples-impl";
