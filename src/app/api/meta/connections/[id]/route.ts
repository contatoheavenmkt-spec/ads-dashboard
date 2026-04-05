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

  // Remove todas as integrações Meta do workspace do usuário
  if (session?.user?.id) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { workspaceId: true },
    });
    const workspaceId = user?.workspaceId ?? (session.user as { workspaceId?: string }).workspaceId;

    if (workspaceId) {
      // Busca todas as integrações Meta vinculadas a este workspace
      const wsIntegrations = await db.workspaceIntegration.findMany({
        where: { workspaceId },
        include: { integration: true },
      });

      const metaIntegrationIds = wsIntegrations
        .filter((wi) => wi.integration.platform === "meta")
        .map((wi) => wi.integrationId);

      if (metaIntegrationIds.length > 0) {
        // Remove vínculos e integrações
        await db.workspaceIntegration.deleteMany({
          where: { workspaceId, integrationId: { in: metaIntegrationIds } },
        });
        await db.integration.deleteMany({
          where: { id: { in: metaIntegrationIds } },
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
