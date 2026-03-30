import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const workspace = await db.workspace.findUnique({
    where: { id },
    include: {
      integrations: { include: { integration: true } },
      clients: { select: { id: true, email: true, name: true } },
    },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  return NextResponse.json(workspace);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { name, logo, integrationIds, publicAccess, sharePassword } = body;

  // Remove todas as integrações e recria
  await db.workspaceIntegration.deleteMany({ where: { workspaceId: id } });

  const workspace = await db.workspace.update({
    where: { id },
    data: {
      name,
      logo,
      publicAccess,
      sharePassword,
      integrations: integrationIds?.length
        ? {
            create: (integrationIds as string[]).map((integrationId: string) => ({
              integrationId,
            })),
          }
        : undefined,
    },
    include: {
      integrations: { include: { integration: true } },
    },
  });

  return NextResponse.json(workspace);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.workspace.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
