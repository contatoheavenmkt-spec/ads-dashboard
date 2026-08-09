import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { bloqueioDeEscrita } from "@/lib/impersonation";
import { rateLimit } from "@/lib/rate-limit";
import { workspaceDaAgencia, workspacesDaAgencia } from "@/lib/track/acesso";
import { POLITICA_PADRAO } from "@/lib/ai/tipos";

/**
 * Ligar e calibrar a IA de campanhas, por cliente.
 *
 * Sem meta de CPA a maior parte das regras não roda: é ela que transforma
 * "esta campanha gastou R$3.000" em "esta campanha gastou o triplo do que
 * deveria". Por isso a tela pede a meta antes de deixar ligar.
 */

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "AGENCY") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const workspaces = await workspacesDaAgencia(session.user.id);
  const workspaceId = req.nextUrl.searchParams.get("workspaceId");

  if (!workspaceId) {
    return NextResponse.json({ workspaces, politica: null, padrao: POLITICA_PADRAO });
  }

  const ws = await workspaceDaAgencia(workspaceId, session.user.id);
  if (!ws) return NextResponse.json({ error: "Workspace inválido" }, { status: 403 });

  const [politica, ultimaVarredura, contasGoogle, vendas] = await Promise.all([
    db.aiPolicy.findUnique({ where: { workspaceId } }),
    db.aiRuleRun.findFirst({
      where: { workspaceId },
      orderBy: { startedAt: "desc" },
      select: { runDate: true, geradas: true, finishedAt: true, erros: true },
    }),
    db.workspaceIntegration.count({
      where: { workspaceId, integration: { platform: "google", status: "active" } },
    }),
    // Quantas vendas o Track já capturou: é o que dá substância às duas regras
    // que comparam o gasto com o faturamento real.
    db.trackConversation.count({ where: { workspaceId, stage: "venda" } }),
  ]);

  return NextResponse.json({
    workspaces,
    politica,
    padrao: POLITICA_PADRAO,
    ultimaVarredura,
    temContaGoogle: contasGoogle > 0,
    vendasCapturadas: vendas,
  });
}

interface SalvarBody {
  workspaceId?: string;
  enabled?: boolean;
  targetCpa?: number | null;
  targetRoas?: number | null;
  maxBudgetChangePct?: number;
  maxDailyBudgetCeiling?: number | null;
  minConversionsForCpa?: number;
  lookbackDays?: number;
  disabledRules?: string[];
}

function inteiroEntre(v: unknown, min: number, max: number, padrao: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return padrao;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function dinheiro(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  const bloqueio = bloqueioDeEscrita(session);
  if (bloqueio) return bloqueio;
  if (!session?.user?.id || session.user.role !== "AGENCY") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const rl = rateLimit(`ai-politica:${session.user.id}`, 40, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Muitas requisições. Tente de novo em ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: SalvarBody;
  try {
    body = (await req.json()) as SalvarBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.workspaceId) return NextResponse.json({ error: "Informe o cliente" }, { status: 400 });
  const ws = await workspaceDaAgencia(body.workspaceId, session.user.id);
  if (!ws) return NextResponse.json({ error: "Workspace inválido" }, { status: 403 });

  const targetCpa = dinheiro(body.targetCpa);

  // Ligar sem meta deixaria a IA quase muda: cinco das sete regras dependem
  // dela. Melhor recusar aqui, com o motivo na tela, do que entregar uma
  // análise vazia e o cliente achar que não tem nada errado na conta.
  if (body.enabled && !targetCpa) {
    return NextResponse.json(
      {
        error:
          "Defina a meta de CPA antes de ligar. Sem ela a IA não consegue julgar se uma campanha está cara, e a maior parte das regras não roda.",
      },
      { status: 400 },
    );
  }

  const dados = {
    enabled: Boolean(body.enabled),
    targetCpa,
    targetRoas: dinheiro(body.targetRoas),
    maxBudgetChangePct: inteiroEntre(body.maxBudgetChangePct, 5, 50, POLITICA_PADRAO.maxBudgetChangePct),
    maxDailyBudgetCeiling: dinheiro(body.maxDailyBudgetCeiling),
    minConversionsForCpa: inteiroEntre(body.minConversionsForCpa, 3, 100, POLITICA_PADRAO.minConversionsForCpa),
    lookbackDays: inteiroEntre(body.lookbackDays, 7, 90, POLITICA_PADRAO.lookbackDays),
    disabledRules: Array.isArray(body.disabledRules)
      ? JSON.stringify(body.disabledRules.filter((r) => typeof r === "string").slice(0, 20))
      : null,
  };

  const politica = await db.aiPolicy.upsert({
    where: { workspaceId: body.workspaceId },
    update: dados,
    create: { workspaceId: body.workspaceId, ...dados },
  });

  return NextResponse.json({ politica });
}
