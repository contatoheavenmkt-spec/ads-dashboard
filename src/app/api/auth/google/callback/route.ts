import { NextResponse } from "next/server";
import { db } from "@/lib/db";

function htmlResponse(html: string) {
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

function safeMsg(s: string): string {
  return s.replace(/[<>"'&]/g, "");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const userId = searchParams.get("state"); // userId passado pelo start route

  if (error) {
    return htmlResponse(`<script>
      window.opener?.postMessage({ type: "GOOGLE_AUTH_ERROR", message: "${safeMsg(error)}" }, "*");
      window.close();
    </script>`);
  }

  if (!code) {
    return htmlResponse(`<script>
      window.opener?.postMessage({ type: "GOOGLE_AUTH_ERROR", message: "No authorization code" }, "*");
      window.close();
    </script>`);
  }

  if (!userId) {
    return htmlResponse(`<script>
      window.opener?.postMessage({ type: "GOOGLE_AUTH_ERROR", message: "Sessão inválida. Tente novamente." }, "*");
      window.close();
    </script>`);
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        grant_type: "authorization_code",
        code,
      }),
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      return htmlResponse(`<script>
        window.opener?.postMessage({ type: "GOOGLE_AUTH_ERROR", message: "${safeMsg(String(tokens.error))}" }, "*");
        window.close();
      </script>`);
    }

    // Verifica se já existe conexão deste usuário para recuperar refresh_token anterior
    const existingConn = await db.googleConnection.findFirst({
      where: { userId },
      orderBy: { connectedAt: "desc" },
      select: { refreshToken: true },
    });

    if (!tokens.refresh_token && !existingConn?.refreshToken) {
      return htmlResponse(`<script>
        window.opener?.postMessage({ type: "GOOGLE_AUTH_ERROR", message: "Google não retornou refresh_token. Tente reconectar." }, "*");
        window.close();
      </script>`);
    }

    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { "Authorization": `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userInfoResponse.json();

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : new Date(Date.now() + 3600 * 1000);

    const updateData: any = {
      accessToken: tokens.access_token,
      expiresAt,
      scopes: tokens.scope,
    };
    if (tokens.refresh_token) {
      updateData.refreshToken = tokens.refresh_token;
    }

    const refreshTokenForCreate = tokens.refresh_token ?? existingConn?.refreshToken ?? "";

    await db.googleConnection.upsert({
      where: { userId_email: { userId, email: userInfo.email } },
      update: updateData,
      create: {
        userId,
        email: userInfo.email,
        accessToken: tokens.access_token,
        refreshToken: refreshTokenForCreate,
        expiresAt,
        scopes: tokens.scope,
      },
    });

    return htmlResponse(`<script>
      window.opener?.postMessage({ type: "GOOGLE_AUTH_SUCCESS", email: "${safeMsg(userInfo.email)}" }, "*");
      window.close();
    </script>`);

  } catch (err) {
    console.error("Erro na autenticação Google:", err);
    return htmlResponse(`<script>
      window.opener?.postMessage({ type: "GOOGLE_AUTH_ERROR", message: "Internal server error" }, "*");
      window.close();
    </script>`);
  }
}
