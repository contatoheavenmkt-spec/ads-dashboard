// ─── Cakto Payment Integration ────────────────────────────────────────────────
// Docs: https://docs.cakto.com.br/introduction
// Auth: OAuth2 client_credentials (token válido por ~10h, sem refresh endpoint)

const CAKTO_API = "https://api.cakto.com.br/public_api";

// ─── Token cache (server-side, in-memory) ─────────────────────────────────────

interface CaktoToken {
  access_token: string;
  expires_at: number; // ms timestamp
}

let _tokenCache: CaktoToken | null = null;

export async function getCaktoToken(): Promise<string> {
  // Retorna token cacheado se ainda válido (com 5 min de margem)
  if (_tokenCache && _tokenCache.expires_at > Date.now() + 5 * 60 * 1000) {
    return _tokenCache.access_token;
  }

  const clientId = process.env.CAKTO_CLIENT_ID;
  const clientSecret = process.env.CAKTO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("CAKTO_CLIENT_ID e CAKTO_CLIENT_SECRET não configurados no .env");
  }

  const res = await fetch(`${CAKTO_API}/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Cakto auth falhou (${res.status}): ${text}`);
  }

  const data = await res.json();
  _tokenCache = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in - 300) * 1000,
  };

  return _tokenCache.access_token;
}

// ─── Checkout URLs (pré-configuradas no dashboard da Cakto por plano) ──────────
// Configure no .env:
//   CAKTO_CHECKOUT_START=https://pay.cakto.com.br/SEU_OFFER_ID_START
//   CAKTO_CHECKOUT_PLUS=https://pay.cakto.com.br/SEU_OFFER_ID_PLUS
//   CAKTO_CHECKOUT_PREMIUM=https://pay.cakto.com.br/SEU_OFFER_ID_PREMIUM

export const CAKTO_CHECKOUT_URLS: Record<string, string> = {
  start:   process.env.CAKTO_CHECKOUT_START   ?? "",
  plus:    process.env.CAKTO_CHECKOUT_PLUS    ?? "",
  premium: process.env.CAKTO_CHECKOUT_PREMIUM ?? "",
};

// IDs das offers para identificar o plano no webhook (opcional, mais confiável que nome)
// Configure no .env:
//   CAKTO_OFFER_ID_START=uuid-da-offer-start
//   CAKTO_OFFER_ID_PLUS=uuid-da-offer-plus
//   CAKTO_OFFER_ID_PREMIUM=uuid-da-offer-premium
export const CAKTO_OFFER_IDS: Record<string, string> = {
  start:   process.env.CAKTO_OFFER_ID_START   ?? "",
  plus:    process.env.CAKTO_OFFER_ID_PLUS    ?? "",
  premium: process.env.CAKTO_OFFER_ID_PREMIUM ?? "",
};

// ─── Build checkout URL com parâmetros do usuário ─────────────────────────────

export function buildCheckoutUrl(
  plan: string,
  userId: string,
  email: string,
  name?: string | null,
): string {
  const base = CAKTO_CHECKOUT_URLS[plan];
  if (!base) {
    throw new Error(`URL de checkout para o plano "${plan}" não configurada (CAKTO_CHECKOUT_${plan.toUpperCase()} está vazio no .env).`);
  }

  const url = new URL(base);

  // utm_content carrega o userId — recuperado no webhook para identificar o comprador
  url.searchParams.set("utm_content", userId);
  url.searchParams.set("utm_source", "dashfy");

  // Pré-preenchimento do checkout (suportado pela maioria das plataformas brasileiras)
  if (email) url.searchParams.set("email", email);
  if (name)  url.searchParams.set("name", name);

  return url.toString();
}

// ─── Resolve plano a partir dos dados do pedido no webhook ────────────────────

import type { PlanKey } from "@/lib/plans";

export function planFromWebhookOrder(order: any): PlanKey | null {
  // 1. Tenta por offer ID (mais confiável)
  const offerId = order.offer?.id ?? order.offer?.short_id ?? "";
  if (offerId) {
    for (const [plan, id] of Object.entries(CAKTO_OFFER_IDS)) {
      if (id && offerId === id) return plan as PlanKey;
    }
  }

  // 2. Fallback: matching por nome do produto/offer (case-insensitive)
  // Obs: a offer Plus está nomeada "Dashfy Pro" na Cakto — ambos mapeiam para "plus"
  const name = `${order.product?.name ?? ""} ${order.offer?.name ?? ""}`.toLowerCase();
  if (name.includes("premium")) return "premium";
  if (name.includes("plus") || name.includes("pro")) return "plus";
  if (name.includes("start"))   return "start";

  return null;
}
