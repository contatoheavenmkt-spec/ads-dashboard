import { NextResponse } from "next/server";

export async function GET() {
  const appId = process.env.META_APP_ID;
  const redirectUri = process.env.META_REDIRECT_URI;

  if (!appId || !redirectUri) {
    return new NextResponse(
      `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
        <script>
          window.opener?.postMessage({ type: "META_AUTH_ERROR", message: "META_APP_ID ou META_REDIRECT_URI não configurados no .env" }, "*");
          window.close();
        </script>
        <p style="font-family:sans-serif;padding:2rem;color:#555">
          Erro de configuração no servidor. Fechando...
        </p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" }, status: 500 }
    );
  }

  const scopes = ["ads_read", "ads_management", "business_management", "email"].join(",");

  const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("response_type", "code");

  return NextResponse.redirect(url.toString());
}
