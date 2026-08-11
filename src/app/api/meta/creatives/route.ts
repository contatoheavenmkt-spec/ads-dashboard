import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStoredMetaToken } from "@/lib/meta-token";
import { getAdCreatives } from "@/lib/meta-api";
import { requireMetricsAccess, isAdAccountAuthorized } from "@/lib/workspace-access";
import { safeInt } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = safeInt(searchParams.get("days"), 30, 1, 366);
  const adAccountIdParam = searchParams.get("adAccountId");
  const workspaceIdParam = searchParams.get("workspaceId");

  const access = await requireMetricsAccess(req, workspaceIdParam);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status ?? 401 });
  }

  const userId = access.resolvedUserId;
  if (!userId) return NextResponse.json({ ads: [] });

  const token = await getStoredMetaToken(userId);
  if (!token) return NextResponse.json({ ads: [] });

  /*
   * Cada conta carrega o NOME do cliente dono dela.
   *
   * Na visão "Todas as Fontes" esta rota agrega criativos de todos os
   * clientes da agência numa lista só, e sem o rótulo a tela virava uma
   * mistura sem dono: impossível saber de qual cliente era cada anúncio. A
   * autorização entre agências sempre esteve correta; o problema era a
   * agregação sem identificação.
   */
  let contas: Array<{ adAccountId: string; clientName: string }> = [];

  if (adAccountIdParam) {
    // ⚠️ Antes essa rota aceitava qualquer adAccountId direto da query,
    // pulando a validação do workspace. Agora exige que a conta pertença
    // a algum workspace deste owner.
    const ok = await isAdAccountAuthorized(adAccountIdParam, userId, workspaceIdParam);
    if (!ok) {
      return NextResponse.json({ error: "Conta de anúncios não autorizada" }, { status: 403 });
    }
    const wi = await db.workspaceIntegration.findFirst({
      where: {
        integration: { adAccountId: adAccountIdParam, platform: "meta" },
        workspace: { ownerId: userId, deletedAt: null },
      },
      select: { workspace: { select: { name: true } } },
    });
    contas = [{ adAccountId: adAccountIdParam, clientName: wi?.workspace.name ?? "" }];
  } else if (workspaceIdParam) {
    const wsIntegrations = await db.workspaceIntegration.findMany({
      where: { workspaceId: workspaceIdParam },
      include: {
        integration: { select: { adAccountId: true, platform: true } },
        workspace: { select: { name: true } },
      },
    });
    contas = wsIntegrations
      .filter((wi) => wi.integration.platform === "meta")
      .map((wi) => ({ adAccountId: wi.integration.adAccountId, clientName: wi.workspace.name }));
  } else {
    // Sem workspaceId: pega integrações de workspaces do próprio dono.
    const userWs = await db.workspace.findMany({
      where: { ownerId: userId, deletedAt: null },
      include: { integrations: { include: { integration: true } } },
    });
    contas = userWs.flatMap((w) =>
      w.integrations
        .filter((wi) => wi.integration.platform === "meta")
        .map((wi) => ({ adAccountId: wi.integration.adAccountId, clientName: w.name })),
    );
  }

  if (contas.length === 0) return NextResponse.json({ ads: [] });

  const results = await Promise.allSettled(
    contas.map((c) => getAdCreatives(c.adAccountId, token, days)),
  );

  const ads = results
    .flatMap((r, i) =>
      r.status === "fulfilled"
        ? r.value.map((ad) => ({
            ...ad,
            // O rótulo que desfaz a mistura na visão agregada, e o id da
            // conta que o preview precisa para autorizar.
            clientName: contas[i].clientName,
            adAccountId: contas[i].adAccountId,
          }))
        : [],
    )
    .sort((a, b) => b.impressions - a.impressions);

  return NextResponse.json({ ads });
}
