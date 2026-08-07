/**
 * impersonation.ts
 * Tickets HMAC de curtíssima duração para a impersonação do painel admin.
 * Mesmo espírito de admin-auth.ts: só `crypto` do Node, sem dependências
 * externas, falha FECHADO quando não há segredo configurado.
 *
 * Este módulo NÃO importa Prisma nem "@/auth" no topo de propósito — ele é
 * puxado por rotas de API e por handlers de escrita espalhados pelo app.
 *
 * ─── Rotas de mutação que NÃO recebem a guarda `bloqueioDeEscrita` ───────────
 * Elas ficam de fora por motivo específico, não por esquecimento:
 *  • src/app/api/meta/token/route.ts — já responde 410 fixo, não faz nada.
 *  • src/app/api/cakto/webhook/route.ts e src/app/api/cron/* — não têm sessão;
 *    autenticam por segredo próprio (assinatura do provedor / CRON_SECRET).
 *  • src/app/api/auth/register/route.ts e src/app/api/unlock/route.ts — são
 *    públicas e não usam sessão.
 *  • src/app/api/meta/oauth/callback e src/app/api/auth/google/callback — não
 *    chamam auth(); só são alcançáveis com um `state` assinado emitido pelas
 *    rotas /start, e essas estão bloqueadas.
 *  • src/app/api/track/* — a supressão é no cliente (components/tracking/
 *    tracker.tsx). São as rotas mais quentes do app e acrescentar `await auth()`
 *    nelas custaria caro; o `userId` do body já era forjável antes desta
 *    feature, então isso não é dívida nova.
 */

import { createHmac, timingSafeEqual, randomUUID } from "crypto";
import { NextResponse } from "next/server";

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Id do provider Credentials dedicado à impersonação (src/auth.ts). */
export const IMP_PROVIDER_ID = "admin-impersonate";

/** O ticket nasce e morre dentro da mesma request — 60s é folga, não prazo. */
export const IMP_TICKET_TTL_MS = 60_000;

/** Duração máxima de uma sessão impersonada. */
export const IMP_SESSION_TTL_MS = 30 * 60 * 1000;

interface TicketPayload {
  typ: "imp1";
  sub: string;
  by: string | null;
  exp: number;
  iat: number;
  jti: string;
}

/**
 * Chave do ticket, DERIVADA por domínio a partir do segredo do admin.
 *
 * A derivação existe para que um `admin_session` roubado não sirva de ticket de
 * impersonação e vice-versa: são chaves diferentes para o mesmo segredo raiz.
 * É o mesmo espírito do prefixo literal "admin:" documentado em admin-auth.ts.
 *
 * Falha FECHADO, igual a adminSecret(): sem segredo, a feature simplesmente
 * não funciona — nunca cai em modo permissivo.
 */
function impersonationSecret(): string | null {
  const raw = process.env.ADMIN_SECRET ?? process.env.AUTH_SECRET ?? "";
  if (raw.length < 16) return null;
  return createHmac("sha256", raw).update("dashfy:impersonation:v1").digest("hex");
}

// ─── Uso único (in-memory) ────────────────────────────────────────────────────

/**
 * Mesmo padrão in-memory do rate-limit.ts.
 *
 * O uso único aqui é cinto-e-suspensório: o ticket NUNCA trafega pela rede —
 * nasce dentro da rota /api/admin/impersonate e é consumido pelo `signIn` na
 * mesma request. Há uma única instância PM2, um reinício limpa o Map e o TTL é
 * de 60 segundos.
 */
const jtisUsados = new Map<string, number>();

function consumirJti(jti: string): boolean {
  if (jtisUsados.has(jti)) return false;

  // GC inline: sem processo separado, varre só quando o Map cresce.
  if (jtisUsados.size > 500) {
    const agora = Date.now();
    for (const [k, venceEm] of jtisUsados.entries()) {
      if (venceEm < agora) jtisUsados.delete(k);
    }
  }

  jtisUsados.set(jti, Date.now() + IMP_TICKET_TTL_MS);
  return true;
}

// ─── Ticket: sign / verify ────────────────────────────────────────────────────

/**
 * Assina um ticket de impersonação.
 * `sub` = id do usuário ALVO. `by` = marca do operador ("admin:<id>" ou "admin"),
 * ou null quando é um ticket de RESTAURAÇÃO (devolve a sessão limpa do operador).
 * `exp` = quando a sessão impersonada expira (epoch ms).
 */
export function signImpersonationTicket(sub: string, by: string | null, exp: number): string {
  const key = impersonationSecret();
  if (!key) {
    throw new Error("ADMIN_SECRET não configurado (mínimo 16 caracteres)");
  }

  const payload: TicketPayload = {
    typ: "imp1",
    sub,
    by,
    exp,
    iat: Date.now(),
    jti: randomUUID(),
  };

  // Assina o ENCODED, não o JSON cru: a verificação compara exatamente a mesma
  // string que trafega, sem depender da ordem de chaves de um re-serialize.
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", key).update(encoded).digest("hex");
  return `${encoded}.${sig}`;
}

/**
 * Verifica assinatura, formato, TTL e uso único do ticket.
 * Nunca lança — devolve null em qualquer falha.
 */
export function verifyImpersonationTicket(ticket: string): TicketPayload | null {
  try {
    const key = impersonationSecret();
    if (!key) return null;

    const dotIdx = ticket.lastIndexOf(".");
    if (dotIdx === -1) return null;

    const encoded = ticket.slice(0, dotIdx);
    const sig = ticket.slice(dotIdx + 1);

    const expectedSig = createHmac("sha256", key).update(encoded).digest("hex");
    if (sig.length !== expectedSig.length) return null;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;

    const p = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8")) as TicketPayload;

    if (p.typ !== "imp1") return null;
    if (typeof p.sub !== "string" || p.sub.length === 0) return null;
    if (typeof p.jti !== "string" || p.jti.length === 0) return null;
    if (typeof p.iat !== "number") return null;

    const agora = Date.now();
    if (agora - p.iat > IMP_TICKET_TTL_MS) return null;
    if (p.iat > agora + 5000) return null; // tolerância de clock

    if (!consumirJti(p.jti)) return null; // replay

    return p;
  } catch {
    return null;
  }
}

// ─── Guarda de escrita (read-only) ────────────────────────────────────────────

/**
 * Guarda de UMA linha para handlers de mutação: se a sessão está impersonada,
 * devolve 403 e o handler retorna sem tocar em nada.
 *
 * A sessão impersonada é SOMENTE LEITURA de verdade — o banner e o modal do
 * admin afirmam isso ao operador, e essa afirmação só é honesta enquanto as
 * guardas existirem em todas as rotas de mutação.
 */
export function bloqueioDeEscrita(
  session: { user?: { impersonatedBy?: string } } | null
): NextResponse | null {
  if (!session?.user?.impersonatedBy) return null;
  return NextResponse.json(
    { error: "Ação bloqueada: sessão de impersonação é somente leitura" },
    { status: 403 }
  );
}

/**
 * Mesma guarda, para rotas onde a sessão não está numa variável local (ex.: o
 * helper `requireOwnership` de /api/workspaces/[id], que também serve o GET e
 * por isso não pode receber a guarda dentro dele).
 * O import de "@/auth" é dinâmico para este módulo continuar leve.
 */
export async function bloqueioDeEscritaAsync(): Promise<NextResponse | null> {
  const { auth } = await import("@/auth");
  return bloqueioDeEscrita(await auth());
}
