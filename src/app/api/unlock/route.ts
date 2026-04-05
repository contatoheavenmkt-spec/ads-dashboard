import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const { slug, password } = await req.json();

  const workspace = await db.workspace.findUnique({ where: { slug } });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace não encontrado" }, { status: 404 });
  }

  if (!workspace.sharePassword || workspace.sharePassword !== password) {
    return NextResponse.json({ error: "Senha incorreta" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(`ws_${slug}`, password, {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.json({ ok: true });
}
