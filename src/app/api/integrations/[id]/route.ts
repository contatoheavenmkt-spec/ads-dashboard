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

  if (workspaceId) {
    // Remove apenas o vínculo deste workspace com esta integração
    await db.workspaceIntegration.deleteMany({
      where: { workspaceId, integrationId: id },
    });

    // Se não há mais nenhum workspace usando esta integração, deleta ela
    const remaining = await db.workspaceIntegration.count({ where: { integrationId: id } });
    if (remaining === 0) {
      await db.integration.delete({ where: { id } });
    }
  } else {
    // Sem workspace: deleta globalmente (fallback)
    await db.integration.delete({ where: { id } });
  }

  return NextResponse.json({ ok: true });
}
