import { NextRequest, NextResponse } from "next/server";
import { saveMetaToken } from "@/lib/meta-token";

const GRAPH_API = "https://graph.facebook.com/v21.0";

export async function POST(req: NextRequest) {
  const { accessToken } = await req.json();

  if (!accessToken || typeof accessToken !== "string") {
    return NextResponse.json({ error: "Token é obrigatório" }, { status: 400 });
  }

  // Valida o token buscando informações do usuário
  const meRes = await fetch(
    `${GRAPH_API}/me?fields=id,name&access_token=${accessToken}`
  );
  const meData = await meRes.json();

  if (meData.error) {
    return NextResponse.json(
      { error: meData.error.message },
      { status: 400 }
    );
  }

  // Salva no banco
  await saveMetaToken({
    fbUserId: meData.id,
    accessToken,
    name: meData.name,
  });

  return NextResponse.json({
    ok: true,
    name: meData.name,
    fbUserId: meData.id,
  });
}
