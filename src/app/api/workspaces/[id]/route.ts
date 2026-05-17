import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { hashSharePassword } from "@/lib/workspace-access";
import { parseVisibleMetrics, serializeVisibleMetrics, type VisibleMetrics } from "@/lib/visible-metrics";
import { parseLeadSources, serializeLeadSources } from "@/lib/lead-sources";

async function requireOwnership(workspaceId: string) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "AGENCY") return null;
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, ownerId: true, deletedAt: true },
  });
  if (!ws || ws.ownerId !== session.user.id) return null;
  // Workspace deletado é invisível pra fluxo normal — DELETE retorna 401 também
  // (já foi deletado, nada a fazer).
  if (ws.deletedAt) return null;
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
      visibleMetrics: true,
      leadSources: true,
      showCrm: true,
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

  const { visibleMetrics: rawMetrics, leadSources: rawLeadSources, ...rest } = workspace;
  return NextResponse.json({
    ...rest,
    hasPassword: !!wsRaw?.sharePassword,
    visibleMetrics: parseVisibleMetrics(rawMetrics),
    leadSources: parseLeadSources(rawLeadSources),
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
  const { name, logo, integrationIds, publicAccess, sharePassword, clearSharePassword, visibleMetrics, leadSources, showCrm } = body;

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

  // visibleMetrics:
  //   - null           → workspace volta pro modo auto-detect
  //   - objeto válido  → salva flags explícitas (campos não listados viram default `true`)
  //   - undefined      → não toca no valor atual
  let visibleMetricsValue: string | null | undefined = undefined;
  if (visibleMetrics === null) {
    visibleMetricsValue = null;
  } else if (visibleMetrics && typeof visibleMetrics === "object") {
    visibleMetricsValue = serializeVisibleMetrics(visibleMetrics as VisibleMetrics);
  }

  // leadSources: array de strings com origens (tags) customizadas pro CRM.
  // Se igual ao default, é serializado como null pra não inflar o DB.
  let leadSourcesValue: string | null | undefined = undefined;
  if (Array.isArray(leadSources)) {
    leadSourcesValue = serializeLeadSources(leadSources as string[]);
  } else if (leadSources === null) {
    leadSourcesValue = null;
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
      ...(visibleMetricsValue !== undefined ? { visibleMetrics: visibleMetricsValue } : {}),
      ...(leadSourcesValue !== undefined ? { leadSources: leadSourcesValue } : {}),
      ...(typeof showCrm === "boolean" ? { showCrm } : {}),
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

  // **Soft delete**: marca `deletedAt` em vez de remover. Preserva:
  //   - Histórico de leads no CRM (auditoria de vendas fechadas)
  //   - CampaignSnapshot e NotificationLog (continuam acessíveis ao owner
  //     via admin se precisar)
  //   - WorkspaceIntegration + Integration (a integração com Meta/Google
  //     fica pendurada mas órfã do workspace ativo)
  //
  // CLIENTs vinculados são desvinculados (workspaceId → null) pra que não
  // tenham acesso a um workspace que "não existe mais" do ponto de vista deles.
  // Se a agência restaurar (sem rota pública por enquanto, mas o campo permite),
  // os CLIENTs precisariam ser re-adicionados.
  await db.user.updateMany({
    where: { workspaceId: id },
    data: { workspaceId: null },
  });
  await db.workspace.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
