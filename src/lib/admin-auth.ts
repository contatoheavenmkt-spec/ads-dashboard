/**
 * admin-auth.ts
 * Autenticação separada para a área administrativa /admin.
 * Usa HMAC-SHA256 (mesmo padrão do meta-oauth.ts) — sem dependências externas.
 * As funções de verificação de token são puras (só crypto) para compatibilidade
 * com Edge Runtime (middleware). logAdminAction usa Prisma e só pode ser
 * chamado em route handlers (Node.js runtime).
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest, NextResponse } from "next/server";

// ─── Constantes ───────────────────────────────────────────────────────────────

export const ADMIN_COOKIE = "admin_session";
const TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

/**
 * Segredo de assinatura do token admin. Falha FECHADO de propósito.
 *
 * Antes havia um fallback para o literal "fallback-admin-secret". Como este
 * repositório é público, qualquer pessoa conhecia esse valor — bastava a env
 * faltar em algum deploy para que tokens de admin pudessem ser forjados de
 * fora. Sem segredo configurado, agora ninguém entra (nem quem sabe a senha).
 */
function adminSecret(): string | null {
  const s = process.env.ADMIN_SECRET ?? process.env.AUTH_SECRET ?? "";
  return s.length >= 16 ? s : null;
}

// ─── Token: sign / verify ─────────────────────────────────────────────────────

/**
 * Cria token admin: base64url("admin:<ts>") + "." + HMAC-SHA256
 * Prefixo "admin:" evita que tokens OAuth sejam aceitos aqui.
 */
export function signAdminToken(): string {
  const secret = adminSecret();
  if (!secret) {
    throw new Error("ADMIN_SECRET não configurado (mínimo 16 caracteres)");
  }
  const payload = `admin:${Date.now()}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  const encoded = Buffer.from(payload).toString("base64url");
  return `${encoded}.${sig}`;
}

/**
 * Verifica assinatura e TTL do token.
 * Retorna true somente se ambos estiverem válidos.
 * Nunca lança exceção.
 */
export function verifyAdminToken(token: string): boolean {
  try {
    const secret = adminSecret();
    if (!secret) return false;

    const dotIdx = token.lastIndexOf(".");
    if (dotIdx === -1) return false;

    const encoded = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);
    const payload = Buffer.from(encoded, "base64url").toString("utf-8");

    if (!payload.startsWith("admin:")) return false;

    const expectedSig = createHmac("sha256", secret).update(payload).digest("hex");
    if (sig.length !== expectedSig.length) return false;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return false;

    const ts = parseInt(payload.slice("admin:".length), 10);
    if (isNaN(ts) || Date.now() - ts > TTL_MS) return false;

    return true;
  } catch {
    return false;
  }
}

// ─── Cookie helpers ───────────────────────────────────────────────────────────

const IS_DEV = process.env.NODE_ENV !== "production";

export function setAdminCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: !IS_DEV,
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60, // 8 horas em segundos
  });
  return res;
}

export function clearAdminCookie(res: NextResponse): NextResponse {
  res.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    secure: !IS_DEV,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

// ─── Request validator (Node.js route handlers) ───────────────────────────────

export function validateAdminRequest(req: NextRequest): boolean {
  const token = req.cookies.get(ADMIN_COOKIE)?.value ?? null;
  return token ? verifyAdminToken(token) : false;
}

// ─── Admin log (Prisma — Node.js only, não importar no middleware) ────────────

export async function logAdminAction(
  action: string,
  targetId?: string,
  details?: object,
  ip?: string
): Promise<void> {
  try {
    const { db } = await import("@/lib/db");
    await db.adminLog.create({
      data: {
        action,
        targetId: targetId ?? null,
        details: details ? JSON.stringify(details) : null,
        adminIp: ip ?? null,
      },
    });
  } catch {
    // Nunca deixar o log quebrar a requisição principal
  }
}

/**
 * Igual a logAdminAction, mas SEM o try/catch que engole o erro.
 *
 * A impersonação usa esta versão na entrada: se não dá para registrar quem
 * entrou na conta de quem, a operação não pode acontecer. Entrar sem rastro
 * é pior do que não entrar.
 */
export async function logAdminActionStrict(
  action: string,
  targetId?: string,
  details?: object,
  ip?: string
): Promise<void> {
  const { db } = await import("@/lib/db");
  await db.adminLog.create({
    data: {
      action,
      targetId: targetId ?? null,
      details: details ? JSON.stringify(details) : null,
      adminIp: ip ?? null,
    },
  });
}
