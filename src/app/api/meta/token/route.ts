import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { saveMetaToken } from "@/lib/meta-token";

const GRAPH_API = "https://graph.facebook.com/v21.0";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { accessToken } = await req.json();

  if (!accessToken || typeof accessToken !== "string") {
    return NextResponse.json({ error: "Token é obrigatório" }, { status: 400 });
  }

  const meRes = await fetch(`${GRAPH_API}/me?fields=id,name&access_token=${accessToken}`);
  const meData = await meRes.json();

  if (meData.error) {
    return NextResponse.json({ error: meData.error.message }, { status: 400 });
  }

  await saveMetaToken(session.user.id, {
    fbUserId: meData.id,
    accessToken,
    name: meData.name,
  });

  return NextResponse.json({ ok: true, name: meData.name, fbUserId: meData.id });
}
