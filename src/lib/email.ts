/**
 * email.ts
 * Helper para normalizar emails de forma consistente em todo o sistema.
 * Sem essa normalização, "User@Example.com" e "user@example.com" criam usuários
 * distintos e o lookup de PendingSubscription falha após pagamento.
 */

export function normalizeEmail(email: string | null | undefined): string {
  if (!email) return "";
  return email.trim().toLowerCase();
}

/** Retorna a data atual em formato YYYY-MM-DD no fuso de São Paulo. */
export function brDateKey(date: Date = new Date()): string {
  // sv-SE produz "YYYY-MM-DD HH:mm:ss" no fuso pedido; pegamos só a data.
  return date.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}
