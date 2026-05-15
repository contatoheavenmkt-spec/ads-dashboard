import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import bcrypt from "bcryptjs";
import { normalizeEmail } from "@/lib/email";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "AGENCY") {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const email = normalizeEmail(body?.email);
  const name = typeof body?.name === "string" ? body.name : null;
  const password = typeof body?.password === "string" ? body.password : null;

  if (!email) {
    return NextResponse.json({ error: "Email é obrigatório" }, { status: 400 });
  }

  // Valida ownership do workspace
  const workspace = await db.workspace.findUnique({
    where: { id },
    select: { id: true, ownerId: true },
  });
  if (!workspace) {
    return NextResponse.json({ error: "Workspace não encontrado" }, { status: 404 });
  }
  if (workspace.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  if (password && password.length < 6) {
    return NextResponse.json({ error: "Senha deve ter no mínimo 6 caracteres" }, { status: 400 });
  }

  const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true, role: true, workspaceId: true, email: true },
  });

  // Bloqueia sequestro: não permitir rebaixar AGENCY/ADMIN existente para CLIENT,
  // nem mover um CLIENT de outro workspace sem consentimento.
  if (existing) {
    if (existing.role !== "CLIENT") {
      return NextResponse.json(
        { error: "Já existe um usuário com esse email que não é cliente. Use outro email." },
        { status: 409 },
      );
    }
    if (existing.workspaceId && existing.workspaceId !== id) {
      return NextResponse.json(
        { error: "Esse email já pertence a outro workspace." },
        { status: 409 },
      );
    }
    const updated = await db.user.update({
      where: { id: existing.id },
      data: {
        workspaceId: id,
        role: "CLIENT",
        ...(hashedPassword ? { password: hashedPassword, forcePasswordChange: true } : {}),
        ...(name ? { name } : {}),
      },
      select: { id: true, email: true, name: true },
    });
    return NextResponse.json(updated);
  }

  const created = await db.user.create({
    data: {
      email,
      name: name || null,
      password: hashedPassword,
      role: "CLIENT",
      workspaceId: id,
      // Se a agência setou uma senha inicial, o cliente deve trocá-la no primeiro acesso.
      forcePasswordChange: hashedPassword ? true : false,
    },
    select: { id: true, email: true, name: true },
  });

  return NextResponse.json(created);
}
