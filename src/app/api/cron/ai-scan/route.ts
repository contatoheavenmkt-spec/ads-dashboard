import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeCron, brToday } from "@/lib/cron-auth";
import { getValidGoogleToken, resolveLoginCustomerId } from "@/lib/google-ads";
import { coletarContexto } from "@/lib/ai/coletor";
import { analisar, chaveDeDeduplicacao } from "@/lib/ai/regras";
import { POLITICA_PADRAO, type PoliticaIa, type Sugestao } from "@/lib/ai/tipos";

/**
 * Varre as contas e gera sugestões.
 *
 * Nada é aplicado aqui. A sugestão nasce pendente e espera alguém aprovar no
 * painel, porque errar mexe na verba do cliente e um número ruim numa janela
 * curta muitas vezes é só amostra pequena.
 *
 * Roda uma vez por dia. O unique de AiRuleRun garante uma varredura por conta
 * por dia, mesmo que o cron dispare duas vezes.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Sugestão para de valer depois disso: os números que a embasaram mudaram. */
const VALIDADE_HORAS = 48;

function parsePolitica(linha: unknown): PoliticaIa {
  const l = linha as Record<string, unknown> | null;
  if (!l) return { ...POLITICA_PADRAO };
  let disabled: string[] = [];
  try {
    const v = JSON.parse(String(l.disabledRules ?? "[]"));
    if (Array.isArray(v)) disabled = v.filter((x): x is string => typeof x === "string");
  } catch {
    disabled = [];
  }
  return {
    enabled: Boolean(l.enabled),
    targetCpa: typeof l.targetCpa === "number" ? l.targetCpa : null,
    targetRoas: typeof l.targetRoas === "number" ? l.targetRoas : null,
    maxBudgetChangePct: Number(l.maxBudgetChangePct ?? POLITICA_PADRAO.maxBudgetChangePct),
    maxDailyBudgetCeiling: typeof l.maxDailyBudgetCeiling === "number" ? l.maxDailyBudgetCeiling : null,
    maxAppliedPerDay: Number(l.maxAppliedPerDay ?? POLITICA_PADRAO.maxAppliedPerDay),
    minConversionsForCpa: Number(l.minConversionsForCpa ?? POLITICA_PADRAO.minConversionsForCpa),
    lookbackDays: Number(l.lookbackDays ?? POLITICA_PADRAO.lookbackDays),
    disabledRules: disabled,
  };
}

export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const hoje = brToday();
  const resumo = { contas: 0, geradas: 0, puladas: 0, erros: [] as string[] };

  // Só workspaces que ligaram a IA. Ninguém recebe sugestão sem pedir.
  const politicas = await db.aiPolicy.findMany({
    where: { enabled: true, workspace: { deletedAt: null } },
    select: {
      id: true, workspaceId: true, enabled: true, targetCpa: true, targetRoas: true,
      maxBudgetChangePct: true, maxDailyBudgetCeiling: true, maxAppliedPerDay: true,
      minConversionsForCpa: true, lookbackDays: true, disabledRules: true,
      workspace: {
        select: {
          ownerId: true,
          integrations: { select: { integration: true } },
        },
      },
    },
    take: 100,
  });

  // Sugestão velha não pode continuar aprovável: os números mudaram.
  await db.aiRecommendation.updateMany({
    where: { status: "pendente", expiresAt: { lt: new Date() } },
    data: { status: "expirada" },
  });

  for (const pol of politicas) {
    const politica = parsePolitica(pol);
    const ownerId = pol.workspace.ownerId;
    if (!ownerId) continue;

    const contasGoogle = pol.workspace.integrations
      .map((wi) => wi.integration)
      .filter((i) => i.platform === "google" && i.status === "active");

    for (const conta of contasGoogle) {
      const adAccountId = conta.adAccountId.replace(/-/g, "");

      // Uma varredura por conta por dia.
      try {
        await db.aiRuleRun.create({
          data: { workspaceId: pol.workspaceId, adAccountId, runDate: hoje },
        });
      } catch (err) {
        if ((err as { code?: string }).code === "P2002") {
          resumo.puladas++;
          continue;
        }
        throw err;
      }

      resumo.contas++;

      try {
        const tokenInfo = await getValidGoogleToken(ownerId);
        if (!tokenInfo) {
          resumo.erros.push(`${adAccountId}: conta Google desconectada`);
          continue;
        }

        const loginCustomerId = conta.loginCustomerId || resolveLoginCustomerId(adAccountId);
        const ctx = await coletarContexto({
          customerId: adAccountId,
          token: tokenInfo.accessToken,
          loginCustomerId,
          workspaceId: pol.workspaceId,
          politica,
        });

        const { sugestoes, erros } = analisar(ctx);
        if (erros.length > 0) resumo.erros.push(...erros.map((e) => `${adAccountId}: ${e}`));

        const geradas = await gravar(pol.workspaceId, pol.id, adAccountId, sugestoes, hoje);
        resumo.geradas += geradas;

        await db.aiRuleRun.updateMany({
          where: { workspaceId: pol.workspaceId, adAccountId, runDate: hoje },
          data: {
            regrasAvaliadas: 7,
            geradas,
            finishedAt: new Date(),
            erros: erros.length > 0 ? JSON.stringify(erros).slice(0, 2000) : null,
          },
        });
      } catch (err) {
        const msg = (err as Error).message;
        resumo.erros.push(`${adAccountId}: ${msg}`);
        console.error(`[cron/ai-scan] ${adAccountId}:`, msg);
        await db.aiRuleRun.updateMany({
          where: { workspaceId: pol.workspaceId, adAccountId, runDate: hoje },
          data: { finishedAt: new Date(), erros: msg.slice(0, 2000) },
        });
      }
    }
  }

  return NextResponse.json({ ok: true, ...resumo });
}

