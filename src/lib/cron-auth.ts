import { NextRequest } from "next/server";

/**
 * Autentica request vinda do crontab da VPS. Exige header
 * `X-CRON-SECRET: <CRON_SECRET do env>`. Sem o env, retorna false e os
 * endpoints recusam tudo (mais seguro que abrir em dev).
 */
export function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("x-cron-secret");
  if (!header) return false;
  // Comparação direta — ambos os valores vêm do servidor (env vs header
  // controlado pelo crontab local), sem janela de timing pra ataque externo.
  return header === secret;
}

/**
 * YYYY-MM-DD no fuso BR — usado pra montar dedupeKeys diárias consistentes
 * com o que o cliente vê no Ads Manager.
 */
export function brToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
