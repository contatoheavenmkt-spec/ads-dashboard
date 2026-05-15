import { NextResponse } from "next/server";

// Endpoint legado removido por motivos de segurança: aceitava um accessToken
// arbitrário via POST e salvava como conexão do usuário logado, permitindo
// bypass do OAuth oficial (uso de tokens roubados, etc).
// A única forma suportada de criar uma conexão Meta agora é via
// /api/meta/oauth/start → /api/meta/oauth/callback.
export async function POST() {
  return NextResponse.json(
    { error: "Endpoint descontinuado. Use o fluxo OAuth em /api/meta/oauth/start." },
    { status: 410 },
  );
}
