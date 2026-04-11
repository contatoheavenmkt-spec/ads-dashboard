import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const freshUser = await db.user.findUnique({
    where: { id: session.user.id },
    select: { workspaceId: true, role: true },
  });

  const userRole = freshUser?.role ?? (session.user as { role?: string }).role;

  if (userRole === "AGENCY") {
    // Retorna APENAS workspaces criados por este usuário (ownerId)
    // Também inclui workspaces legados onde ownerId é null mas o usuário é member
    const workspaces = await db.workspace.findMany({
      where: {
        OR: [
          { ownerId: session.user.id },
          // Fallback para workspaces migrados sem ownerId: usa workspaceId do user
          { id: freshUser?.workspaceId ?? undefined, ownerId: null },
        ],
      },
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

  return NextResponse.json(workspace ? [workspace] : []);
}

export async function POST(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const { name, logo, integrationIds } = body;

  if (!name) {
    return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
  }

  const baseSlug = slugify(name);
  let slug = baseSlug;
  let counter = 1;

  while (await db.workspace.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter++}`;
  }

  const workspace = await db.workspace.create({
    data: {
      name,
      slug,
      logo: logo ?? null,
      ownerId: session.user.id,  // associa ao criador
      integrations: integrationIds?.length
        ? {
          create: (integrationIds as string[]).map((id: string) => ({
            integrationId: id,
          })),
        }
        : undefined,
    },
    include: {
      integrations: { include: { integration: true } },
    },
  });

  return NextResponse.json(workspace, { status: 201 });
}
