/**
 * Cliente único da Google Ads API.
 *
 * Antes isso vivia duplicado (e divergente) em api/google/metrics/route.ts e
 * api/google/accounts/route.ts. A divergência importava: `metrics` aceitava
 * conexão com `scopes` vazio (dado legado de contas antigas) e `accounts`
 * rejeitava. Aqui vale a versão tolerante, senão quem conectou antes da
 * gravação de escopo para de listar contas.
 */

import { db } from "@/lib/db";

export const GADS_API = "https://googleads.googleapis.com/v22";
export const REQUIRED_SCOPE = "https://www.googleapis.com/auth/adwords";

export type GoogleToken = { accessToken: string; scopes: string[] };
export type GaqlRow = Record<string, unknown>;

/* ─────────────────────────── token ─────────────────────────── */

/**
 * Devolve um access token válido do usuário, renovando pelo refresh token
 * quando expirado. `null` significa "não dá para chamar a API": sem conexão,
 * sem escopo adwords ou refresh recusado.
 */
export async function getValidGoogleToken(userId: string): Promise<GoogleToken | null> {
  const conn = await db.googleConnection.findFirst({
    where: { userId },
    orderBy: { connectedAt: "desc" },
  });
  if (!conn) return null;

  const connScopes = (conn.scopes ?? "").split(" ").filter(Boolean);
  // Escopo vazio = conexão legada, criada antes de persistirmos os escopos.
  // Deixa passar e deixa a própria API recusar, se for o caso.
  if (connScopes.length > 0 && !connScopes.includes(REQUIRED_SCOPE)) return null;

  const expiresAt = conn.expiresAt instanceof Date ? conn.expiresAt : null;
  const isExpired = !expiresAt || isNaN(expiresAt.getTime()) || expiresAt <= new Date();

  if (!isExpired) return { accessToken: conn.accessToken, scopes: connScopes };

  if (!conn.refreshToken) {
    console.error("[google-ads] conexão sem refresh token, precisa reconectar");
    return null;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: conn.refreshToken,
    }),
  });
  const data = await res.json();
  if (data.error) {
    console.error("[google-ads] falha ao renovar token:", data.error, data.error_description);
    return null;
  }

  await db.googleConnection.update({
    where: { id: conn.id },
    data: {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      // O Google ocasionalmente rotaciona o refresh token: quando vier, persiste.
      ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
    },
  });

  return { accessToken: data.access_token, scopes: connScopes };
}

/* ─────────────────────────── headers e GAQL ─────────────────────────── */

export function gaqlHeaders(token: string, loginCustomerId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": process.env.GOOGLE_DEVELOPER_TOKEN!,
    "Content-Type": "application/json",
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;
  return headers;
}

/**
 * `login-customer-id` da conta. Hoje sai do env (um MCC só para o app inteiro),
 * o que funciona enquanto todos os clientes estão sob o mesmo MCC. O fallback
 * final é o próprio customerId, para conta acessada direto.
 */
export function resolveLoginCustomerId(customerId: string): string {
  const fromEnv = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "").replace(/-/g, "");
  return fromEnv || customerId;
}

export function camelToSnake(s: string): string {
  return s.replace(/([A-Z])/g, (c) => `_${c.toLowerCase()}`);
}

/**
 * A API devolve o objeto aninhado em camelCase (`metrics.costMicros`), mas as
 * queries são escritas em snake_case. Achata para o formato da query, que é o
 * que o resto do código espera ler.
 */
export function flattenFields(obj: unknown, prefix = ""): Record<string, unknown> {
  let result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const snakeKey = camelToSnake(key);
    const fullKey = prefix ? `${prefix}.${snakeKey}` : snakeKey;
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      result = { ...result, ...flattenFields(value, fullKey) };
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

/**
 * Executa uma query GAQL. Se o MCC negar permissão, refaz a chamada usando o
 * próprio customerId: é o caso da conta acessada direto, sem manager.
 */
export async function gaqlSearch(opts: {
  customerId: string;
  token: string;
  loginCustomerId: string;
  query: string;
  tag?: string;
}): Promise<GaqlRow[]> {
  const { customerId, token, loginCustomerId, query, tag = "google-ads" } = opts;
  const body = JSON.stringify({ query });

  const attempt = async (lci: string) => {
    console.log(`[${tag}] GAQL → customerId=${customerId} login-customer-id=${lci}`);
    const res = await fetch(`${GADS_API}/customers/${customerId}/googleAds:search`, {
      method: "POST",
      headers: {
        ...gaqlHeaders(token, lci),
        "Content-Length": String(Buffer.byteLength(body)),
      },
      body,
    });
    return res.json();
  };

  let data = await attempt(loginCustomerId);

  if (data.error) {
    const code = data.error.details?.[0]?.errors?.[0]?.errorCode?.authorizationError;
    const isPermissionError =
      code === "USER_PERMISSION_DENIED" || data.error.status === "PERMISSION_DENIED";
    if (isPermissionError && loginCustomerId !== customerId) {
      console.warn(`[${tag}] login-customer-id=${loginCustomerId} negado, retentando com customerId=${customerId}`);
      data = await attempt(customerId);
    }
  }

  if (data.error) {
    console.error(`[${tag}] GAQL error:`, JSON.stringify(data.error));
    throw new Error(data.error.message);
  }

  console.log(`[${tag}] GAQL rows: ${data.results?.length ?? 0}`);
  return data.results?.map((r: unknown) => flattenFields(r)) ?? [];
}
