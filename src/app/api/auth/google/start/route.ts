import { NextResponse } from "next/server";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

// Scopes necessários para Google Ads e GA4
const SCOPES = [
  "https://www.googleapis.com/auth/adwords",           // Google Ads API
  "https://www.googleapis.com/auth/analytics.readonly", // GA4 Data API (leitura)
  "https://www.googleapis.com/auth/userinfo.email",    // Email do usuário
  "https://www.googleapis.com/auth/userinfo.profile",  // Perfil do usuário
].join(" ");

export async function GET() {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",  // Importante para receber refresh_token
    prompt: "consent",       // Força consentimento para garantir refresh_token
  });

  const authUrl = `${GOOGLE_AUTH_URL}?${params}`;

  return NextResponse.redirect(authUrl);
}