async function gravar(
  workspaceId: string,
  policyId: string,
  adAccountId: string,
  sugestoes: Sugestao[],
  dia: string,
): Promise<number> {
  let n = 0;
  const expiraEm = new Date(Date.now() + VALIDADE_HORAS * 3600_000);

  for (const s of sugestoes) {
    const dedupeKey = chaveDeDeduplicacao(s, dia);
    try {
      const rec = await db.aiRecommendation.create({
        data: {
          workspaceId,
          policyId,
          adAccountId,
          ruleCode: s.ruleCode,
          severity: s.severidade,
          status: "pendente",
          scope: s.escopo,
          entityId: s.entityId,
          entityName: s.entityNome.slice(0, 200),
          campaignId: s.campaignId,
          adGroupId: s.adGroupId,
          titulo: s.titulo.slice(0, 300),
          porque: s.porque.slice(0, 2000),
          evidencia: JSON.stringify(s.evidencia).slice(0, 4000),
          prioridade: Math.round(s.impactoEstimado),
          impactoEstimado: s.impactoEstimado,
          dedupeKey,
          expiresAt: expiraEm,
        },
        select: { id: true },
      });

      // A ação fica gravada em separado, com o payload exato da mutação. Ela
      // sai de código determinístico e nunca de um modelo de linguagem: é o
      // que torna a aplicação auditável e reproduzível.
      await db.aiRecommendationAction.create({
        data: {
          recommendationId: rec.id,
          ordem: 0,
          service: servicoDa(s.acao.tipo),
          operation: s.acao.tipo === "negativar_termo" ? "create" : "update",
          payload: JSON.stringify(s.acao),
          updateMask: mascaraDa(s.acao.tipo),
        },
      });

      await db.aiActionLog.create({
        data: {
          recommendationId: rec.id,
          workspaceId,
          actorType: "cron",
          evento: "gerada",
        },
      });
      n++;
    } catch (err) {
      // P2002 = já sugerimos isso hoje. É o caminho normal.
      if ((err as { code?: string }).code !== "P2002") {
        console.error(`[cron/ai-scan] falha ao gravar sugestão ${s.ruleCode}:`, (err as Error).message);
      }
    }
  }
  return n;
}

function servicoDa(tipo: string): string {
  switch (tipo) {
    case "pausar_campanha": return "campaigns";
    case "pausar_anuncio": return "adGroupAds";
    case "pausar_palavra": return "adGroupCriteria";
    case "negativar_termo": return "adGroupCriteria";
    case "ajustar_orcamento": return "campaignBudgets";
    default: return "desconhecido";
  }
}

function mascaraDa(tipo: string): string | null {
  if (tipo === "ajustar_orcamento") return "amount_micros";
  if (tipo === "negativar_termo") return null;
  return "status";
}
