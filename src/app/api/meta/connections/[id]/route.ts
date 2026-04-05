import { NextRequest, NextResponse } from "next/server";
import { deleteMetaConnection } from "@/lib/meta-token";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;

  // Remove a conexão OAuth do Facebook (somente do próprio usuário)
  await deleteMetaConnection(session.user.id, id);

  // Verifica se ainda resta alguma conexão (Meta ou Google) para este usuário
  const [remainingGoogle, remainingMeta] = await Promise.all([
    db.googleConnection.count({ where: { userId: session.user.id } }),
    db.metaConnection.count({ where: { userId: session.user.id } }),
  ]);

  if (remainingGoogle === 0 && remainingMeta === 0) {
    // Remove todos os workspaces (nullifica workspaceId dos usuários antes para evitar FK constraint)
    const allWorkspaces = await db.workspace.findMany({ select: { id: true } });
    if (allWorkspaces.length > 0) {
      const ids = allWorkspaces.map((w) => w.id);
      await db.user.updateMany({
        where: { workspaceId: { in: ids } },
        data: { workspaceId: null },
      });
      await db.workspace.deleteMany({ where: { id: { in: ids } } });
    }
  }

  return NextResponse.json({ ok: true });
}
