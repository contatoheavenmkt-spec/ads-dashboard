import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createOAuthState } from "@/lib/meta-oauth";
import { bloqueioDeEscrita } from "@/lib/impersonation";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

const SCOPES = [
  "https://www.googleapis.com/auth/adwords",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

export async function GET() {
  const session = await auth();
  // É GET, mas conecta uma conta de anúncios ao usuário — bloquear é obrigatório.
  const bloqueio = bloqueioDeEscrita(session);
  if (bloqueio) return bloqueio;
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // State assinado com HMAC + TTL — evita forjar/replay com userId de outra
  // vítima. Lança se AUTH_SECRET faltar (falha fechada), então trata aqui em
  // vez de deixar virar um 500 cru do Next.
  let state: string;
  try {
    state = createOAuthState(session.user.id);
  } catch {
    console.error("[auth/google/start] AUTH_SECRET ausente — state não pode ser assinado");
    return NextResponse.json(
      { error: "Configuração do servidor incompleta" },
      { status: 503 },
    );
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return NextResponse.redirect(`${GOOGLE_AUTH_URL}?${params}`);
}
