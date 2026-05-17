import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

/**
 * Histórico de notificações que o user logado recebeu (NotificationLog).
 * Inclui notificações direcionadas individualmente ao userId e notificações
 * de workspace que o user pertence (CLIENT) ou possui (AGENCY).
 *
 * Limit 100 por padrão — o histórico mais antigo é purgado pelo daily cleanup
 * (se houver) ou simplesmente paginado pelo client se necessário.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50")));

  // Resolve workspaces do user: AGENCY = ownedWorkspaces; CLIENT = workspaceId.
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      workspaceId: true,
      ownedWorkspaces: { select: { id: true } },
    },
  });
  if (!user) return NextResponse.json({ notifications: [] });

  const workspaceIds = [
    ...user.ownedWorkspaces.map((w) => w.id),
    ...(user.workspaceId ? [user.workspaceId] : []),
  ];

  const notifications = await db.notificationLog.findMany({
    where: {
      OR: [
        { userId: session.user.id },
        ...(workspaceIds.length > 0 ? [{ workspaceId: { in: workspaceIds } }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      url: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ notifications });
}
