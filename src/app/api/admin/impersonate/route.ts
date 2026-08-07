/**
 * POST /api/admin/impersonate
 * Inicia uma sessão impersonada SOMENTE LEITURA de 30 minutos.
 *
 * Quem escreve o cookie de sessão é o próprio Auth.js, via `signIn` com o
 * provider dedicado — este arquivo nunca toca em nome de cookie, nem em
 * encode/decode de JWT.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth, signIn } from "@/auth";
import { validateAdminRequest, logAdminActionStrict } from "@/lib/admin-auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { IMP_PROVIDER_ID, IMP_SESSION_TTL_MS, signImpersonationTicket } from "@/lib/impersonation";

export async function POST(req: NextRequest) {
  if (!validateAdminRequest(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    undefined;

  const rl = rateLimit("admin-impersonate:" + getClientIp(req.headers), 10, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Muitas tentativas" }, { status: 429 });
  }

  // Um POST cross-site "simples" não consegue setar Content-Type: application/json.
  // Com o admin_session em sameSite lax, exigir esse header fecha CSRF.
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Content-Type inválido" }, { status: 415 });
  }

  const body = (await req.json().catch(() => null)) as { userId?: unknown } | null;
  const userId = body?.userId;
  if (typeof userId !== "string" || userId.length === 0) {
    return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });
  }

  const alvo = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      workspace: { select: { slug: true } },
    },
  });

  if (!alvo) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  // A whitelist de PATCH em /api/admin/accounts/[id] aceita a string "ADMIN",
  // então esse role pode existir no banco mesmo sem código que o trate.
  // Recusar aqui barra lavagem de privilégio.
  if (alvo.role === "ADMIN") {
    return NextResponse.json({ error: "Alvo inválido" }, { status: 403 });
  }

  const atual = await auth();
  const operador = atual?.user?.id ?? null;

  if (operador === alvo.id) {
    return NextResponse.json({ error: "Você já está logado como este usuário" }, { status: 409 });
  }

  // Encadear impersonações perderia o operador original e deixaria um par
  // start/end órfão no AdminLog.
  if (atual?.user?.impersonatedBy) {
    return NextResponse.json(
      { error: "Encerre a impersonação atual antes de iniciar outra" },
      { status: 409 }
    );
  }

  const expiraEm = Date.now() + IMP_SESSION_TTL_MS;

  // AUDITORIA ANTES DE QUALQUER COOKIE: sem rastro, não há impersonação.
  try {
    await logAdminActionStrict(
      "user.impersonate_start",
      alvo.id,
      {
        email: alvo.email,
        role: alvo.role,
        workspaceSlug: alvo.workspace?.slug ?? null,
        operador: operador ?? "sem-sessao-de-usuario",
        modo: "somente-leitura",
        ttlMin: 30,
        expiraEm: new Date(expiraEm).toISOString(),
      },
      ip
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível registrar a auditoria — impersonação cancelada" },
      { status: 503 }
    );
  }

  const ticket = signImpersonationTicket(
    alvo.id,
    operador ? "admin:" + operador : "admin",
    expiraEm
  );

  // É aqui que o cookie é escrito, pelo Auth.js, com nome/salt/JWE corretos.
  await signIn(IMP_PROVIDER_ID, { ticket, redirect: false });

  const redirectTo =
    alvo.role === "CLIENT" && alvo.workspace?.slug
      ? "/workspace/" + alvo.workspace.slug
      : "/dashboard";

  return NextResponse.json({ ok: true, redirectTo });
}
