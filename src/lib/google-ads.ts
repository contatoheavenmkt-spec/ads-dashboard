/**
 * Cliente da Google Ads API usado pelo módulo Track.
 *
 * ESCOPO DESTE ARQUIVO: só o Track consome daqui. As rotas antigas
 * (`api/google/metrics` e `api/google/accounts`) seguem com a cópia própria
 * delas, intocadas, porque já estão em produção servindo os dashboards e
 * mexer nelas não é necessário para o Track funcionar.
 *
 * Isso deixa uma duplicação conhecida entre este arquivo e aquelas duas rotas.
 * É proposital: unificar é uma limpeza que vale a pena um dia, mas é uma
 * mudança em código que já funciona e deve ser feita sozinha, com o dashboard
 * conferido antes e depois, e não de carona num módulo novo.
 *
 * Uma diferença de comportamento a registrar, caso a unificação aconteça:
 * `metrics` aceita conexão com `scopes` vazio (dado legado, de antes de
 * persistirmos escopo) e `accounts` rejeita. Este arquivo segue a versão
 * tolerante do `metrics`.
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

/* ─────────────────────── conversões offline ─────────────────────── */

/**
 * A conta que RECEBE a conversão.
 *
 * Em MCC com conversão cross-account, o upload não vai para a conta que roda
 * o anúncio, e sim para a conta de conversão configurada no manager. Mandar
 * para a conta errada devolve 200 e não registra nada, que é a causa número um
 * de "subiu certo e não apareceu conversão nenhuma".
 */
export async function resolveConversionCustomerId(
  customerId: string,
  token: string,
  loginCustomerId: string,
): Promise<string> {
  try {
    const linhas = await gaqlSearch({
      customerId,
      token,
      loginCustomerId,
      tag: "google-ads/conv-customer",
      query: `
        SELECT customer.id,
               customer.conversion_tracking_setting.google_ads_conversion_customer
        FROM customer
        LIMIT 1
      `,
    });
    const bruto = linhas[0]?.[
      "customer.conversion_tracking_setting.google_ads_conversion_customer"
    ];
    if (typeof bruto === "string" && bruto) {
      // Vem como resource name "customers/1234567890".
      const id = bruto.split("/").pop();
      if (id && /^\d+$/.test(id)) return id;
    }
  } catch (err) {
    console.warn(
      `[google-ads] não consegui resolver a conta de conversão de ${customerId}: ${(err as Error).message}`,
    );
  }
  return customerId;
}

export interface ConversionActionInfo {
  id: string;
  name: string;
  status: string;
  type: string;
  category: string;
}

/**
 * Lista as ações de conversão da conta. O Track só pode usar as do tipo
 * UPLOAD_CLICKS: as outras são de tag no site e recusam upload.
 */
export async function listConversionActions(
  customerId: string,
  token: string,
  loginCustomerId: string,
): Promise<ConversionActionInfo[]> {
  const linhas = await gaqlSearch({
    customerId,
    token,
    loginCustomerId,
    tag: "google-ads/conv-actions",
    query: `
      SELECT conversion_action.id,
             conversion_action.name,
             conversion_action.status,
             conversion_action.type,
             conversion_action.category
      FROM conversion_action
      WHERE conversion_action.status != 'REMOVED'
      ORDER BY conversion_action.name
    `,
  });
  return linhas.map((l) => ({
    id: String(l["conversion_action.id"] ?? ""),
    name: String(l["conversion_action.name"] ?? ""),
    status: String(l["conversion_action.status"] ?? ""),
    type: String(l["conversion_action.type"] ?? ""),
    category: String(l["conversion_action.category"] ?? ""),
  }));
}

/**
 * Formata o instante no padrão que a API exige:
 * "yyyy-MM-dd HH:mm:ss+HH:mm", com o fuso explícito.
 *
 * Sem o deslocamento, o Google interpreta no fuso da conta e a conversão pode
 * cair antes do clique, o que a API recusa com CONVERSION_PRECEDES_CLICK.
 */
