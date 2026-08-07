import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { bloqueioDeEscrita } from "@/lib/impersonation";

export async function POST() {
  try {
    const session = await auth();
    const bloqueio = bloqueioDeEscrita(session);
    if (bloqueio) return bloqueio;
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    await db.user.update({
      where: { id: session.user.id },
      data: { onboardingCompleted: true },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[onboarding/complete] Erro:", err?.message ?? err);
    return NextResponse.json({ error: "Erro ao completar onboarding." }, { status: 500 });
  }
}
