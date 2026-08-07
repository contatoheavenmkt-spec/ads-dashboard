import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { safeInt } from "@/lib/utils";
import { workspacesDaAgencia } from "@/lib/track/acesso";
import { STAGES } from "@/lib/track/stages";

/**
 * Conversas rastreadas e o funil.
 *
 * É a tela que responde a pergunta que motivou o produto: dos cliques que a
 * campanha comprou, quantos viraram conversa, quantos engajaram e quantos
 * viraram venda.
 */

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "AGENCY") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const workspaces = await workspacesDaAgencia(session.user.id);
  const ids = workspaces.map((w) => w.id);
  if (ids.length === 0) {
    return NextResponse.json({ conversas: [], workspaces: [], funil: null });
  }

  const url = req.nextUrl;
  const filtroWs = url.searchParams.get("workspaceId");
  const escopo = filtroWs && ids.includes(filtroWs) ? [filtroWs] : ids;
  const dias = safeInt(url.searchParams.get("dias"), 30, 1, 365);
  const estagio = url.searchParams.get("stage");
  const desde = new Date(Date.now() - dias * 86400_000);

  const where: Record<string, unknown> = {
    workspaceId: { in: escopo },
    firstMessageAt: { gte: desde },
  };
  if (estagio && [...STAGES, "perdido"].includes(estagio)) where.stage = estagio;

  const [conversas, porEstagio, cliques, envios] = await Promise.all([
    db.trackConversation.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      take: 200,
      select: {
        id: true, contactName: true, contactKey: true, stage: true,
        matchType: true, matchConfidence: true, source: true, campaignId: true,
        gclid: true, firstMessageAt: true, lastMessageAt: true,
        inboundCount: true, outboundCount: true, saleValue: true, saleAt: true,
        workspace: { select: { id: true, name: true } },
        instance: { select: { label: true } },
      },
    }),
    db.trackConversation.groupBy({
      by: ["stage"],
      where: { workspaceId: { in: escopo }, firstMessageAt: { gte: desde } },
      _count: { _all: true },
      _sum: { saleValue: true },
    }),
    db.trackClick.count({
      where: { workspaceId: { in: escopo }, createdAt: { gte: desde } },
    }),
    db.trackDispatch.groupBy({
      by: ["status"],
      where: { workspaceId: { in: escopo }, createdAt: { gte: desde } },
      _count: { _all: true },
    }),
  ]);

  // O funil é cumulativo: quem vendeu também respondeu. Contar só o estágio
  // atual de cada conversa mostraria "1 venda, 0 respondeu", que é a leitura
  // errada e destrói a confiança na tela.
  const contagem = new Map(porEstagio.map((g) => [g.stage, g._count._all]));
  const ordem = ["lead", "respondeu", "qualificado", "venda"];
  const acumulado: Record<string, number> = {};
  for (let i = 0; i < ordem.length; i++) {
    acumulado[ordem[i]] = ordem.slice(i).reduce((s, e) => s + (contagem.get(e) ?? 0), 0);
  }

  const faturamento = porEstagio.reduce((s, g) => s + (g._sum.saleValue ?? 0), 0);
  const perdidos = contagem.get("perdido") ?? 0;

  return NextResponse.json({
    workspaces,
    conversas,
    funil: {
      cliques,
      lead: acumulado.lead ?? 0,
      respondeu: acumulado.respondeu ?? 0,
      qualificado: acumulado.qualificado ?? 0,
      venda: acumulado.venda ?? 0,
      perdido: perdidos,
      faturamento,
      // Quantos cliques viraram conversa: quando cai, é gente apagando a
      // mensagem pronta antes de enviar.
      taxaCasamento: cliques > 0 ? ((acumulado.lead ?? 0) / cliques) * 100 : 0,
    },
    envios: Object.fromEntries(envios.map((e) => [e.status, e._count._all])),
    dias,
  });
}
