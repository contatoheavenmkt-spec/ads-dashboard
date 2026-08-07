import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { clampString } from "@/lib/utils";
import { bloqueioDeEscrita } from "@/lib/impersonation";
import { workspacesDaAgencia } from "@/lib/track/acesso";

/**
 * Sugestões da IA.
 *
 * Modo sugestão: dá para ver, entender e rejeitar. Aplicar de verdade ainda
 * não está ligado, e isso é deliberado. A ordem certa é o gestor acompanhar
 * alguns dias, conferir se o que a IA propõe bate com o que ele faria, e só
 * então habilitar a escrita na conta de anúncios. Ligar antes disso seria
 * pedir confiança que ninguém tem motivo para dar.
 */

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "AGENCY") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const workspaces = await workspacesDaAgencia(session.user.id);
  const ids = workspaces.map((w) => w.id);
  if (ids.length === 0) return NextResponse.json({ sugestoes: [], workspaces: [], politicas: [] });

  const filtroWs = req.nextUrl.searchParams.get("workspaceId");
  const status = req.nextUrl.searchParams.get("status") ?? "pendente";
  const escopo = filtroWs && ids.includes(filtroWs) ? [filtroWs] : ids;

  const [sugestoes, politicas] = await Promise.all([
    db.aiRecommendation.findMany({
      where: {
        workspaceId: { in: escopo },
        ...(status !== "todas" ? { status } : {}),
      },
      orderBy: [{ severity: "asc" }, { prioridade: "desc" }],
      take: 200,
      select: {
        id: true, ruleCode: true, severity: true, status: true, scope: true,
        entityName: true, campaignId: true, titulo: true, porque: true,
        evidencia: true, impactoEstimado: true, createdAt: true, expiresAt: true,
        motivoRejeicao: true, workspaceId: true,
        acoes: { select: { service: true, operation: true, payload: true } },
      },
    }),
    db.aiPolicy.findMany({
      where: { workspaceId: { in: escopo } },
      select: { workspaceId: true, enabled: true, targetCpa: true },
    }),
  ]);

  const nomes = new Map(workspaces.map((w) => [w.id, w.name]));

  return NextResponse.json({
    workspaces,
    politicas,
    sugestoes: sugestoes.map((s) => ({
      ...s,
      workspaceNome: nomes.get(s.workspaceId) ?? "",
      // O front não deve tentar parsear string crua: já vai como objeto.
      evidencia: seguroParse(s.evidencia),
      acao: s.acoes[0] ? seguroParse(s.acoes[0].payload) : null,
      vencida: s.expiresAt ? s.expiresAt.getTime() < Date.now() : false,
    })),
    // Enquanto a escrita não estiver liberada, a tela precisa dizer isso em
    // vez de mostrar um botão que não faz nada.
    aplicacaoHabilitada: false,
  });
}

function seguroParse(bruto: string | null): unknown {
  if (!bruto) return null;
  try {
    return JSON.parse(bruto);
  } catch {
    return null;
  }
}

interface AcaoBody {
  id?: string;
  acao?: "rejeitar";
  motivo?: string;
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  const bloqueio = bloqueioDeEscrita(session);
  if (bloqueio) return bloqueio;
  if (!session?.user?.id || session.user.role !== "AGENCY") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  let body: AcaoBody;
  try {
    body = (await req.json()) as AcaoBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "Informe a sugestão" }, { status: 400 });

  // A checagem de dono vai pela lista de workspaces resolvida no servidor,
  // nunca confiando no id que veio na requisição: sem isso uma agência
  // poderia rejeitar a sugestão de outra.
  const meus = (await workspacesDaAgencia(session.user.id)).map((w) => w.id);
  const sugestao = await db.aiRecommendation.findFirst({
    where: { id: body.id, workspaceId: { in: meus } },
    select: { id: true, status: true, workspaceId: true },
  });
  if (!sugestao) return NextResponse.json({ error: "Sugestão não encontrada" }, { status: 404 });

  if (body.acao !== "rejeitar") {
    return NextResponse.json(
      {
        error:
          "Aplicar sugestão na conta ainda não está liberado. Por enquanto a IA só propõe: acompanhe alguns dias e confira se as propostas batem com o que você faria.",
      },
      { status: 400 },
    );
  }

  if (sugestao.status !== "pendente") {
    return NextResponse.json({ error: "Esta sugestão já foi revisada" }, { status: 409 });
  }

  const motivo = clampString(body.motivo, 300);
  const atualizada = await db.aiRecommendation.updateMany({
    // Transição condicional: dois cliques não revisam duas vezes.
    where: { id: sugestao.id, status: "pendente" },
    data: {
      status: "rejeitada",
      revisadaPorUserId: session.user.id,
      revisadaEm: new Date(),
      motivoRejeicao: motivo,
    },
  });
  if (atualizada.count === 0) {
    return NextResponse.json({ error: "Esta sugestão já foi revisada" }, { status: 409 });
  }

  await db.aiActionLog.create({
    data: {
      recommendationId: sugestao.id,
      workspaceId: sugestao.workspaceId,
      actorUserId: session.user.id,
      actorType: "user",
      evento: "rejeitada",
      erroMensagem: motivo,
    },
  });

  return NextResponse.json({ ok: true });
}
