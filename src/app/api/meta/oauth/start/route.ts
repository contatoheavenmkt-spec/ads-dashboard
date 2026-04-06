import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { metaLoginConfig, createOAuthState } from "@/lib/meta-oauth";

function htmlError(message: string) {
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
      <script>
        window.opener?.postMessage({ type: "META_AUTH_ERROR", message: ${JSON.stringify(message)} }, "*");
        window.close();
      <\/script>
      <p style="font-family:sans-serif;padding:2rem;color:#555">${message}</p>
    </body></html>`,
    { headers: { "Content-Type": "text/html" }, status: 400 }
  );
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return htmlError("Não autenticado. Faça login primeiro.");
  }

  const { appId, redirectUri, scopes } = metaLoginConfig;

  if (!appId || !redirectUri) {
    console.error("[meta/oauth/start] META_LOGIN_APP_ID ou META_LOGIN_REDIRECT_URI não configurados");
    return htmlError("Configuração do servidor incompleta. Contate o suporte.");
  }

  // State seguro: assinado com HMAC, contém userId + nonce + timestamp
  const state = createOAuthState(session.user.id);

  const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  url.searchParams.set("client_id",     appId);
  url.searchParams.set("redirect_uri",  redirectUri);
  url.searchParams.set("scope",         scopes);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state",         state);

  return NextResponse.redirect(url.toString());
}
