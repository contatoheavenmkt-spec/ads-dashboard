import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStoredMetaToken } from "@/lib/meta-token";
import {
  getAccountsInsights,
  aggregateInsights,
  getAccountCampaigns,
  getCampaignInsights,
} from "@/lib/meta-api";
import { getCachedMetrics, setCachedMetrics } from "@/lib/metrics-cache";
import { requireMetricsAccess, isAdAccountAuthorized } from "@/lib/workspace-access";
import { parseCustomRange, daysFromRange } from "@/lib/date-range";
import { rateLimit } from "@/lib/rate-limit-mem";

const EMPTY = {
  timeSeries: [],
  totals: { spend: 0, impressions: 0, reach: 0, clicks: 0, purchases: 0, leads: 0, messages: 0, conversions: 0, revenue: 0, cpc: 0, cpa: 0, roas: 0, ctr: 0 },
  campaigns: [],
  accountIds: [],
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  const bmId = searchParams.get("bmId");
  const adAccountId = searchParams.get("adAccountId");
  const campaignId = searchParams.get("campaignId");
  const force = searchParams.get("force") === "1";
  // Range customizado via since/until tem prioridade sobre `days`. Validação
  // simples: ambos presentes, ambos YYYY-MM-DD, since <= until, máx 1 ano.
  const rangeResult = parseCustomRange(searchParams.get("since"), searchParams.get("until"));
  if (rangeResult.error) {
    return NextResponse.json({ error: rangeResult.error }, { status: 400 });
  }
  const customRange = rangeResult.range;
  const days = customRange
    ? daysFromRange(customRange.since, customRange.until)
    : parseInt(searchParams.get("days") ?? "30");
  // Quando previousPeriod=1, retornamos os totals do período imediatamente
  // anterior — usado pelo client pra calcular delta % nos KPIs.
  const previousPeriod = searchParams.get("previousPeriod") === "1";
  const offset = previousPeriod ? days : 0;

  // Autoriza ANTES de qualquer leitura de cache ou dados.
  const access = await requireMetricsAccess(req, workspaceId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status ?? 401 });
  }

  // Rate limit por user — protege Graph API contra abuse acidental (refresh
  // manual contínuo) ou intencional. Janela maior pra `force=1` que ignora
  // cache e chama Meta direto. Sem rate limit no leitor de cache (barato).
  if (force && access.resolvedUserId) {
    const rl = rateLimit(`metrics-force:${access.resolvedUserId}`, 10, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Muitas requisições. Tente novamente em ${rl.retryAfter}s.` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }
  }

  // Discriminador de cache: por workspace quando disponível, senão por usuário.
  // Inclui bmId para evitar servir dados de BM errado.
  // Se não temos userId nem workspaceId (cenário improvável após
  // requireMetricsAccess), desativamos o cache pra não criar bucket
  // "anon" compartilhável entre usuários.
  const cacheWsId = workspaceId ?? (access.resolvedUserId ? `user:${access.resolvedUserId}` : null);
  // Cache discrimina período (atual vs anterior) e range customizado pra não
  // servir cache do range padrão quando o client pede um intervalo específico.
  const rangeKey = customRange ? `${customRange.since}_${customRange.until}` : String(days);
  const cacheKey = `${rangeKey}:${previousPeriod ? "prev" : "cur"}:${bmId || "anybm"}:${adAccountId || "all"}:${campaignId || "none"}`;

  if (!force && cacheWsId) {
    const cached = await getCachedMetrics(cacheWsId, "meta", cacheKey);
    if (cached) {
      console.log("[metrics/meta] cache hit");
      return NextResponse.json({ ...cached, fromCache: true });
    }
  }

  const userId = access.resolvedUserId;
  if (!userId) return NextResponse.json(EMPTY);

  const token = await getStoredMetaToken(userId);
  if (!token) return NextResponse.json(EMPTY);

  // Quando previousPeriod=1 + customRange, calcula o range deslocado `days`
  // dias antes do `since` original. Ex: range 01/05–10/05 + previousPeriod → 21/04–30/04.
  const effectiveCustomRange = customRange && previousPeriod
    ? (() => {
        const sinceDate = new Date(`${customRange.since}T00:00:00Z`);
        const untilDate = new Date(`${customRange.until}T00:00:00Z`);
        sinceDate.setUTCDate(sinceDate.getUTCDate() - days);
        untilDate.setUTCDate(untilDate.getUTCDate() - days);
        return {
          since: sinceDate.toISOString().slice(0, 10),
          until: untilDate.toISOString().slice(0, 10),
        };
      })()
    : customRange;

  if (campaignId) {
    const timeSeries = await getCampaignInsights(campaignId, token, days);
    const totals = aggregateInsights(timeSeries);
    return NextResponse.json({ timeSeries, totals, campaigns: [], accountIds: [] });
  }

  let accountIds: string[] = [];

  if (workspaceId) {
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      include: { integrations: { include: { integration: true } } },
    });
    if (!workspace) return NextResponse.json({ error: "Workspace não encontrado" }, { status: 404 });
    accountIds = workspace.integrations
      .filter((wi) => wi.integration.platform === "meta")
      .map((wi) => wi.integration.adAccountId);
    // Se o user passou adAccountId, restringe a esse — mas só se já estiver
    // na lista do workspace. Antes não validava: passar adAccountId arbitrário
    // pulava o filtro do workspace.
    if (adAccountId) {
      if (!accountIds.includes(adAccountId)) {
        return NextResponse.json({ error: "Conta de anúncios não autorizada" }, { status: 403 });
      }
      accountIds = [adAccountId];
    }
  } else if (adAccountId) {
    // Sem workspaceId: precisa validar que esse adAccount pertence a algum
    // workspace deste owner. Antes a rota aceitava direto.
    const ok = await isAdAccountAuthorized(adAccountId, userId);
    if (!ok) {
      return NextResponse.json({ error: "Conta de anúncios não autorizada" }, { status: 403 });
    }
    accountIds = [adAccountId];
  } else {
    // Sem workspaceId e sem adAccountId: lista todas as integrações Meta vinculadas
    // a workspaces deste usuário (só do próprio dono, exclui soft-deleted).
    const userWs = await db.workspace.findMany({
      where: { ownerId: userId, deletedAt: null },
      include: { integrations: { include: { integration: true } } },
    });
    accountIds = userWs.flatMap((w) =>
      w.integrations
        .filter((wi) => wi.integration.platform === "meta")
        .map((wi) => wi.integration.adAccountId),
    );
  }

  if (bmId) {
    // Filtra accountIds pelo BM. Sem chamadas extras, usa o que está no DB
    // através de Integration.bmId (preenchido no momento da vinculação).
    const matching = await db.integration.findMany({
      where: { adAccountId: { in: accountIds }, bmId },
      select: { adAccountId: true },
    });
    const allowedSet = new Set(matching.map((i) => i.adAccountId));
    accountIds = accountIds.filter((a) => allowedSet.has(a));
  }

  if (accountIds.length === 0) return NextResponse.json(EMPTY);

  // Modo previousPeriod: só retorna totals (não precisa de timeSeries detalhada
  // nem campanhas — request lightweight pro client calcular delta de KPIs).
  if (previousPeriod) {
    const series = await getAccountsInsights(accountIds, token, days, offset, effectiveCustomRange ?? undefined);
    const totals = aggregateInsights(series);
    const result = { totals };
    if (cacheWsId && series.length > 0) {
      await setCachedMetrics(cacheWsId, "meta", cacheKey, result);
    }
    return NextResponse.json(result);
  }

  const timeSeries = await getAccountsInsights(accountIds, token, days, 0, customRange ?? undefined);
  const totals = aggregateInsights(timeSeries);

  // Campanhas (concatena de todas as contas) — respeita o período do filtro.
  // Antes usava `last_30d` hardcoded e a tabela mostrava 30d mesmo quando
  // o usuário escolhia "Últimos 7 dias", divergindo dos totais.
  const campaignResults = await Promise.allSettled(
    accountIds.map((id) => getAccountCampaigns(id, token, days, customRange ?? undefined)),
  );
  const campaigns = campaignResults
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof getAccountCampaigns>>> => r.status === "fulfilled")
    .flatMap((r) => r.value);

  const result = { timeSeries, totals, campaigns, accountIds };

  // Só persiste cache se tivermos algum dado real, para não sobrescrever
  // cache válido anterior em falhas temporárias da Graph API.
  if (cacheWsId && (timeSeries.length > 0 || campaigns.length > 0)) {
    await setCachedMetrics(cacheWsId, "meta", cacheKey, result);
  }

  return NextResponse.json(result);
}
