import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { resolveCrmAccess, isValidStatus } from "@/lib/crm-access";
import { parseLeadSources } from "@/lib/lead-sources";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const { id: workspaceId } = await ctx.params;

  const access = await resolveCrmAccess(workspaceId, session.user.id);
  if (!access.allowed) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("q")?.trim();

  const where: Record<string, unknown> = { workspaceId };
  if (status && isValidStatus(status)) where.status = status;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { phone: { contains: search } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  const [leads, ws] = await Promise.all([
    db.lead.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 }),
    db.workspace.findUnique({ where: { id: workspaceId }, select: { leadSources: true } }),
  ]);

  return NextResponse.json({
    leads,
    role: access.role,
    canDelete: access.canDelete,
    leadSources: parseLeadSources(ws?.leadSources ?? null),
  });
}

interface CreateLeadBody {
  name: string;
  phone?: string;
  email?: string;
  source?: string;
  campaignId?: string;
  notes?: string;
  status?: string;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const { id: workspaceId } = await ctx.params;

  const access = await resolveCrmAccess(workspaceId, session.user.id);
  if (!access.allowed) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  let body: CreateLeadBody;
  try {
    body = (await req.json()) as CreateLeadBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.name || body.name.trim().length === 0) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }

  const status = body.status && isValidStatus(body.status) ? body.status : "novo";

  const lead = await db.lead.create({
    data: {
      workspaceId,
      name: body.name.trim(),
      phone: body.phone?.trim() || null,
      email: body.email?.trim() || null,
      source: body.source?.trim() || null,
      campaignId: body.campaignId?.trim() || null,
      notes: body.notes?.trim() || null,
      status,
      createdByUserId: session.user.id,
    },
  });

  return NextResponse.json({ lead });
}
