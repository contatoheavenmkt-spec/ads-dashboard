import { NextRequest, NextResponse } from "next/server";
import { validateAdminRequest, logAdminAction } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdminRequest(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  const { newPassword, forcePasswordChange } = await req.json();
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined;

  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json({ error: "Senha deve ter pelo menos 8 caracteres" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id }, select: { email: true } });
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const hashed = await bcrypt.hash(newPassword, 12);

  await db.user.update({
    where: { id },
    data: {
      password: hashed,
      forcePasswordChange: forcePasswordChange ?? false,
    },
  });

  await logAdminAction("user.password_reset", id, { email: user.email, forceChange: forcePasswordChange ?? false }, ip ?? undefined);

  return NextResponse.json({ ok: true });
}
