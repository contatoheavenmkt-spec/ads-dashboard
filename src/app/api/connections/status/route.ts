import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/auth";

export interface ConnectionStatus {
  meta: boolean;
  google: boolean;
  ga4: boolean;
  connectedCount: number;
  platforms: string[];
}

export async function GET() {
  const session = await auth();

  // Resolve workspaceId do banco (token pode estar em cache)
  let workspaceId: string | null = null;
  if (session?.user?.id) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { workspaceId: true },
    });
    workspaceId = user?.workspaceId ?? (session.user as { workspaceId?: string }).workspaceId ?? null;
  }

  let realPlatforms: string[] = [];

  if (workspaceId) {
    // Busca apenas integrações do workspace do usuário
    const wsIntegrations = await db.workspaceIntegration.findMany({
      where: { workspaceId },
      include: { integration: { select: { platform: true, status: true } } },
    });
    realPlatforms = [
      ...new Set(
        wsIntegrations
          .filter((wi) => wi.integration.status === "active")
          .map((wi) => wi.integration.platform)
      ),
    ];
  }

  const status: ConnectionStatus = {
    meta: realPlatforms.includes("meta"),
    google: realPlatforms.includes("google"),
    ga4: realPlatforms.includes("ga4"),
    connectedCount: realPlatforms.length,
    platforms: realPlatforms,
  };

  return NextResponse.json(status);
}
