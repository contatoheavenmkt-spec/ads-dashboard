import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { email, name, password } = await req.json();

  if (!email) {
    return NextResponse.json({ error: "Email é obrigatório" }, { status: 400 });
  }

  const workspace = await db.workspace.findUnique({ where: { id } });
  if (!workspace) {
    return NextResponse.json({ error: "Workspace não encontrado" }, { status: 404 });
  }

  const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

  let user = await db.user.findUnique({ where: { email } });

  if (!user) {
    user = await db.user.create({
      data: {
        email,
        name: name || null,
        password: hashedPassword,
        role: "CLIENT",
        workspaceId: id,
      },
    });
  } else {
    user = await db.user.update({
      where: { id: user.id },
      data: {
        workspaceId: id,
        role: "CLIENT",
        ...(hashedPassword ? { password: hashedPassword } : {}),
        ...(name ? { name } : {}),
      },
    });
  }

  return NextResponse.json({ id: user.id, email: user.email, name: user.name });
}
