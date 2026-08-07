/**
 * paleta.ts — cores dos gráficos do painel de agência e do painel do cliente.
 *
 * NÃO é módulo de componente: sem "use client", pode ser lido de qualquer lado.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Estes valores foram VALIDADOS por script, não escolhidos no olho. A paleta
 * anterior reprovava em 4 das 6 checagens contra a superfície #0f172a:
 *
 *   antes: #22d3ee #3b82f6 #6366f1 #a855f7 #d946ef #ec4899 #f43f5e #475569
 *     · CVD:           #a855f7 ↔ #6366f1  ΔE 0,9 (protanopia) — a MESMA cor
 *     · visão normal:  #6366f1 ↔ #3b82f6  ΔE 7,2 — abaixo do piso 15, ou seja
 *       fatias vizinhas indistinguíveis mesmo para quem enxerga todas as cores
 *     · faixa de luminosidade e piso de croma também reprovados (#475569 lia
 *       como cinza)
 *
 * Isto não era detalhe estético: a rosca de campanhas aparece no painel que os
 * clientes dos nossos clientes abrem, e duas fatias vizinhas com a mesma cor
 * fazem o gráfico mentir sobre qual campanha converteu mais.
 *
 * A paleta abaixo passa nas 6 checagens contra #0f172a (pior par adjacente:
 * CVD ΔE 8,4 · visão normal ΔE 19,3 · contraste ≥ 3:1 em todas).
 *
 * REGRA: nunca troque um valor isolado. A validação é do CONJUNTO, em pares
 * adjacentes — mexer numa cor pode reprovar o vizinho. Rode de novo:
 *   node <skill dataviz>/scripts/validate_palette.js "<hex,hex,…>" \
 *        --mode dark --surface "#0f172a"
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Superfície escura sobre a qual tudo isto foi validado. */
export const COR_SUPERFICIE = "#0f172a";

/**
 * Ordem categórica fixa. Atribua sempre nesta ordem, nunca cicle.
 * Um 9º item não ganha cor nova: vira "Outras" (é o que a rosca já faz).
 */
export const PALETA_CATEGORICA = [
  "#3987e5", // 1 azul
  "#d95926", // 2 laranja
  "#199e70", // 3 aqua
  "#c98500", // 4 amarelo
  "#d55181", // 5 magenta
  "#008300", // 6 verde
  "#9085e9", // 7 violeta
  "#e66767", // 8 vermelho
] as const;

/** Cinza da fatia "Outras" — fora da ordem categórica, é ausência de identidade. */
export const COR_OUTRAS = "#64748b";

/**
 * Cor por MÉTRICA (identidade semântica estável entre telas: investimento é
 * sempre o mesmo azul, no dashboard e no painel do cliente).
 *
 * `clicks` era #60a5fa — um azul claro que dava ΔE 10,2 contra o azul de
 * `spend` para visão normal, e os dois são renderizados JUNTOS em
 * `metrics={["clicks","spend"]}`. Virou laranja: ΔE 31,8.
 *
 * Pares realmente usados no código, todos validados e aprovados:
 *   ["spend","revenue"]     azul × aqua      ΔE 20,9
 *   ["clicks","spend"]      laranja × azul   ΔE 31,8
 *   ["conversions","spend"] amarelo × azul   ΔE 30,7
 * (`clicks` e `conversions` nunca aparecem no mesmo gráfico — conferido.)
 */
export const COR_METRICA = {
  spend: "#3987e5",       // azul     — Investimento
  clicks: "#d95926",      // laranja  — Cliques
  conversions: "#c98500", // amarelo  — Conversões
  impressions: "#9085e9", // violeta  — Impressões
  revenue: "#199e70",     // aqua     — Faturamento
} as const;

/** Share por plataforma. Validado: pior par adjacente ΔE 9,4 CVD / 20,9 normal. */
export const COR_PLATAFORMA = {
  meta: "#3987e5",
  google: "#199e70",
  outros: "#d95926",
} as const;

/** Chrome dos gráficos — recessivo de propósito: grade e eixos não competem com o dado. */
export const COR_GRADE = "rgba(71, 85, 105, 0.18)";
export const COR_EIXO = "#64748b";

/** Tooltip: mesma caixa que o chart.js desenhava, para a troca não se notar. */
export const ESTILO_TOOLTIP = {
  backgroundColor: "rgba(15, 23, 42, 0.95)",
  border: "1px solid rgba(71, 85, 105, 0.5)",
  borderRadius: "8px",
  padding: "8px 12px",
} as const;

export const ESTILO_ROTULO_TOOLTIP = {
  color: "#f8fafc",
  fontSize: "11px",
  fontWeight: 600,
  marginBottom: "4px",
} as const;

export const ESTILO_ITEM_TOOLTIP = {
  color: "#cbd5e1",
  fontSize: "11px",
} as const;
