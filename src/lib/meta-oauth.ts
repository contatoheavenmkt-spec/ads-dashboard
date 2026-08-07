/**
 * meta-oauth.ts
 * Configurações e utilitários para o fluxo OAuth da Meta.
 * Separa as credenciais do App de Login (OAuth) do App de Marketing (dados/métricas).
 */

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// ─── Configs dos dois apps ─────────────────────────────────────────────────

// App de marketing usado tanto para OAuth quanto para dados/métricas
// (permissões de ads_read/ads_management só existem nesse tipo de app)
export const metaLoginConfig = {
  appId:       process.env.META_MARKETING_APP_ID   ?? process.env.META_APP_ID       ?? "",
  appSecret:   process.env.META_MARKETING_APP_SECRET ?? process.env.META_APP_SECRET ?? "",
  redirectUri: process.env.META_LOGIN_REDIRECT_URI ?? process.env.META_REDIRECT_URI ?? "",
  scopes: (process.env.META_LOGIN_SCOPES ?? "ads_read,ads_management,business_management,email,public_profile"),
};

export const metaMarketingConfig = {
  appId:     process.env.META_MARKETING_APP_ID     ?? process.env.META_APP_ID     ?? "",
  appSecret: process.env.META_MARKETING_APP_SECRET ?? process.env.META_APP_SECRET ?? "",
};

// ─── State seguro para o OAuth ────────────────────────────────────────────
// state = base64url( userId:nonce:timestamp ) + "." + HMAC-SHA256
// Assim não precisamos de storage — o callback verifica a assinatura.

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutos

/**
 * Segredo do state do OAuth. FALHA FECHADO.
 *
 * Havia aqui `process.env.AUTH_SECRET ?? "fallback-secret"`. Como este
 * repositório é público, o literal estava à vista de qualquer um: bastaria a
 * env faltar num deploy para que o state — que carrega o `userId` — pudesse
 * ser forjado, e o callback do OAuth conectaria a conta de anúncios do
 * atacante ao userId da vítima. Mesmo padrão já removido de `adminSecret()`
 * em admin-auth.ts, pelo mesmo motivo.
 *
 * Sem segredo válido a assinatura não acontece — em vez de acontecer com um
 * segredo que todo mundo conhece.
 */
function oauthStateSecret(): string | null {
  const s = process.env.AUTH_SECRET ?? "";
  return s.length >= 16 ? s : null;
}

export function createOAuthState(userId: string): string {
  const secret = oauthStateSecret();
  if (!secret) {
    throw new Error("AUTH_SECRET não configurado (mínimo 16 caracteres)");
  }
  const nonce = randomBytes(16).toString("hex");
  const ts    = Date.now().toString();
  const payload = `${userId}:${nonce}:${ts}`;
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

    // Verifica assinatura. Sem segredo, nada é aceito (falha fechada).
    const secret = oauthStateSecret();
    if (!secret) return null;
    const expectedSig = createHmac("sha256", secret).update(payload).digest("hex");
    // timingSafeEqual em vez de `!==`: a comparação de string sai no primeiro
    // byte diferente, o que deixa o tempo de resposta revelar quantos bytes da
    // assinatura já estão certos. É a mesma proteção que verifyShareToken e
    // verifyAdminToken já usavam; esta função tinha ficado para trás.
    if (sig.length !== expectedSig.length) return null;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;

    return parts[0]; // userId
  } catch {
    return null;
  }
}
