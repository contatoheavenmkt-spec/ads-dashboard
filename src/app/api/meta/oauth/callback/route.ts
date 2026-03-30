import { NextRequest, NextResponse } from "next/server";
import { saveMetaToken } from "@/lib/meta-token";

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
  const code = searchParams.get("code");
  const error = searchParams.get("error_description");

  if (error || !code) {
    return htmlClose("error", error ?? "Autorização cancelada");
  }

  const appId = process.env.META_APP_ID!;
  const appSecret = process.env.META_APP_SECRET!;
  const redirectUri = process.env.META_REDIRECT_URI!;

  // Troca o code pelo access token
  const tokenUrl = new URL(`${GRAPH_API}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", appId);
  tokenUrl.searchParams.set("client_secret", appSecret);
  tokenUrl.searchParams.set("redirect_uri", redirectUri);
  tokenUrl.searchParams.set("code", code);

  const tokenRes = await fetch(tokenUrl.toString());
  const tokenData = await tokenRes.json();

  if (tokenData.error || !tokenData.access_token) {
    return htmlClose("error", tokenData.error?.message ?? "Falha ao obter token");
  }

  const accessToken: string = tokenData.access_token;
  const expiresIn: number | undefined = tokenData.expires_in;

  // Busca informações do usuário Facebook
  const meRes = await fetch(
    `${GRAPH_API}/me?fields=id,name&access_token=${accessToken}`
  );
  const meData = await meRes.json();

  if (meData.error) {
    return htmlClose("error", meData.error.message);
  }

  // Salva no banco
  await saveMetaToken({
    fbUserId: meData.id,
    accessToken,
    name: meData.name,
    expiresIn,
  });

  return htmlClose("success");
}
