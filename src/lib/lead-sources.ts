/**
 * Origens (tags) de leads por workspace. Salvas em Workspace.leadSources
 * como JSON array. null = workspace usa os defaults abaixo.
 */

export const DEFAULT_LEAD_SOURCES = ["Meta", "Google Ads", "Indicação"];

export function parseLeadSources(raw: string | null | undefined): string[] {
  if (!raw) return DEFAULT_LEAD_SOURCES;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return DEFAULT_LEAD_SOURCES;
    const sanitized = arr
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 50);
    return sanitized.length > 0 ? sanitized : DEFAULT_LEAD_SOURCES;
  } catch {
    return DEFAULT_LEAD_SOURCES;
  }
}

/**
 * Serializa pro DB. Retorna null quando a lista coincide com o default —
 * mantém workspaces "sem customização" com leadSources NULL no DB, evita
 * inflar registros que nunca foram editados.
 */
export function serializeLeadSources(sources: string[] | null): string | null {
  if (!sources || sources.length === 0) return null;
  const cleaned = sources
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 50);
  if (cleaned.length === 0) return null;
  // Default sem customização → null (não polui DB)
  if (
    cleaned.length === DEFAULT_LEAD_SOURCES.length &&
    cleaned.every((s, i) => s === DEFAULT_LEAD_SOURCES[i])
  ) {
    return null;
  }
  return JSON.stringify(cleaned);
}
