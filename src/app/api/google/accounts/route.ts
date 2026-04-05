import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/auth";

const GADS_API = "https://googleads.googleapis.com/v22";
const REQUIRED_SCOPE = "https://www.googleapis.com/auth/adwords";

// ─── Token management ──────────────────────────────────────────────

async function getValidToken(): Promise<{ accessToken: string; scopes: string[] } | null> {
  console.log("[google/accounts] === GETTING VALID TOKEN ===");

  const conn = await db.googleConnection.findFirst({ orderBy: { connectedAt: "desc" } });
  if (!conn) {
    console.log("[google/accounts] ❌ No Google connection found in DB");
    return null;
  }

  console.log("[google/accounts] Connection found for:", conn.email);
  console.log("[google/accounts] Refresh token present:", !!conn.refreshToken);
  console.log("[google/accounts] Scopes stored:", conn.scopes);

  const connScopes = (conn.scopes ?? "").split(" ");
  const hasScope = connScopes.includes(REQUIRED_SCOPE);
  console.log("[google/accounts] Has required scope:", hasScope);

  if (!hasScope) {
    console.error("[google/accounts] ❌ Token missing required scope:", connScopes);
    return null;
  }

  // Force refresh if expiresAt is missing/invalid OR token is expired
  const expiresAt = conn.expiresAt instanceof Date ? conn.expiresAt : null;
  const isExpired = !expiresAt || isNaN(expiresAt.getTime()) || expiresAt <= new Date();

  if (isExpired) {
    console.log("[google/accounts] Token expired or invalid expiresAt, refreshing...");
    if (!conn.refreshToken) {
      console.error("[google/accounts] ❌ No refresh token available");
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
      console.error("[google/accounts] ❌ Token refresh failed:", data.error, data.error_description);
      return null;
    }
    console.log("[google/accounts] ✅ Token refreshed successfully");

    await db.googleConnection.update({
      where: { id: conn.id },
      data: {
        accessToken: data.access_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
      },
    });

    return { accessToken: data.access_token, scopes: connScopes };
  }

  console.log("[google/accounts] ✅ Valid token obtained (not expired)");
  return { accessToken: conn.accessToken, scopes: connScopes };
}

// ─── GET handler ──────────────────────────────────────────────────

