import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { bloqueioDeEscrita } from "@/lib/impersonation";
import { rateLimit } from "@/lib/rate-limit";
import { workspaceDaAgencia, workspacesDaAgencia } from "@/lib/track/acesso";
import { STAGES, type Stage } from "@/lib/track/stages";
import { descobrirDatasets, testarEscrita, type DatasetMeta } from "@/lib/meta-capi";
import { getStoredMetaToken } from "@/lib/meta-token";
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
    orderBy: [{ platform: "asc" }, { stage: "asc" }],
  });

  // Contas ligadas a este cliente, das duas plataformas.
  const integracoes = await db.workspaceIntegration.findMany({
    where: { workspaceId, integration: { status: "active" } },
    select: {
      integration: {
        select: { platform: true, adAccountId: true, name: true, loginCustomerId: true, bmId: true, bmName: true },
      },
    },
  });
  const contas = integracoes.map((i) => i.integration).filter((i) => i.platform === "google");
  const contasMeta = integracoes.map((i) => i.integration).filter((i) => i.platform === "meta");

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

  /*
   * Datasets do Meta, descobertos pela conexão que a agência já fez.
   *
   * A versão anterior pedia para colar ID e token na mão, o que é
   * desnecessário: a BM já está ligada ao produto e o OAuth já pede
   * `business_management`. Aqui a lista sai pronta e a pessoa só escolhe.
   */
  let datasets: DatasetMeta[] = [];
  let avisoMeta: string | null = null;
  let temTokenDaConexao = false;

  if (buscarAcoes && contasMeta.length > 0) {
    const tokenMeta = await getStoredMetaToken(session.user.id);
    temTokenDaConexao = Boolean(tokenMeta);
    if (!tokenMeta) {
      avisoMeta = "Conta Meta desconectada. Reconecte em Integrações.";
    } else {
      const bms = [...new Set(contasMeta.map((c) => c.bmId).filter((b): b is string => Boolean(b)))];
      const r = await descobrirDatasets({
        accessToken: tokenMeta,
        businessIds: bms,
        adAccountIds: contasMeta.map((c) => c.adAccountId),
      });
      datasets = r.datasets;
      if (datasets.length === 0) {
        avisoMeta =
          r.avisos.length > 0
            ? `Não encontrei dataset nas BMs ligadas. ${r.avisos[0]}`
            : "Nenhum dataset encontrado nas BMs deste cliente. Confira no Gerenciador de Eventos se existe um ligado à conta de WhatsApp.";
      }
    }
  }

  return NextResponse.json({
    workspaces,
    destinos: destinos.map(({ apiToken, ...d }) => ({ ...d, temToken: Boolean(apiToken) })),
    acoes,
    avisoAcoes,
    contaDeConversao,
    contas,
    contasMeta,
    datasets,
    avisoMeta,
    temTokenDaConexao,
    stages: STAGES,
  });
}

/**
 * Prova que dá para escrever no dataset ANTES de ligar.
 *
 * Listar não garante permissão de escrita, que é o que importa. Manda um
 * evento de teste de verdade (com test_event_code, então não conta para a
 * campanha) e devolve o erro exato do Meta se falhar.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "AGENCY") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const rl = rateLimit(`track-teste-meta:${session.user.id}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Espere um pouco antes de testar de novo." }, { status: 429 });
  }

  const { workspaceId, datasetId, apiToken } = (await req.json().catch(() => ({}))) as {
    workspaceId?: string;
    datasetId?: string;
    apiToken?: string;
  };
  if (!workspaceId || !datasetId) {
    return NextResponse.json({ error: "Informe o cliente e o dataset" }, { status: 400 });
  }
  const ws = await workspaceDaAgencia(workspaceId, session.user.id);
  if (!ws) return NextResponse.json({ error: "Workspace inválido" }, { status: 403 });

  // Ordem: token colado agora, token já salvo, e por fim o da conexão.
  let token = apiToken || null;
  if (!token) {
    const salvo = await db.trackConversionTarget.findFirst({
      where: { workspaceId, platform: "meta", apiToken: { not: null } },
      select: { apiToken: true },
    });
    token = salvo?.apiToken ?? (await getStoredMetaToken(session.user.id));
  }
  if (!token) {
    return NextResponse.json({ error: "Sem token do Meta disponível." }, { status: 400 });
  }

  const r = await testarEscrita(datasetId.replace(/\D/g, ""), token);
  return NextResponse.json(r);
}

interface SalvarBody {
  workspaceId?: string;
  stage?: string;
  platform?: string;
  enabled?: boolean;
  datasetId?: string | null;
  eventName?: string | null;
  apiToken?: string | null;
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

  const platform = body.platform === "meta" ? "meta" : "google";

  // Ligar sem destino escolhido deixaria a fila acumulando e falhando em
  // silêncio: é melhor recusar aqui, com a causa na tela.
  if (body.enabled && platform === "google" && !body.conversionActionId) {
    return NextResponse.json(
      { error: "Escolha a ação de conversão antes de ligar o envio." },
      { status: 400 },
    );
  }
  if (body.enabled && platform === "meta" && !body.datasetId) {
    return NextResponse.json(
      { error: "Informe o ID do dataset do Meta antes de ligar o envio." },
      { status: 400 },
    );
  }

  const dados = {
    enabled: Boolean(body.enabled),
    conversionActionId: body.conversionActionId || null,
    conversionActionName: body.conversionActionName?.slice(0, 200) || null,
    customerId: body.customerId?.replace(/-/g, "") || null,
    loginCustomerId: body.loginCustomerId?.replace(/-/g, "") || null,
    datasetId: body.datasetId?.replace(/\D/g, "") || null,
    eventName: body.eventName?.slice(0, 60) || null,
    // Token vazio na requisição significa "não mexer": assim editar o evento
    // não apaga o token que já estava salvo.
    ...(body.apiToken !== undefined && body.apiToken !== ""
      ? { apiToken: body.apiToken }
      : {}),
    sendValue: Boolean(body.sendValue),
    defaultValue:
      typeof body.defaultValue === "number" && body.defaultValue >= 0 ? body.defaultValue : null,
  };

  const destino = await db.trackConversionTarget.upsert({
    where: {
      workspaceId_stage_platform: {
        workspaceId: body.workspaceId,
        stage: stage as Stage,
        platform,
      },
    },
    update: dados,
    create: { workspaceId: body.workspaceId, stage, platform, ...dados },
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

  // O token nunca volta para o navegador: a tela só precisa saber se existe.
  const { apiToken, ...semSegredo } = destino;
  return NextResponse.json({
    destino: { ...semSegredo, temToken: Boolean(apiToken) },
    pendentesParaBackfill: pendentes,
  });
}
