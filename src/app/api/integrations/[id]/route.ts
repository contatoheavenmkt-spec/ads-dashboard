import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Resolve workspaceId do banco
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { workspaceId: true },
  });
  const workspaceId = user?.workspaceId ?? (session.user as { workspaceId?: string }).workspaceId;

  if (!workspaceId) {
    return NextResponse.json({ error: "Sem workspace" }, { status: 403 });
  }

  // Valida ownership: só pode mexer em workspace próprio.
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { ownerId: true },
  });
  if (!workspace || workspace.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  // Remove apenas o vínculo deste workspace com esta integração.
  await db.workspaceIntegration.deleteMany({
    where: { workspaceId, integrationId: id },
  });

  // Só deleta a Integration global se NENHUM workspace ainda a usar.
  // Isso evita que outra agência que compartilhe o adAccountId perca a integração.
  const remaining = await db.workspaceIntegration.count({ where: { integrationId: id } });
  if (remaining === 0) {
    await db.integration.delete({ where: { id } }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
