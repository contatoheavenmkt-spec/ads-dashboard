import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { onboardingCompleted: true },
    });

    return NextResponse.json({
      onboardingCompleted: user?.onboardingCompleted ?? false,
    });
  } catch (err: any) {
    console.error("[onboarding/status] Erro:", err?.message ?? err);
    return NextResponse.json({ onboardingCompleted: false }, { status: 200 });
  }
}
