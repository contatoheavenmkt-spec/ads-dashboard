import { isValidIsoDate } from "@/lib/meta-api";

/**
 * Janela máxima aceita nas rotas de métricas.
 *
 * 1095 dias = 3 anos, dentro do teto de 37 meses que a Meta impõe ao
 * /insights (pedir mais que isso a API recusa). Era 366, o que impedia o
 * gestor de olhar o histórico inteiro da conta.
 */
export const MAX_DIAS_JANELA = 1095;

/**
 * Resolve range customizado a partir de query params `since`/`until`.
 * Quando ambos estão presentes e válidos (YYYY-MM-DD), devolve o objeto.
 * Quando inválidos, devolve null E uma mensagem de erro (pra rota devolver 400).
 * Quando ausentes (nenhum dos dois), devolve null sem erro — quem chama
 * deve cair no fallback `days`/`offset`.
 */
export function parseCustomRange(
  sinceParam: string | null,
  untilParam: string | null,
): { range: { since: string; until: string } | null; error?: string } {
  if (!sinceParam && !untilParam) return { range: null };
  if (!sinceParam || !untilParam) {
    return { range: null, error: "since e until precisam vir juntos" };
  }
  if (!isValidIsoDate(sinceParam) || !isValidIsoDate(untilParam)) {
    return { range: null, error: "Datas devem estar no formato YYYY-MM-DD" };
  }
  if (sinceParam > untilParam) {
    return { range: null, error: "since precisa ser menor ou igual a until" };
  }
  // Teto de 3 anos: é o que a Meta aceita no /insights (37 meses) e evita
  // query gigante. Antes eram 366 dias, que barrava ver o histórico.
  const diff =
    (Date.parse(`${untilParam}T00:00:00Z`) - Date.parse(`${sinceParam}T00:00:00Z`)) /
    (1000 * 60 * 60 * 24);
  if (diff > MAX_DIAS_JANELA) {
    return { range: null, error: "Intervalo máximo é 3 anos" };
  }
  return { range: { since: sinceParam, until: untilParam } };
}

/** Calcula `days` equivalente ao intervalo (inclui ambos os extremos). */
export function daysFromRange(since: string, until: string): number {
  const diff =
    (Date.parse(`${until}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) /
    (1000 * 60 * 60 * 24);
  return Math.max(1, Math.round(diff) + 1);
}
