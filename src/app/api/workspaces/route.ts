import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const freshUser = await db.user.findUnique({
      where: { id: session.user.id },
      select: { workspaceId: true, role: true },
    });

    const userRole = freshUser?.role ?? (session.user as { role?: string }).role;

    if (userRole === "AGENCY") {
      const orConditions: any[] = [{ ownerId: session.user.id }];
      if (freshUser?.workspaceId) {
        orConditions.push({ id: freshUser.workspaceId, ownerId: null });
      }
      const workspaces = await db.workspace.findMany({
        // deletedAt: null exclui workspaces soft-deleted da listagem regular.
        where: { OR: orConditions, deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: {
          integrations: { include: { integration: true } },
          clients: {
            where: { role: "CLIENT" },
            select: { id: true, email: true, name: true },
          },
        },
      });
      return NextResponse.json(workspaces);
    }

    // CLIENT — retorna apenas o workspace ao qual pertence
    const userWorkspaceId = freshUser?.workspaceId ?? (session.user as { workspaceId?: string }).workspaceId;

    if (!userWorkspaceId) {
      return NextResponse.json([]);
    }

    const workspace = await db.workspace.findUnique({
      where: { id: userWorkspaceId },
      include: {
        integrations: { include: { integration: true } },
        clients: {
          where: { role: "CLIENT" },
          select: { id: true, email: true, name: true },
        },
      },
    });

    // CLIENT vinculado a workspace soft-deleted é tratado como "sem workspace".
    return NextResponse.json(workspace && !workspace.deletedAt ? [workspace] : []);
  } catch (err: any) {
    console.error("[workspaces/GET] Erro:", err?.message ?? err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { logo, integrationIds } = body;
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";

    if (!name) {
      return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
    }

    // Valida logo (mesma regra do PUT): só /api/uploads/... ou https://.
    let logoValue: string | null = null;
    if (typeof logo === "string" && logo !== "") {
      if (/^\/api\/uploads\/[\w.\-]+$/.test(logo) || /^https:\/\/[^\s<>"']+$/.test(logo)) {
        logoValue = logo;
      } else {
        return NextResponse.json({ error: "URL de logo inválida" }, { status: 400 });
      }
    }

    // Valida integrationIds: só aceita integrações que já pertencem a workspaces
    // deste mesmo owner. Impede que A "anexe" uma Integration de B passando o id.
    let validIntegrationIds: string[] = [];
    if (Array.isArray(integrationIds) && integrationIds.length > 0) {
      const owned = await db.workspaceIntegration.findMany({
        where: {
          integrationId: { in: integrationIds as string[] },
          workspace: { ownerId: session.user.id },
        },
        select: { integrationId: true },
      });
      const ownedSet = new Set(owned.map((wi) => wi.integrationId));
      validIntegrationIds = (integrationIds as string[]).filter((id) => ownedSet.has(id));
    }

    const baseSlug = slugify(name);

    // Loop com retry — duas requisições simultâneas podem encontrar slug "livre"
    // e racear na criação. Captura P2002 (unique constraint) e tenta o próximo sufixo.
    let workspace = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt}`;
      const exists = await db.workspace.findUnique({ where: { slug } });
      if (exists) continue;

      try {
        workspace = await db.workspace.create({
          data: {
            name,
            slug,
            logo: logoValue,
            ownerId: session.user.id,
            integrations: validIntegrationIds.length
              ? {
                create: validIntegrationIds.map((integrationId) => ({ integrationId })),
              }
              : undefined,
          },
          include: {
            integrations: { include: { integration: true } },
          },
        });
        break;
      } catch (e: any) {
        // P2002 = unique constraint failed (corrida com outra requisição). Tenta o próximo.
        if (e?.code === "P2002") continue;
        throw e;
      }
    }

    if (!workspace) {
      return NextResponse.json({ error: "Não foi possível criar workspace" }, { status: 500 });
    }

    return NextResponse.json(workspace, { status: 201 });
  } catch (err: any) {
    console.error("[workspaces/POST] Erro:", err?.message ?? err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
