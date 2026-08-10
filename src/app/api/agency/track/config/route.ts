import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { bloqueioDeEscrita } from "@/lib/impersonation";
import { workspaceDaAgencia } from "@/lib/track/acesso";
import {
  parseTrackSettings,
  serializeTrackSettings,
  type FraseGatilho,
} from "@/lib/track/settings";
import { STAGES } from "@/lib/track/stages";

/**
 * Regras do Track por cliente: qual etiqueta significa venda, qual frase
 * conta como qualificação, e para onde cada estágio é enviado.
 *
 * É a tela que faz o produto funcionar para aquele cliente específico, porque
 * cada negócio nomeia as etiquetas do jeito dele.
 */

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "AGENCY") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "Informe o cliente" }, { status: 400 });

  const ws = await workspaceDaAgencia(workspaceId, session.user.id);
  if (!ws) return NextResponse.json({ error: "Workspace inválido" }, { status: 403 });

  const [linha, alvos, instancias] = await Promise.all([
    db.trackSettings.findUnique({ where: { workspaceId } }),
    // Select explícito SEM o apiToken: esta rota devolvia a linha inteira e o
    // token de system user do Meta ia parar no navegador. Token vazado dá
    // acesso às contas do cliente; o front só precisa saber que existe.
    db.trackConversionTarget.findMany({
      where: { workspaceId },
      select: {
        id: true, stage: true, platform: true, enabled: true,
        conversionActionId: true, conversionActionName: true,
        datasetId: true, eventName: true, sendValue: true, defaultValue: true,
      },
    }),
    db.whatsappInstance.findMany({
      where: { workspaceId },
      select: {
        id: true, label: true, isBusiness: true, state: true,
        labels: {
          where: { deleted: false },
          select: { waLabelId: true, name: true, color: true },
          orderBy: { name: "asc" },
        },
      },
    }),
  ]);

  // Etiquetas descobertas nos aparelhos: é a lista que a tela mostra para a
  // pessoa escolher, em vez de pedir para digitar um id.
  const etiquetas = instancias.flatMap((i) =>
    i.labels.map((l) => ({ ...l, instanceId: i.id, instanceLabel: i.label })),
  );

  // Etiqueta só existe no WhatsApp Business. Sem isso o funil depende só de
  // frase-gatilho, e a tela precisa dizer isso em vez de deixar o cliente
  // procurando uma lista que nunca vai aparecer.
  const algumBusiness = instancias.some((i) => i.isBusiness);
  const algumConectado = instancias.some((i) => i.state === "open");

  return NextResponse.json({
    workspace: ws,
    config: parseTrackSettings(linha),
    etiquetas,
    alvos,
    avisos: {
      semNumero: instancias.length === 0,
      nenhumConectado: instancias.length > 0 && !algumConectado,
      semBusiness: algumConectado && !algumBusiness,
      semEtiquetas: algumBusiness && etiquetas.length === 0,
    },
    estagios: STAGES,
  });
}

interface SalvarBody {
  workspaceId?: string;
  config?: {
    qualifiedLabelIds?: string[];
    saleLabelIds?: string[];
    lostLabelIds?: string[];
    qualifiedPhrases?: FraseGatilho[];
    salePhrases?: FraseGatilho[];
    respondedMinInbound?: number;
    qualifiedMinTrocas?: number;
    respondedRequiresOutbound?: boolean;
    defaultSaleValue?: number | null;
    storeMessageText?: boolean;
    messageRetentionDays?: number;
    uploadLagHours?: number;
    createLeadInCrm?: boolean;
    syncCrmSale?: boolean;
  };
}

function limparIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length < 64).slice(0, 20);
}

function limparFrases(v: unknown): FraseGatilho[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      const texto = typeof x?.text === "string" ? x.text.trim().slice(0, 120) : "";
      const dir = x?.direction === "in" || x?.direction === "out" ? x.direction : "any";
      return texto.length >= 3 ? { text: texto, direction: dir as FraseGatilho["direction"] } : null;
    })
    .filter((x): x is FraseGatilho => x !== null)
    .slice(0, 20);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  const bloqueio = bloqueioDeEscrita(session);
  if (bloqueio) return bloqueio;
  if (!session?.user?.id || session.user.role !== "AGENCY") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
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

  const c = body.config ?? {};
  const saleLabelIds = limparIds(c.saleLabelIds);
  const qualifiedLabelIds = limparIds(c.qualifiedLabelIds);

  // A mesma etiqueta em dois estágios faria a conversa saltar direto para
  // venda e nunca passar por qualificado de forma coerente.
  const repetida = saleLabelIds.find((id) => qualifiedLabelIds.includes(id));
  if (repetida) {
    return NextResponse.json(
      { error: "A mesma etiqueta não pode significar venda e qualificação ao mesmo tempo." },
      { status: 400 },
    );
  }

  const dados = serializeTrackSettings({
    saleLabelIds,
    qualifiedLabelIds,
    lostLabelIds: limparIds(c.lostLabelIds),
    salePhrases: limparFrases(c.salePhrases),
    qualifiedPhrases: limparFrases(c.qualifiedPhrases),
    // Só mexe se o campo veio no payload. Com fallback fixo em 3, um save de
    // tela antiga (ou cacheada) sem o campo religava em silêncio a
    // qualificação automática de quem tinha escolhido "Desligado".
    ...(c.qualifiedMinTrocas !== undefined
      ? { qualifiedMinTrocas: Math.min(20, Math.max(0, Math.round(Number(c.qualifiedMinTrocas) || 0))) }
      : {}),
    respondedMinInbound: Math.min(Math.max(Number(c.respondedMinInbound) || 2, 1), 20),
    respondedRequiresOutbound: c.respondedRequiresOutbound !== false,
    defaultSaleValue:
      typeof c.defaultSaleValue === "number" && c.defaultSaleValue >= 0 ? c.defaultSaleValue : null,
    storeMessageText: c.storeMessageText !== false,
    messageRetentionDays: Math.min(Math.max(Number(c.messageRetentionDays) || 90, 7), 365),
    uploadLagHours: Math.min(Math.max(Number(c.uploadLagHours ?? 3), 0), 72),
    createLeadInCrm: c.createLeadInCrm !== false,
    syncCrmSale: c.syncCrmSale !== false,
  });

  const linha = await db.trackSettings.upsert({
    where: { workspaceId: ws.id },
    update: dados,
    create: { workspaceId: ws.id, ...dados },
  });

  return NextResponse.json({ config: parseTrackSettings(linha) });
}