export function formatConversionDateTime(quando: Date, timeZone = "America/Sao_Paulo"): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const p: Record<string, string> = {};
  for (const parte of fmt.formatToParts(quando)) p[parte.type] = parte.value;
  // hour12:false pode devolver "24" na virada do dia em alguns runtimes.
  const hora = p.hour === "24" ? "00" : p.hour;

  // Deslocamento real do fuso naquele instante, respeitando horário de verão.
  const local = new Date(quando.toLocaleString("en-US", { timeZone }));
  const utc = new Date(quando.toLocaleString("en-US", { timeZone: "UTC" }));
  const minutos = Math.round((local.getTime() - utc.getTime()) / 60000);
  const sinal = minutos >= 0 ? "+" : "-";
  const abs = Math.abs(minutos);
  const off = `${sinal}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;

  return `${p.year}-${p.month}-${p.day} ${hora}:${p.minute}:${p.second}${off}`;
}

export interface ClickConversion {
  gclid?: string;
  wbraid?: string;
  gbraid?: string;
  conversionAction: string;
  conversionDateTime: string;
  conversionValue?: number;
  currencyCode?: string;
  /** Chave de deduplicação do lado do Google. Usamos o id do despacho. */
  orderId?: string;
}

export interface ResultadoUpload {
  ok: boolean;
  /** Erros por índice do lote, quando partialFailure devolve falhas parciais. */
  errosPorIndice: Map<number, { codigo: string; mensagem: string }>;
  erroGeral?: { codigo: string; mensagem: string };
  requestId?: string;
  respostaCrua: unknown;
}

/**
 * Sobe conversões offline para o Google Ads.
 *
 * `partialFailure: true` é obrigatório aqui: sem ele, uma conversão ruim no
 * lote derruba as outras 199, e um gclid expirado no meio faria perder vendas
 * boas do mesmo envio.
 */
export async function uploadClickConversions(p: {
  customerId: string;
  token: string;
  loginCustomerId: string;
  conversions: ClickConversion[];
  validateOnly?: boolean;
}): Promise<ResultadoUpload> {
  const corpo = JSON.stringify({
    conversions: p.conversions,
    partialFailure: true,
    validateOnly: Boolean(p.validateOnly),
  });

  const res = await fetch(
    `${GADS_API}/customers/${p.customerId}:uploadClickConversions`,
    {
      method: "POST",
      headers: {
        ...gaqlHeaders(p.token, p.loginCustomerId),
        "Content-Length": String(Buffer.byteLength(corpo)),
      },
      body: corpo,
    },
  );

  const data = await res.json().catch(() => ({}));
  const requestId = res.headers.get("request-id") ?? undefined;
  const errosPorIndice = new Map<number, { codigo: string; mensagem: string }>();

  // Erro que derruba a requisição inteira (auth, conta errada, payload podre).
  if (data.error) {
    return {
      ok: false,
      errosPorIndice,
      erroGeral: {
        codigo: extrairCodigo(data.error) ?? data.error.status ?? "ERRO",
        mensagem: data.error.message ?? "falha no upload",
      },
      requestId,
      respostaCrua: data,
    };
  }

  // Falhas parciais: o lote passou, algumas linhas não.
  const parcial = data.partialFailureError;
  if (parcial?.details) {
    for (const detalhe of parcial.details) {
      for (const erro of detalhe.errors ?? []) {
        const indice = erro.location?.fieldPathElements?.find(
          (f: { fieldName?: string }) => f.fieldName === "conversions",
        )?.index;
        const codigo = extrairCodigo({ details: [{ errors: [erro] }] }) ?? "ERRO";
        if (typeof indice === "number") {
          errosPorIndice.set(indice, { codigo, mensagem: erro.message ?? "" });
        }
      }
    }
  }

  return { ok: true, errosPorIndice, requestId, respostaCrua: data };
}

/** O código de erro do Google vem aninhado num objeto com uma chave só. */
function extrairCodigo(erro: unknown): string | null {
  const e = erro as { details?: Array<{ errors?: Array<{ errorCode?: Record<string, string> }> }> };
  const codigo = e?.details?.[0]?.errors?.[0]?.errorCode;
  if (!codigo) return null;
  const valores = Object.values(codigo);
  return valores.length > 0 ? String(valores[0]) : null;
}

/**
 * Vale a pena tentar de novo?
 *
 * Distinguir isso é o que evita dois problemas caros: ficar batendo à toa num
 * erro que nunca vai passar, e desistir de uma conversão boa por um soluço de
 * rede. CLICK_NOT_FOUND é o caso especial: costuma ser só o Google ainda não
 * ter processado o clique, então vale insistir por um tempo.
 */
export function classificarErroDeConversao(codigo: string): "permanente" | "transitorio" | "sucesso" {
  // O Google já tinha essa conversão. Deduplicou por orderId, então deu certo.
  if (codigo === "DUPLICATE_ORDER_ID") return "sucesso";

  const permanentes = [
    "INVALID_CONVERSION_ACTION_TYPE",
    "NO_CONVERSION_ACTION_FOUND",
    "CONVERSION_PRECEDES_EVENT",
    "CONVERSION_PRECEDES_GCLID",
    "EXPIRED_GCLID",
    "EXPIRED_CLICK",
    "TOO_RECENT_GCLID",
    "INVALID_CUSTOMER_ID",
    "CUSTOMER_NOT_ENABLED",
    "INVALID_GCLID",
    "UNPARSEABLE_GCLID",
    "CONVERSION_ACTION_NOT_ENABLED",
    "DUPLICATE_CLICK_CONVERSION_IN_REQUEST",
  ];
  if (permanentes.includes(codigo)) return "permanente";

  return "transitorio";
}
