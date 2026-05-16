import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { isValidStatus } from "@/lib/crm-access";

/**
 * Lista consolidada de leads — todos os workspaces que o user AGENCY possui.
 * Permite acompanhar o CRM sem precisar entrar workspace a workspace.
 *
 * Query params:
 *   - status: filtro por status (novo/contato/negociando/vendido/perdido)
 *   - workspaceId: filtro por workspace específico (chips no client)
 *   - q: busca em nome/telefone/email
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "AGENCY") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const workspaceId = url.searchParams.get("workspaceId");
  const search = url.searchParams.get("q")?.trim();

  // Resolve workspaces deste owner (lista usada como filtro + chips).
  const workspaces = await db.workspace.findMany({
    where: { ownerId: session.user.id },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });

  const ownedWorkspaceIds = workspaces.map((w) => w.id);
  if (ownedWorkspaceIds.length === 0) {
    return NextResponse.json({ leads: [], workspaces: [] });
  }

  const where: Record<string, unknown> = {
    workspaceId: workspaceId && ownedWorkspaceIds.includes(workspaceId)
      ? workspaceId
      : { in: ownedWorkspaceIds },
  };
  if (status && isValidStatus(status)) where.status = status;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { phone: { contains: search } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  const leads = await db.lead.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 1000,
    include: {
      workspace: { select: { id: true, name: true, slug: true } },
    },
  });

  return NextResponse.json({ leads, workspaces });
}
