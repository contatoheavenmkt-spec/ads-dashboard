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
  try {
    const session = await auth();

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

      // Para cada plataforma "presente", confere se o token do dono do workspace
      // ainda é válido — assim a UI não diz "conectado" enquanto o token expirou.
      if (realPlatforms.length > 0) {
        const ws = await db.workspace.findUnique({
          where: { id: workspaceId },
          select: { ownerId: true },
        });
        const ownerId = ws?.ownerId ?? session?.user?.id ?? null;
        if (ownerId) {
          const valid = new Set<string>();
          if (realPlatforms.includes("meta")) {
            const conn = await db.metaConnection.findFirst({
              where: { userId: ownerId },
              orderBy: { updatedAt: "desc" },
              select: { expiresAt: true },
            });
            if (conn && (!conn.expiresAt || conn.expiresAt > new Date())) valid.add("meta");
          }
          if (realPlatforms.includes("google")) {
            const conn = await db.googleConnection.findFirst({
              where: { userId: ownerId },
              orderBy: { connectedAt: "desc" },
              select: { refreshToken: true, expiresAt: true },
            });
            // Para Google, o refreshToken é o que importa (access_token pode renovar).
            if (conn && conn.refreshToken) valid.add("google");
          }
          // GA4 ainda não implementado — usa o mesmo da conexão Google.
          if (realPlatforms.includes("ga4") && valid.has("google")) valid.add("ga4");

          realPlatforms = realPlatforms.filter((p) => valid.has(p));
        }
      }
    }

    const status: ConnectionStatus = {
      meta: realPlatforms.includes("meta"),
      google: realPlatforms.includes("google"),
      ga4: realPlatforms.includes("ga4"),
      connectedCount: realPlatforms.length,
      platforms: realPlatforms,
    };

    return NextResponse.json(status);
  } catch (err: any) {
    console.error("[connections/status] Erro:", err?.message ?? err);
    return NextResponse.json({
      meta: false, google: false, ga4: false, connectedCount: 0, platforms: [],
    });
  }
}
