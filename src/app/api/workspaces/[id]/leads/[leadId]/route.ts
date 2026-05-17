import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { resolveCrmAccess, isValidStatus } from "@/lib/crm-access";
import { clampString } from "@/lib/utils";

interface PatchBody {
  name?: string;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  campaignId?: string | null;
  notes?: string | null;
  status?: string;
  saleValue?: number | null;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; leadId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const { id: workspaceId, leadId } = await ctx.params;

  const access = await resolveCrmAccess(workspaceId, session.user.id);
  if (!access.allowed) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.workspaceId !== workspaceId) {
    return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const n = clampString(body.name, 150);
    if (!n) return NextResponse.json({ error: "Nome não pode ser vazio" }, { status: 400 });
    data.name = n;
  }
  if (body.phone !== undefined) data.phone = clampString(body.phone, 30);
  if (body.email !== undefined) data.email = clampString(body.email, 200);
  if (body.source !== undefined) data.source = clampString(body.source, 50);
  if (body.campaignId !== undefined) data.campaignId = clampString(body.campaignId, 50);
  if (body.notes !== undefined) data.notes = clampString(body.notes, 2000);
  if (body.saleValue !== undefined) {
    // Valida que é número finito e não absurdo (até 100 milhões — futuro-proof).
    const v = Number(body.saleValue);
    data.saleValue = body.saleValue === null ? null : (Number.isFinite(v) && v >= 0 && v < 1e8 ? v : null);
  }

  if (body.status !== undefined) {
    if (!isValidStatus(body.status)) {
      return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    }
    data.status = body.status;
    // Transição pra "vendido" registra quem fechou e quando.
    if (body.status === "vendido" && lead.status !== "vendido") {
      data.closedByUserId = session.user.id;
      data.closedAt = new Date();
    }
    // Saindo de "vendido" pra outro status, limpa o histórico de fechamento
    // pra não ficar inconsistente.
    if (body.status !== "vendido" && lead.status === "vendido") {
      data.closedByUserId = null;
      data.closedAt = null;
    }
  }

  const updated = await db.lead.update({ where: { id: leadId }, data });
  return NextResponse.json({ lead: updated });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; leadId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const { id: workspaceId, leadId } = await ctx.params;

  const access = await resolveCrmAccess(workspaceId, session.user.id);
  if (!access.allowed) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }
  // Decisão de produto: só AGENCY deleta. Cliente final pode marcar "perdido"
  // se um lead virou ruim, mas não apagar (evita perda acidental do funil).
  if (!access.canDelete) {
    return NextResponse.json(
      { error: "Apenas a agência pode deletar leads. Mude para 'perdido' se necessário." },
      { status: 403 },
    );
  }

  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.workspaceId !== workspaceId) {
    return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
  }

  await db.lead.delete({ where: { id: leadId } });
  return NextResponse.json({ ok: true });
}