export async function GET() {
  console.log("\n[google/accounts] ========== GET /api/google/accounts ==========");

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const devToken = process.env.GOOGLE_DEVELOPER_TOKEN;
  const rawLoginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;

  if (!devToken || !rawLoginCustomerId) {
    console.error("[google/accounts] ❌ Missing env vars");
    return NextResponse.json({ accounts: [], error: "Configuração do servidor incompleta" });
  }

  const loginCustomerId = rawLoginCustomerId.replace(/-/g, "");

  const tokenInfo = await getValidToken();
  if (!tokenInfo) {
    return NextResponse.json({
      accounts: [],
      error: "RECONNECT",
      message: "Token inválido ou sem permissão. Reconecte sua conta Google.",
    });
  }

  // listAccessibleCustomers — NO login-customer-id header (causes 404 if included)
  const listUrl = `${GADS_API}/customers:listAccessibleCustomers`;
  console.log("[google/accounts] Calling:", listUrl);

  let listRes;
  try {
    listRes = await fetch(listUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenInfo.accessToken}`,
        "developer-token": devToken,
        Accept: "application/json",
      },
    });
  } catch (err: any) {
    console.error("[google/accounts] ❌ Fetch error:", err.message);
    return NextResponse.json({ accounts: [], error: `Erro de conexão: ${err.message}` });
  }

  console.log("[google/accounts] Response status:", listRes.status, listRes.statusText);

  const rawText = await listRes.text();
  console.log("[google/accounts] Response body:", rawText.slice(0, 600));

  if (rawText.trim().startsWith("<!DOCTYPE") || rawText.includes("<html")) {
    console.error("[google/accounts] ❌ Got HTML instead of JSON");
    return NextResponse.json({
      accounts: [],
      error: "Erro ao conectar com Google Ads API. Verifique o developer token.",
    });
  }

  let listData: { resourceNames?: string[]; error?: { message: string; code: number; status: string } };
  try {
    listData = JSON.parse(rawText);
  } catch {
    console.error("[google/accounts] ❌ Non-JSON response");
    return NextResponse.json({ accounts: [], error: "Resposta inválida da Google Ads API" });
  }

  if (listData.error) {
    console.error("[google/accounts] ❌ API error:", JSON.stringify(listData.error));
    const errorMsg = listData.error.message || listData.error.status;

    if (listData.error.code === 401 || listData.error.code === 403 ||
        listData.error.status === "UNAUTHENTICATED" || listData.error.status === "PERMISSION_DENIED") {
      return NextResponse.json({
        accounts: [],
        error: "RECONNECT",
        message: `Permissão negada: ${errorMsg}. Reconecte sua conta Google.`,
      });
    }

    return NextResponse.json({ accounts: [], error: `Google Ads API: ${errorMsg}` });
  }

  console.log("[google/accounts] ✅ resourceNames:", listData.resourceNames);

  const resourceNames: string[] = listData.resourceNames ?? [];
  const customerIds = resourceNames.map((r) => r.split("/")[1]);

  if (customerIds.length === 0) {
    return NextResponse.json({ accounts: [] });
  }

  // Fetch account details via GAQL
  const query = "SELECT customer.id, customer.descriptive_name, customer.manager, customer.currency_code, customer.time_zone FROM customer LIMIT 1";

  const results = await Promise.allSettled(
    customerIds.map(async (customerId) => {
      const body = JSON.stringify({ query });

      // Try without login-customer-id first (direct access), then with MCC id
      const tryFetch = async (extraHeaders: Record<string, string> = {}) =>
        fetch(`${GADS_API}/customers/${customerId}/googleAds:search`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokenInfo.accessToken}`,
            "developer-token": devToken,
            "Content-Type": "application/json",
            ...extraHeaders,
          },
          body,
        });

      let res = await tryFetch();
      let data = await res.json();

      // If direct access fails, try via MCC login-customer-id
      if (data.error) {
        console.log(`[google/accounts] Direct access failed for ${customerId}, trying via MCC...`);
        res = await tryFetch({ "login-customer-id": loginCustomerId });
        data = await res.json();
      }

      if (data.error) {
        console.error(`[google/accounts] ❌ Account detail failed for ${customerId}:`, data.error.message);
        throw new Error(data.error.message);
      }

      const row = data.results?.[0]?.customer;
      return {
        customerId,
        name: row?.descriptiveName ?? `Conta ${customerId}`,
        isManager: row?.manager ?? false,
        currency: row?.currencyCode ?? "",
        timeZone: row?.timeZone ?? "",
      };
    })
  );

  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`[google/accounts] ❌ Account detail rejected for ${customerIds[i]}:`, r.reason?.message ?? r.reason);
    }
  });

  const accounts = results
    .filter((r): r is PromiseFulfilledResult<{ customerId: string; name: string; isManager: boolean; currency: string; timeZone: string }> => r.status === "fulfilled")
    .map((r) => r.value);

  // Also include MCC from env if not already in the list
  if (loginCustomerId && !accounts.find((a) => a.customerId === loginCustomerId)) {
    customerIds.push(loginCustomerId);
    // Fetch its details
    try {
      const body = JSON.stringify({ query: "SELECT customer.id, customer.descriptive_name, customer.manager, customer.currency_code, customer.time_zone FROM customer LIMIT 1" });
      const res = await fetch(`${GADS_API}/customers/${loginCustomerId}/googleAds:search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenInfo.accessToken}`,
          "developer-token": devToken,
          "Content-Type": "application/json",
        },
        body,
      });
      const data = await res.json();
      if (!data.error) {
        const row = data.results?.[0]?.customer;
        accounts.push({
          customerId: loginCustomerId,
          name: row?.descriptiveName ?? `Conta ${loginCustomerId}`,
          isManager: row?.manager ?? false,
          currency: row?.currencyCode ?? "",
          timeZone: row?.timeZone ?? "",
        });
      }
    } catch { /* ignore */ }
  }

  // Expand MCC sub-accounts
  const managerIds = accounts.filter((a) => a.isManager).map((a) => a.customerId);
  if (managerIds.length > 0) {
    const subResults = await Promise.allSettled(
      managerIds.map(async (mccId) => {
        const body = JSON.stringify({
          query: "SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.currency_code, customer_client.time_zone, customer_client.level FROM customer_client WHERE customer_client.level = 1 AND customer_client.manager = false",
        });
        const res = await fetch(`${GADS_API}/customers/${mccId}/googleAds:search`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokenInfo.accessToken}`,
            "developer-token": devToken,
            "login-customer-id": mccId,
            "Content-Type": "application/json",
          },
          body,
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        return (data.results ?? []).map((r: any) => ({
          customerId: String(r.customerClient?.id ?? ""),
          name: r.customerClient?.descriptiveName ?? `Conta ${r.customerClient?.id}`,
          isManager: false,
          currency: r.customerClient?.currencyCode ?? "",
          timeZone: r.customerClient?.timeZone ?? "",
        }));
      })
    );

    for (const r of subResults) {
      if (r.status === "fulfilled") {
        for (const sub of r.value) {
          if (sub.customerId && !accounts.find((a) => a.customerId === sub.customerId)) {
            accounts.push(sub);
          }
        }
      } else {
        console.error("[google/accounts] ❌ MCC sub-account fetch failed:", r.reason?.message);
      }
    }
  }

  console.log("[google/accounts] ✅ Returning", accounts.length, "accounts");
  return NextResponse.json({ accounts });
}
