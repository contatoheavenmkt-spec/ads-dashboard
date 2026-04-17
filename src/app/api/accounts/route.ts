import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { workspaceId: true },
    });
    const workspaceId = user?.workspaceId ?? (session.user as { workspaceId?: string }).workspaceId;

    if (!workspaceId) {
      return NextResponse.json([]);
    }

    const workspaceIntegrations = await db.workspaceIntegration.findMany({
      where: { workspaceId },
      include: { integration: true },
    });

    const integrations = workspaceIntegrations
      .map((wi) => wi.integration)
      .sort((a, b) => {
        if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
        return a.name.localeCompare(b.name);
      });

    return NextResponse.json(integrations);
  } catch (err: any) {
    console.error("[accounts/GET] Erro:", err?.message ?? err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
