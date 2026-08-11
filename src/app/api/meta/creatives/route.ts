import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStoredMetaToken } from "@/lib/meta-token";
import { getAdCreatives } from "@/lib/meta-api";
import { requireMetricsAccess, isAdAccountAuthorized } from "@/lib/workspace-access";
import { safeInt } from "@/lib/utils";
import { parseCustomRange } from "@/lib/date-range";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = safeInt(searchParams.get("days"), 30, 1, 366);
  // Período "Personalizado" manda since/until (sem days). A rota ignorava e
  // caía nos 30 dias padrão — o carrossel de anúncios do cliente final ficava
  // numa janela diferente dos KPIs da MESMA tela.
  const rangeResult = parseCustomRange(searchParams.get("since"), searchParams.get("until"));
  if (rangeResult.error) {
    return NextResponse.json({ error: rangeResult.error }, { status: 400 });
  }
  const customRange = rangeResult.range;
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
    // findMany, não findFirst: com a conta ligada a N workspaces, o findFirst
    // sem orderBy devolvia um nome ARBITRÁRIO. Agora todos entram e o dedupe
    // abaixo mescla, igual à visão "Todas as Fontes".
    const wis = await db.workspaceIntegration.findMany({
      where: {
        integration: { adAccountId: adAccountIdParam, platform: "meta" },
        workspace: { ownerId: userId, deletedAt: null },
      },
      select: { workspace: { select: { name: true } } },
    });
    contas = wis.length > 0
      ? wis.map((wi) => ({ adAccountId: adAccountIdParam, clientName: wi.workspace.name }))
      : [{ adAccountId: adAccountIdParam, clientName: "" }];
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

  /*
   * A MESMA conta de anúncios pode estar conectada a vários workspaces
   * (cliente cadastrado em duplicidade). Sem dedupe, cada anúncio aparecia
   * uma vez POR workspace — o mesmo criativo 3x na tela, com o mesmo gasto,
   * inflando a lista e as médias. Uma conta = uma busca; o rótulo carrega
   * todos os nomes de cliente que apontam pra ela.
   */
  // Nomes acumulados em array (não em string concatenada): nome de workspace
  // pode conter " · ", e um split no acumulado confundiria fragmento com nome.
  const porConta = new Map<string, string[]>();
  for (const c of contas) {
    const nomes = porConta.get(c.adAccountId) ?? [];
    if (c.clientName && !nomes.includes(c.clientName)) nomes.push(c.clientName);
    porConta.set(c.adAccountId, nomes);
  }
  contas = [...porConta.entries()].map(([adAccountId, nomes]) => ({
    adAccountId,
    clientName: nomes.join(" · "),
  }));

  if (contas.length === 0) return NextResponse.json({ ads: [] });

  // Nome da CONTA de anúncios (do Meta) — rótulo único e sem ambiguidade.
  // O nome de workspace mesclado ("dosanjo · BBG · ...") confundia: parecia
  // vários clientes num anúncio, quando era uma conta ligada a vários
  // cadastros. A conta é o agrupador natural da tela.
  const integracoes = await db.integration.findMany({
    where: { adAccountId: { in: contas.map((c) => c.adAccountId) }, platform: "meta" },
    select: { adAccountId: true, name: true },
  });
  const nomeDaConta = new Map(integracoes.map((i) => [i.adAccountId, i.name]));

  const results = await Promise.allSettled(
    contas.map((c) => getAdCreatives(c.adAccountId, token, days, customRange ?? undefined)),
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
            accountName: nomeDaConta.get(contas[i].adAccountId) ?? contas[i].clientName,
          }))
        : [],
    )
    .sort((a, b) => b.impressions - a.impressions);

  return NextResponse.json({ ads });
}
