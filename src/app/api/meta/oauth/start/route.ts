import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { metaLoginConfig, createOAuthState } from "@/lib/meta-oauth";
import { bloqueioDeEscrita } from "@/lib/impersonation";

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
  // É GET, mas conecta uma conta de anúncios ao usuário — bloquear é obrigatório.
  const bloqueio = bloqueioDeEscrita(session);
  if (bloqueio) return bloqueio;
  if (!session?.user?.id) {
    return htmlError("Não autenticado. Faça login primeiro.");
  }

  const { appId, redirectUri, scopes } = metaLoginConfig;

  if (!appId || !redirectUri) {
    console.error("[meta/oauth/start] META_LOGIN_APP_ID ou META_LOGIN_REDIRECT_URI não configurados");
    return htmlError("Configuração do servidor incompleta. Contate o suporte.");
  }

  // State seguro: assinado com HMAC, contém userId + nonce + timestamp.
  // createOAuthState lança se AUTH_SECRET faltar (falha fechada) — sem isso o
  // usuário veria um 500 cru do Next em vez da mesma tela de erro das outras
  // faltas de configuração logo acima.
  let state: string;
  try {
    state = createOAuthState(session.user.id);
  } catch {
    console.error("[meta/oauth/start] AUTH_SECRET ausente — state não pode ser assinado");
    return htmlError("Configuração do servidor incompleta. Contate o suporte.");
  }

  const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  url.searchParams.set("client_id",     appId);
  url.searchParams.set("redirect_uri",  redirectUri);
  url.searchParams.set("scope",         scopes);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state",         state);

  return NextResponse.redirect(url.toString());
}
