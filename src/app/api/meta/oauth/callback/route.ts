import { NextRequest, NextResponse } from "next/server";
import { saveMetaToken } from "@/lib/meta-token";
import { metaLoginConfig, verifyOAuthState } from "@/lib/meta-oauth";

const GRAPH_API = "https://graph.facebook.com/v21.0";

function htmlClose(status: "success" | "error", message?: string) {
  const script =
    status === "success"
      ? `window.opener?.postMessage({ type: "META_AUTH_SUCCESS" }, "*"); window.close();`
      : `window.opener?.postMessage({ type: "META_AUTH_ERROR", message: ${JSON.stringify(message ?? "Erro")} }, "*"); window.close();`;

  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
      <script>${script}<\/script>
      <p style="font-family:sans-serif;padding:2rem;color:#555">
        ${status === "success" ? "Conectado! Fechando..." : `Erro: ${message}`}
      </p>
    </body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get("code");
  const error = searchParams.get("error_description");
  const state = searchParams.get("state");

  if (error || !code) {
    return htmlClose("error", error ?? "Autorização cancelada pelo usuário");
  }

  if (!state) {
    return htmlClose("error", "Parâmetro state ausente. Tente novamente.");
  }

  // Verifica assinatura e extrai userId do state
  const userId = verifyOAuthState(state);
  if (!userId) {
    return htmlClose("error", "State inválido ou expirado. Reinicie o processo de conexão.");
  }

  const { appId, appSecret, redirectUri } = metaLoginConfig;

  if (!appId || !appSecret || !redirectUri) {
    console.error("[meta/oauth/callback] Credenciais do app de login não configuradas");
    return htmlClose("error", "Configuração do servidor incompleta.");
  }

  try {
    // Troca o code pelo access_token usando o App de Login
    const tokenUrl = new URL(`${GRAPH_API}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id",     appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri",  redirectUri);
    tokenUrl.searchParams.set("code",          code);

    const tokenRes  = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();

    if (tokenData.error || !tokenData.access_token) {
      console.error("[meta/oauth/callback] Erro ao obter token:", tokenData.error);
      return htmlClose("error", tokenData.error?.message ?? "Falha ao obter token de acesso");
    }

    const accessToken: string        = tokenData.access_token;
    const expiresIn:   number | undefined = tokenData.expires_in;

    // Busca dados básicos do usuário Meta
    const meRes  = await fetch(`${GRAPH_API}/me?fields=id,name&access_token=${accessToken}`);
    const meData = await meRes.json();

    if (meData.error) {
      console.error("[meta/oauth/callback] Erro ao buscar perfil:", meData.error);
      return htmlClose("error", meData.error.message);
    }

    // Salva a conexão no banco associada ao userId extraído do state
    await saveMetaToken(userId, {
      fbUserId:  meData.id,
      accessToken,
      name:      meData.name,
      expiresIn,
    });

    return htmlClose("success");

  } catch (err: any) {
    console.error("[meta/oauth/callback] Erro interno:", err?.message ?? err);
    return htmlClose("error", "Erro interno ao processar autenticação. Tente novamente.");
  }
}
