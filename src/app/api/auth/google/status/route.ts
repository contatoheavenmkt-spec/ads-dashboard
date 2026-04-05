import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ connected: false, email: null });
    }

    const connection = await db.googleConnection.findFirst({
      where: { userId: session.user.id },
      orderBy: { connectedAt: "desc" },
    });

    if (!connection) {
      return NextResponse.json({ connected: false, email: null });
    }

    const isExpired = new Date() > connection.expiresAt;

    return NextResponse.json({
      connected: true,
      email: connection.email,
      connectedAt: connection.connectedAt,
      expiresAt: connection.expiresAt,
      isExpired,
      scopes: connection.scopes?.split(" ") || [],
    });
  } catch (err) {
    console.error("Erro ao verificar status Google:", err);
    return NextResponse.json({ connected: false, error: "Failed to check" }, { status: 500 });
  }
}
