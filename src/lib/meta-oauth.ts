/**
 * meta-oauth.ts
 * Configurações e utilitários para o fluxo OAuth da Meta.
 * Separa as credenciais do App de Login (OAuth) do App de Marketing (dados/métricas).
 */

import { createHmac, randomBytes } from "crypto";

// ─── Configs dos dois apps ─────────────────────────────────────────────────

export const metaLoginConfig = {
  appId:       process.env.META_LOGIN_APP_ID       ?? process.env.META_APP_ID       ?? "",
  appSecret:   process.env.META_LOGIN_APP_SECRET   ?? process.env.META_APP_SECRET   ?? "",
  redirectUri: process.env.META_LOGIN_REDIRECT_URI ?? process.env.META_REDIRECT_URI ?? "",
  // Escopos necessários: login básico + permissões para listar contas de anúncio
  scopes: (process.env.META_LOGIN_SCOPES ?? "ads_read,ads_management,business_management,email,public_profile"),
};

export const metaMarketingConfig = {
  // App de marketing (921630540830406) — puxa dados e métricas
  appId:     process.env.META_MARKETING_APP_ID     ?? process.env.META_APP_ID     ?? "",
  appSecret: process.env.META_MARKETING_APP_SECRET ?? process.env.META_APP_SECRET ?? "",
};

// ─── State seguro para o OAuth ────────────────────────────────────────────
// state = base64url( userId:nonce:timestamp ) + "." + HMAC-SHA256
// Assim não precisamos de storage — o callback verifica a assinatura.

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutos

export function createOAuthState(userId: string): string {
  const nonce = randomBytes(16).toString("hex");
  const ts    = Date.now().toString();
  const payload = `${userId}:${nonce}:${ts}`;
  const secret  = process.env.AUTH_SECRET ?? "fallback-secret";
  const sig     = createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyOAuthState(state: string): string | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf-8");
    // formato esperado: userId:nonce:timestamp:sig
    const lastColon = decoded.lastIndexOf(":");
    if (lastColon === -1) return null;

    const sig     = decoded.slice(lastColon + 1);
    const payload = decoded.slice(0, lastColon);
    const parts   = payload.split(":");
    if (parts.length < 3) return null;

    // Verifica expiração
    const ts = parseInt(parts[parts.length - 1], 10);
    if (isNaN(ts) || Date.now() - ts > STATE_TTL_MS) return null;

    // Verifica assinatura
    const secret      = process.env.AUTH_SECRET ?? "fallback-secret";
    const expectedSig = createHmac("sha256", secret).update(payload).digest("hex");
    if (sig !== expectedSig) return null;

    return parts[0]; // userId
  } catch {
    return null;
  }
}
