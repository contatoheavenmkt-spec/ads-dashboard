/**
 * Barrel ÚNICO para os componentes de gráfico carregados via `next/dynamic`.
 *
 * Por que ele existe: cada origem de módulo diferente num `dynamic()` vira uma
 * fronteira de chunk própria — e o bundler copia o recharts INTEIRO para dentro
 * de cada uma. Medido em produção (28/07): 4 chunks de 348 KB, um por gráfico,
 * ~1,4 MB de recharts repetido para desenhar o dashboard.
 *
 * Com todos os `dynamic()` importando DESTE módulo, as cinco fronteiras
 * apontam para o mesmo grupo de chunks: o recharts entra uma vez e o chunk é
 * compartilhado (e cacheado) entre o dashboard e o analytics.
 *
 * Regra prática: gráfico novo com recharts? Exporte-o AQUI e faça o
 * `dynamic(() => import(".../graficos-lazy").then(m => m.SeuGrafico))`.
 * Nunca importe o arquivo do gráfico diretamente num `dynamic()`.
 */
export { GraficoReceitaMensal } from "./grafico-receita-mensal";
export { GraficoChurnMensal } from "./grafico-churn-mensal";
export { GraficoReceitaPorPlano } from "./grafico-receita-por-plano";
export { GraficoUsuariosAtivos } from "./grafico-usuarios-ativos";
export { GraficoVisualizacoesDia } from "./grafico-visualizacoes-dia";
