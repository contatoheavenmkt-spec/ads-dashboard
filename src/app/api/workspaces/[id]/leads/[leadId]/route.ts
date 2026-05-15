import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { resolveCrmAccess, isValidStatus } from "@/lib/crm-access";

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
    if (!body.name.trim()) {
      return NextResponse.json({ error: "Nome não pode ser vazio" }, { status: 400 });
    }
    data.name = body.name.trim();
  }
  if (body.phone !== undefined) data.phone = body.phone?.trim() || null;
  if (body.email !== undefined) data.email = body.email?.trim() || null;
  if (body.source !== undefined) data.source = body.source?.trim() || null;
  if (body.campaignId !== undefined) data.campaignId = body.campaignId?.trim() || null;
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
  if (body.saleValue !== undefined) data.saleValue = body.saleValue;

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
