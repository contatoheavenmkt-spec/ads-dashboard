import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/auth";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const email = body?.email;

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    // Revogar tokens no Google (opcional, mas boa prática)
    const connection = await db.googleConnection.findUnique({
      where: { userId_email: { userId: session.user.id, email } },
    });

    if (connection) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${connection.refreshToken}`, {
          method: "POST",
        });
      } catch (err) {
        console.warn("Não foi possível revogar token no Google:", err);
      }

      // Garante que só deleta a conexão do próprio usuário
      await db.googleConnection.deleteMany({
        where: { email, userId: session.user.id },
      });
    }

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error("Erro ao desconectar Google:", err);
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}
