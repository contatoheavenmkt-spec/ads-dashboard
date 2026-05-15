import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { hashSharePassword } from "@/lib/workspace-access";

async function requireOwnership(workspaceId: string) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "AGENCY") return null;
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, ownerId: true },
  });
  if (!ws || ws.ownerId !== session.user.id) return null;
  return { userId: session.user.id, workspace: ws };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth_ = await requireOwnership(id);
  if (!auth_) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const workspace = await db.workspace.findUnique({
    where: { id },
    select: {
      id: true,
      ownerId: true,
      name: true,
      slug: true,
      logo: true,
      publicAccess: true,
      // sharePassword nunca é exposto na resposta — substituído por hasPassword.
      createdAt: true,
      updatedAt: true,
      integrations: { include: { integration: true } },
      clients: {
        where: { role: "CLIENT" },
        select: { id: true, email: true, name: true },
      },
    },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  const wsRaw = await db.workspace.findUnique({
    where: { id },
    select: { sharePassword: true },
  });

  return NextResponse.json({
    ...workspace,
    hasPassword: !!wsRaw?.sharePassword,
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth_ = await requireOwnership(id);
  if (!auth_) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const { name, logo, integrationIds, publicAccess, sharePassword, clearSharePassword } = body;

  // sharePassword:
  //  - clearSharePassword=true   → remove explicitamente
  //  - sharePassword === null    → remove (UI envia null quando desliga o toggle)
  //  - string não-vazia          → hash bcrypt e salva
  //  - undefined / string vazia  → não toca no valor atual
  let sharePasswordValue: string | null | undefined = undefined;
  if (clearSharePassword || sharePassword === null) {
    sharePasswordValue = null;
  } else if (typeof sharePassword === "string" && sharePassword.length > 0) {
    sharePasswordValue = await hashSharePassword(sharePassword);
  }

  // Valida URL de logo: só aceita caminhos relativos da nossa API de uploads
  // ou URLs https. Evita XSS via javascript: ou data: URIs.
  let logoValue: string | null | undefined = undefined;
  if (typeof logo === "string") {
    if (logo === "") {
      logoValue = null;
    } else if (/^\/api\/uploads\/[\w.\-]+$/.test(logo) || /^https:\/\/[^\s<>"']+$/.test(logo)) {
      logoValue = logo;
    } else {
      return NextResponse.json({ error: "URL de logo inválida" }, { status: 400 });
    }
  }

  // Valida integrationIds — só aceita integrações que JÁ pertencem a workspaces deste owner.
  // Evita que owner anexe Integration global compartilhada/de outros tenants.
  let integrationsCreate: Array<{ integrationId: string }> | undefined = undefined;
  if (Array.isArray(integrationIds) && integrationIds.length > 0) {
    const validIntegrations = await db.workspaceIntegration.findMany({
      where: {
        integrationId: { in: integrationIds as string[] },
        workspace: { ownerId: auth_.userId },
      },
      select: { integrationId: true },
    });
    const validSet = new Set(validIntegrations.map((wi) => wi.integrationId));
    integrationsCreate = (integrationIds as string[])
      .filter((iid) => validSet.has(iid))
      .map((integrationId: string) => ({ integrationId }));
  }

  // Remove integrações antigas e recria
  await db.workspaceIntegration.deleteMany({ where: { workspaceId: id } });

  const workspace = await db.workspace.update({
    where: { id },
    data: {
      ...(typeof name === "string" ? { name } : {}),
      ...(logoValue !== undefined ? { logo: logoValue } : {}),
      ...(typeof publicAccess === "boolean" ? { publicAccess } : {}),
      ...(sharePasswordValue !== undefined ? { sharePassword: sharePasswordValue } : {}),
      integrations: integrationsCreate?.length
        ? { create: integrationsCreate }
        : undefined,
    },
    select: {
      id: true,
      ownerId: true,
      name: true,
      slug: true,
      logo: true,
      publicAccess: true,
      createdAt: true,
      updatedAt: true,
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
  const auth_ = await requireOwnership(id);
  if (!auth_) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Antes de deletar workspace, desvincula os CLIENTs (workspaceId fica null)
  // para evitar FK constraint.
  await db.user.updateMany({
    where: { workspaceId: id },
    data: { workspaceId: null },
  });
  await db.workspace.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
