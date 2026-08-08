import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { bloqueioDeEscrita } from "@/lib/impersonation";
import { rateLimit } from "@/lib/rate-limit";
import { workspaceDaAgencia, workspacesDaAgencia } from "@/lib/track/acesso";
import { STAGES, type Stage } from "@/lib/track/stages";
import {
  getValidGoogleToken,
  listConversionActions,
  resolveConversionCustomerId,
  resolveLoginCustomerId,
} from "@/lib/google-ads";

/**
 * Para onde cada estágio do funil é enviado.
 *
 * É o elo que fecha o produto: sem um destino configurado, a venda fica
 * registrada no painel e nunca chega à campanha. A tela lista as ações de
 * conversão da própria conta do cliente para escolher, em vez de pedir que
 * alguém cole um ID na mão.
 *
 * Só ação do tipo UPLOAD_CLICKS serve. As de tag do site recusam upload com
 * INVALID_CONVERSION_ACTION_TYPE, e o erro só apareceria horas depois, na
 * fila, quando a venda já tivesse acontecido.
 */

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "AGENCY") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  const buscarAcoes = req.nextUrl.searchParams.get("acoes") === "1";
  const workspaces = await workspacesDaAgencia(session.user.id);

  if (!workspaceId) {
    return NextResponse.json({ workspaces, destinos: [], acoes: [], stages: STAGES });
  }

  const ws = await workspaceDaAgencia(workspaceId, session.user.id);
  if (!ws) return NextResponse.json({ error: "Workspace inválido" }, { status: 403 });

  const destinos = await db.trackConversionTarget.findMany({
    where: { workspaceId },
    orderBy: { stage: "asc" },
  });

  // Contas Google ligadas a este cliente.
  const integracoes = await db.workspaceIntegration.findMany({
    where: { workspaceId, integration: { platform: "google", status: "active" } },
    select: { integration: { select: { adAccountId: true, name: true, loginCustomerId: true } } },
  });
  const contas = integracoes.map((i) => i.integration);

  // A lista de ações custa uma chamada à API, então só vem quando pedida.
  let acoes: Array<{ id: string; name: string; type: string; status: string; usavel: boolean }> = [];
  let avisoAcoes: string | null = null;
  let contaDeConversao: string | null = null;

  if (buscarAcoes && contas.length > 0) {
    const tokenInfo = await getValidGoogleToken(session.user.id);
    if (!tokenInfo) {
      avisoAcoes = "Conta Google desconectada. Reconecte em Integrações.";
    } else {
      const conta = contas[0];
      const customerId = conta.adAccountId.replace(/-/g, "");
      const loginCustomerId = conta.loginCustomerId || resolveLoginCustomerId(customerId);
      try {
        // A conversão vai para a conta de conversão do MCC, que em
        // cross-account não é a mesma que roda o anúncio.
        contaDeConversao = await resolveConversionCustomerId(
          customerId,
          tokenInfo.accessToken,
          loginCustomerId,
        );
        const lista = await listConversionActions(
          contaDeConversao,
          tokenInfo.accessToken,
          loginCustomerId,
        );
        acoes = lista.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          status: a.status,
          // Só UPLOAD_CLICKS aceita conversão offline enviada por API.
          usavel: a.type === "UPLOAD_CLICKS" && a.status === "ENABLED",
        }));
        if (acoes.filter((a) => a.usavel).length === 0) {
          avisoAcoes =
            "Nenhuma ação de conversão do tipo 'Importação de cliques' foi encontrada nesta conta. Crie uma no Google Ads em Ferramentas > Conversões > Nova > Importar > Cliques.";
        }
      } catch (err) {
        avisoAcoes = `Não consegui listar as ações de conversão: ${(err as Error).message}`;
      }
    }
  }

  return NextResponse.json({
    workspaces,
    destinos,
    acoes,
    avisoAcoes,
    contaDeConversao,
    contas,
    stages: STAGES,
  });
}

interface SalvarBody {
  workspaceId?: string;
  stage?: string;
  enabled?: boolean;
  conversionActionId?: string | null;
  conversionActionName?: string | null;
  customerId?: string | null;
  loginCustomerId?: string | null;
  sendValue?: boolean;
  defaultValue?: number | null;
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  const bloqueio = bloqueioDeEscrita(session);
  if (bloqueio) return bloqueio;
  if (!session?.user?.id || session.user.role !== "AGENCY") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const rl = rateLimit(`track-destinos:${session.user.id}`, 40, 60_000);
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

  const stage = body.stage ?? "";
  if (!(STAGES as readonly string[]).includes(stage)) {
    return NextResponse.json({ error: "Estágio inválido" }, { status: 400 });
  }

  // Ligar sem ação escolhida deixaria a fila acumulando e falhando em
  // silêncio: é melhor recusar aqui, com a causa na tela.
  if (body.enabled && !body.conversionActionId) {
    return NextResponse.json(
      { error: "Escolha a ação de conversão antes de ligar o envio." },
      { status: 400 },
    );
  }

  const dados = {
    enabled: Boolean(body.enabled),
    conversionActionId: body.conversionActionId || null,
    conversionActionName: body.conversionActionName?.slice(0, 200) || null,
    customerId: body.customerId?.replace(/-/g, "") || null,
    loginCustomerId: body.loginCustomerId?.replace(/-/g, "") || null,
    sendValue: Boolean(body.sendValue),
    defaultValue:
      typeof body.defaultValue === "number" && body.defaultValue >= 0 ? body.defaultValue : null,
  };

  const destino = await db.trackConversionTarget.upsert({
    where: {
      workspaceId_stage_platform: {
        workspaceId: body.workspaceId,
        stage: stage as Stage,
        platform: "google",
      },
    },
    update: dados,
    create: { workspaceId: body.workspaceId, stage, platform: "google", ...dados },
  });

  // Ao ligar um destino, as vendas que já aconteceram passam a ser elegíveis:
  // o cron de despacho faz o backfill sozinho na próxima passada, então a
  // tela pode dizer quantas estão esperando.
  const pendentes = dados.enabled
    ? await db.trackEvent.count({
        where: {
          workspaceId: body.workspaceId,
          stage,
          dispatches: { none: { targetId: destino.id } },
        },
      })
    : 0;

  return NextResponse.json({ destino, pendentesParaBackfill: pendentes });
}
