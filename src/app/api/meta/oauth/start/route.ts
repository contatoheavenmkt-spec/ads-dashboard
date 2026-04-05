import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse(
      `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
        <script>
          window.opener?.postMessage({ type: "META_AUTH_ERROR", message: "Não autenticado" }, "*");
          window.close();
        </script>
      </body></html>`,
      { headers: { "Content-Type": "text/html" }, status: 401 }
    );
  }

  const appId = process.env.META_APP_ID;
  const redirectUri = process.env.META_REDIRECT_URI;

  if (!appId || !redirectUri) {
    return new NextResponse(
      `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
        <script>
          window.opener?.postMessage({ type: "META_AUTH_ERROR", message: "META_APP_ID ou META_REDIRECT_URI não configurados no .env" }, "*");
          window.close();
        </script>
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
  // Passa userId no state para o callback saber a qual usuário salvar
  url.searchParams.set("state", session.user.id);

  return NextResponse.redirect(url.toString());
}
