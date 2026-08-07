/**
 * GET e POST /api/admin/impersonate/exit
 * Encerra a sessão impersonada e devolve o operador à sessão dele.
 *
 * Esta rota NÃO exige validateAdminRequest, de propósito: o admin_session dura
 * 8h e, se ele vencer no meio da impersonação, o operador não pode ficar preso
 * dentro da conta do cliente. A rota só REMOVE privilégio, nunca concede.
 *
 * O GET existe porque é exatamente quando a tela do cliente está quebrada
 * (402 de plano expirado, erro de render, JS morto) que a saída precisa
 * funcionar — um link sai até digitado na barra de endereços.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth, signIn, signOut } from "@/auth";
import { logAdminAction } from "@/lib/admin-auth";
import { IMP_PROVIDER_ID, signImpersonationTicket } from "@/lib/impersonation";

async function encerrar(req: NextRequest, motivo: string): Promise<{ alvoId: string | null }> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    undefined;

  const s = await auth();
  const marca = s?.user?.impersonatedBy;
  const alvoId = s?.user?.id ?? null;

  if (!marca) return { alvoId: null }; // sem marca: no-op

  // Log de fim é best-effort de propósito: assimetria consciente — falha de
  // log NÃO pode prender o operador dentro da conta do usuário.
  await logAdminAction(
    "user.impersonate_end",
    alvoId ?? undefined,
    { email: s?.user?.email, motivo, operador: marca },
    ip
  );

  const operadorId = marca.startsWith("admin:") ? marca.slice("admin:".length) : null;

  if (operadorId) {
    // Restaura a sessão real do operador re-emitindo um ticket by:null.
    // Nenhum cookie é lido, copiado ou adivinhado em nenhum momento.
    try {
      const t = signImpersonationTicket(operadorId, null, 0);
      await signIn(IMP_PROVIDER_ID, { ticket: t, redirect: false });
    } catch {
      await signOut({ redirect: false });
    }
  } else {
    // Operador não tinha sessão de usuário própria: sai limpo.
    await signOut({ redirect: false });
  }

  return { alvoId };
}

export async function GET(req: NextRequest) {
  const motivo = new URL(req.url).searchParams.get("motivo") ?? "manual";
  const { alvoId } = await encerrar(req, motivo);
  const destino = alvoId ? "/admin/accounts/" + alvoId + "?imp=encerrada" : "/admin/accounts";
  return NextResponse.redirect(new URL(destino, req.url), 303);
}

export async function POST(req: NextRequest) {
  const motivo = new URL(req.url).searchParams.get("motivo") ?? "manual";
  const { alvoId } = await encerrar(req, motivo);
  const destino = alvoId ? "/admin/accounts/" + alvoId + "?imp=encerrada" : "/admin/accounts";
  return NextResponse.json({ ok: true, redirectTo: destino });
}
