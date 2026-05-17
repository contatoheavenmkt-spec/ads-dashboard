import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

/**
 * Sentinela `-1` significa "Este mês" no PERIOD_OPTIONS. Esta função
 * converte para o número real de dias decorridos no mês corrente (1 no
 * dia 1, 15 no dia 15, etc.). Outros valores passam direto.
 */
export function resolveDays(days: number): number {
  return days === -1 ? new Date().getDate() : days;
}

/**
 * Trunca uma string vinda do user a um tamanho máximo. Retorna null pra
 * inputs vazios/whitespace (útil pra fields opcionais que viram NULL no DB).
 *
 * Por que isso existe: vários endpoints (CRM, workspaces, push subscribe)
 * salvavam strings sem limite — atacante podia POST `{ name: "<10MB>" }`
 * e inflar a tabela. Aplica-se aqui no servidor depois de `JSON.parse`.
 */
export function clampString(input: unknown, maxLen: number): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

/**
 * Parsing seguro de inteiro a partir de query param. Retorna `fallback`
 * para strings não-numéricas / NaN. Evita `parseInt("abc") → NaN` propagar
 * pra cálculo de datas (`setUTCDate(NaN)` lança RangeError 500).
 */
export function safeInt(input: string | null | undefined, fallback: number, min?: number, max?: number): number {
  if (input == null) return fallback;
  const n = parseInt(input, 10);
  if (!Number.isFinite(n)) return fallback;
  if (min !== undefined && n < min) return min;
  if (max !== undefined && n > max) return max;
  return n;
}

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
