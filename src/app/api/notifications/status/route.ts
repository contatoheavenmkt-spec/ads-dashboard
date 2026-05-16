import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

/**
 * Retorna se o user logado tem alguma push subscription ativa no DB. Usado
 * pela página /perfil pra refletir o toggle de notificações sem precisar
 * abrir o pushManager do browser (que daria info só do device atual).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const count = await db.pushSubscription.count({
    where: { userId: session.user.id },
  });

  return NextResponse.json({ enabled: count > 0, devices: count });
}
