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

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
