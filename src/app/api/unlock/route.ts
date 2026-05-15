import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cookies } from "next/headers";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import {
  shareCookieName,
  signShareToken,
  verifySharePassword,
} from "@/lib/workspace-access";

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 10 tentativas / 5 min por IP (mitiga brute-force).
    const ip = getClientIp(req.headers);
    const rl = rateLimit(`unlock:${ip}`, 10, 5 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Muitas tentativas. Tente novamente em alguns minutos." },
        { status: 429 },
      );
    }

    const { slug, password } = await req.json();
    if (typeof slug !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    const workspace = await db.workspace.findUnique({
      where: { slug },
      select: { id: true, slug: true, publicAccess: true, sharePassword: true },
    });

    // Resposta genérica para não vazar existência do workspace.
    if (!workspace || !workspace.publicAccess || !workspace.sharePassword) {
      return NextResponse.json({ error: "Senha incorreta" }, { status: 401 });
    }

    const ok = await verifySharePassword(password, workspace.sharePassword);
    if (!ok) {
      return NextResponse.json({ error: "Senha incorreta" }, { status: 401 });
    }

    const cookieStore = await cookies();
    const token = signShareToken(workspace.slug, workspace.sharePassword);
    cookieStore.set(shareCookieName(workspace.slug), token, {
      httpOnly: true,
      path: `/cliente/${workspace.slug}`,
      maxAge: 60 * 60 * 24 * 30, // 30 dias
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[unlock/POST] Erro:", err?.message ?? err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
