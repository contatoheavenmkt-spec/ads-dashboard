import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { validateAccountLimit, validatePlatformLimit } from "@/lib/subscription";

async function resolveWorkspaceId(userId: string, tokenWorkspaceId?: string): Promise<string | null> {
  if (tokenWorkspaceId) return tokenWorkspaceId;

  // Token em cache — busca direto do banco
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { workspaceId: true },
  });
  return user?.workspaceId ?? null;
}

async function getOrCreateWorkspace(userId: string, tokenWorkspaceId?: string): Promise<string> {
  // Always check DB (JWT may be stale from an older session)
  const freshUser = await db.user.findUnique({ where: { id: userId }, select: { workspaceId: true, name: true, email: true } });
  if (freshUser?.workspaceId) return freshUser.workspaceId;

  // No workspace yet — create one inside a transaction to prevent race conditions
  try {
    const result = await db.$transaction(async (tx) => {
      // Double-check inside the transaction
      const u = await tx.user.findUnique({ where: { id: userId }, select: { workspaceId: true } });
      if (u?.workspaceId) return u.workspaceId;

      const name = freshUser?.name ?? freshUser?.email?.split("@")[0] ?? "Minha Agência";
      const slug = `workspace-${userId.slice(-8)}`;

      const workspace = await tx.workspace.create({ data: { name, slug, publicAccess: false, ownerId: userId } });
      await tx.user.update({ where: { id: userId }, data: { workspaceId: workspace.id, onboardingCompleted: true } });
      return workspace.id;
    });
    return result;
  } catch {
    // Race condition: another request may have created the workspace — re-fetch
    const u2 = await db.user.findUnique({ where: { id: userId }, select: { workspaceId: true } });
    if (u2?.workspaceId) return u2.workspaceId;
    throw new Error("Falha ao criar workspace");
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const workspaceId = await resolveWorkspaceId(
    session.user.id,
    (session.user as { workspaceId?: string }).workspaceId
  );

  // Se tem workspace, retorna as integrações vinculadas a ele
  if (workspaceId) {
    const workspaceIntegrations = await db.workspaceIntegration.findMany({
      where: { workspaceId },
      include: { integration: true },
    });
    return NextResponse.json(workspaceIntegrations.map((wi) => wi.integration));
  }

  // Sem workspace ainda: retorna lista vazia (não vaza dados de outros usuários)
  return NextResponse.json([]);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const { adAccountId, name, bmId, bmName, platform } = body as {
    adAccountId: string;
    name: string;
    bmId?: string;
    bmName?: string;
    platform: string;
  };

  if (!adAccountId || !name || !platform) {
    return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
  }

  // Valida limite de contas do plano
  const limitError = await validateAccountLimit(session.user.id);
  if (limitError) {
    return NextResponse.json({ error: limitError, code: "PLAN_LIMIT_REACHED" }, { status: 403 });
  }

  // Valida limite de plataformas do plano (ex: Start só permite 1 plataforma)
  const platformError = await validatePlatformLimit(session.user.id, platform);
  if (platformError) {
    return NextResponse.json({ error: platformError, code: "PLATFORM_LIMIT_REACHED" }, { status: 403 });
  }

  // Garante que o usuário tem workspace (cria se necessário)
  const workspaceId = await getOrCreateWorkspace(
    session.user.id,
    (session.user as { workspaceId?: string }).workspaceId
  );

  // Verifica se já existe integração global com esse adAccountId
  let integration = await db.integration.findFirst({ where: { adAccountId } });

  if (!integration) {
    // Cria nova integração
    integration = await db.integration.create({
      data: {
        platform,
        adAccountId,
        name,
        bmId: bmId ?? null,
        bmName: bmName ?? null,
        accessToken: "",
        status: "active",
      },
    });
  }

  // Verifica se já está vinculada a ESTE workspace
  const alreadyLinked = await db.workspaceIntegration.findUnique({
    where: { workspaceId_integrationId: { workspaceId, integrationId: integration.id } },
  });

  if (alreadyLinked) {
    // Já está no workspace — retorna sucesso silencioso
    return NextResponse.json(integration, { status: 200 });
  }

  // Vincula ao workspace
  await db.workspaceIntegration.create({
    data: { workspaceId, integrationId: integration.id },
  });

  return NextResponse.json(integration, { status: 201 });
}
