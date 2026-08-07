/**
 * admin-format.ts — formatadores puros e paleta do painel admin.
 *
 * SEM a diretiva "use client", e isso é o ponto do arquivo.
 *
 * Estas funções e constantes moravam em `admin-ui.tsx`, que é "use client".
 * Num Server Component dá para RENDERIZAR componentes de um módulo cliente,
 * mas CHAMAR uma função dele quebra em runtime: o bundler troca cada export
 * por uma client reference e o React aborta com "Attempted to call
 * formatarMoeda() from the server"; ler `PALETA_PLANO` dá o erro irmão
 * ("you cannot dot into a client module from a server component").
 *
 * A tela /admin/finance é Server Component e precisava dos dois. A saída
 * anterior foi espelhar os quatro hex da paleta dentro dela — exatamente o
 * padrão que manteve o roxo reprovado (#a855f7) vivo na rosca de planos
 * depois da troca de paleta, porque o validador de acessibilidade só enxerga
 * a definição canônica. Com este módulo neutro os dois lados importam da
 * MESMA fonte, e `admin-ui.tsx` reexporta tudo para os imports existentes das
 * telas cliente continuarem funcionando.
 *
 * Regra: nada aqui faz fetch, toca em banco ou depende de React.
 */

/** Placeholder único para "não temos esse dado". Centralizado pra nunca
 *  escapar um "undefined"/"NaN"/"Invalid Date" na tela. */
export const TRACO = "—";

// ─── Formatadores ─────────────────────────────────────────────────────────────

/**
 * Number.isFinite() em vez de !isNaN(): pega NaN, Infinity e -Infinity de uma vez.
 * Divisões como `receita / assinantes` com denominador 0 viram Infinity, e
 * `Infinity.toLocaleString(...)` renderiza "R$ ∞" — pior que um traço.
 */
export function numeroValido(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** R$ 1.234,56 — inválido/ausente vira "—", nunca "R$ NaN". */
export function formatarMoeda(v: number | null | undefined): string {
  if (!numeroValido(v)) return TRACO;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** 1.234 — separador de milhar pt-BR. Até 2 casas decimais quando houver. */
export function formatarNumero(v: number | null | undefined): string {
  if (!numeroValido(v)) return TRACO;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/**
 * 75 → "75,0%". A entrada já é a porcentagem (a API manda `taxaConversao: 75`,
 * não 0.75) — este helper NÃO multiplica por 100.
 */
export function formatarPercentual(v: number | null | undefined): string {
  if (!numeroValido(v)) return TRACO;
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/**
 * Converte a string ISO em Date, ou null se não der pra confiar.
 *
 * O typeof é essencial: `new Date(null)` NÃO é Invalid Date em JS — vira
 * 01/01/1970. Sem esse guarda, um `currentPeriodEnd: null` da API apareceria
 * como uma data real de 1970 na tabela.
 */
function paraData(iso: string | null | undefined): Date | null {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** dd/mm/aaaa — inválida/ausente vira "—". */
export function formatarData(iso: string | null | undefined): string {
  const d = paraData(iso);
  return d ? d.toLocaleDateString("pt-BR") : TRACO;
}

/** dd/mm/aaaa HH:mm — inválida/ausente vira "—". */
export function formatarDataHora(iso: string | null | undefined): string {
  const d = paraData(iso);
  if (!d) return TRACO;
  // Montado em duas partes de propósito: toLocaleString("pt-BR") com data+hora
  // insere uma vírgula ("28/07/2026, 01:24") que não queremos nas tabelas.
  const data = d.toLocaleDateString("pt-BR");
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${data} ${hora}`;
}

/**
 * Segundos decorridos → "agora" / "há 12s" / "há 3min" / "há 2h" / "há 3d".
 * Usado no realtime, onde `segundosAtras` chega da API.
 *
 * Valor negativo (relógio do cliente adiantado em relação ao servidor) é
 * tratado como 0 — "há -4s" seria visivelmente quebrado.
 */
export function tempoRelativo(segundos: number): string {
  if (!numeroValido(segundos)) return TRACO;
  const s = Math.max(0, Math.floor(segundos));
  if (s < 5) return "agora";
  if (s < 60) return `há ${s}s`;
  if (s < 3600) return `há ${Math.floor(s / 60)}min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)}h`;
  return `há ${Math.floor(s / 86400)}d`;
}

// ─── Paleta ───────────────────────────────────────────────────────────────────

/**
 * Cor da superfície do painel (slate-950/900 do fundo real das telas).
 *
 * Não é decoração: é o valor que as telas devem usar como `stroke` dos gaps de
 * 2px entre fatias de pizza e segmentos de barra empilhada. É esse vão na cor
 * do fundo — e não uma borda colorida — que separa duas cores vizinhas.
 */
export const COR_SUPERFICIE = "#0F172A";

/** Fallback para plano desconhecido: cinza neutro, nunca uma cor de série. */
export const COR_PLANO_PADRAO = "#475569";

/**
 * Paleta categórica dos planos — FONTE ÚNICA para badges, pizza, barras e
 * legendas de todas as telas, cliente e servidor. Validada contra a superfície
 * escura real: banda de luminosidade, croma, separação em
 * deuteranopia/protanopia e contraste. NÃO troque um valor isolado "porque
 * combina melhor": qualquer mudança precisa passar de novo pela validação
 * inteira, e é este arquivo que o validador enxerga.
 *
 * A cor identifica a ENTIDADE (o plano), nunca a posição no ranking — um
 * filtro que muda a quantidade de séries não pode repintar as sobreviventes.
 *
 * Restrição que vem junto da paleta: `premium` (#059669) e `plus` (#ec4899)
 * ficam num ΔE de fronteira quando comparados fora dos pares adjacentes. Isso
 * só é legítimo COM codificação secundária — toda fatia/série precisa de
 * rótulo direto ou legenda com nome. Nunca identifique plano por cor sozinha.
 */
export const PALETA_PLANO: Record<string, string> = {
  trial: "#d97706",
  plus: "#ec4899",
  start: "#3b82f6",
  premium: "#059669",
};

/** Cor do plano com fallback cinza. Aceita "Premium", " premium " etc. */
export function corDoPlano(plano: string): string {
  if (typeof plano !== "string") return COR_PLANO_PADRAO;
  return PALETA_PLANO[plano.trim().toLowerCase()] ?? COR_PLANO_PADRAO;
}

/**
 * Cores de estado. São RESERVADAS: nunca entram numa paleta categórica como
 * "série 4", e nunca aparecem sozinhas — sempre acompanhadas de ícone e texto.
 */
export const COR_STATUS = {
  bom: "#10b981",
  atencao: "#f59e0b",
  grave: "#f43f5e",
} as const;
