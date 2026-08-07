// Caminho relativo, não o alias "@/": este módulo também é importado pelo
// worker, que roda via tsx fora do resolver de paths do Next.
import type { PrismaClient } from "../../generated/prisma/client";
import { stagesImplicados, type Stage } from "./stages";
import type { TrackConfig } from "./settings";

/**
 * Registra um estágio alcançado e enfileira o envio da conversão.
 *
 * É o ponto onde o Track vira dinheiro: daqui sai o evento que o Google Ads
 * vai receber. Por isso tudo aqui é idempotente em duas camadas de banco, não
 * em lógica de aplicação:
 *
 * - `TrackEvent` tem unique [conversationId, stage]: um evento por estágio por
 *   jornada, para sempre.
 * - `TrackDispatch` tem unique [eventId, targetId]: a mesma conversão nunca
 *   entra duas vezes na fila.
 *
 * Recebe o client por parâmetro porque roda dos dois lados: no worker (que
 * observa o WhatsApp) e nas rotas do Next (marcação manual e sync do CRM).
 */

type Db = PrismaClient;

export interface RegistrarStageParams {
  db: Db;
  workspaceId: string;
  conversationId: string;
  stage: Stage;
  origem: "label" | "phrase" | "messages" | "manual" | "crm" | "auto";
  cfg: TrackConfig;
  /** Quando o fato aconteceu de verdade, não quando processamos. */
  occurredAt?: Date;
  valor?: number | null;
  detalhe?: string;
}

export interface ResultadoRegistro {
  /** Estágios que passaram a existir agora (pode incluir os retroativos). */
  criados: Stage[];
  /** Quantos envios entraram na fila. */
  despachos: number;
  /** Por que não enfileirou nada, quando for o caso. */
  motivoSemDespacho?: string;
}

export async function registrarStage(p: RegistrarStageParams): Promise<ResultadoRegistro> {
  const { db, workspaceId, conversationId, stage, cfg } = p;
  const quando = p.occurredAt ?? new Date();

  const conversa = await db.trackConversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true, stage: true, clickId: true, matchConfidence: true,
      gclid: true, ctwaClid: true, source: true, leadId: true,
      firstMessageAt: true,
    },
  });
  if (!conversa) return { criados: [], despachos: 0, motivoSemDespacho: "conversa não existe" };

  // Registrar "venda" implica registrar "qualificado" e "respondeu"
  // retroativamente. Sem isso o painel mostra "1 venda, 0 qualificados", e
  // ninguém confia num funil que não fecha a conta.
  const alvos = stagesImplicados(stage);
  const criados: Stage[] = [];

  for (const s of alvos) {
    const ehOAlcancado = s === stage;
    try {
      await db.trackEvent.create({
        data: {
          workspaceId,
          conversationId,
          stage: s,
          // Só o estágio efetivamente alcançado carrega valor e origem real;
          // os retroativos entram como preenchimento automático.
          value: ehOAlcancado ? (p.valor ?? null) : null,
          source: ehOAlcancado ? p.origem : "auto",
          occurredAt: quando,
        },
      });
      criados.push(s);
    } catch (err) {
      // P2002 = o estágio já existia. É o caminho normal quando a etiqueta é
      // tirada e posta de novo, ou quando duas mensagens disparam a regra.
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  }

  if (criados.length === 0) {
    return { criados: [], despachos: 0, motivoSemDespacho: "nenhum estágio novo" };
  }

  // Espelha o estágio na conversa: o painel lê daqui sem precisar de join.
  const camposDeData: Record<string, unknown> = { stage };
  if (alvos.includes("respondeu")) camposDeData.respondedAt = camposDeData.respondedAt ?? quando;
  if (stage === "qualificado" || alvos.includes("qualificado")) {
    camposDeData.qualifiedAt = quando;
    camposDeData.qualifiedBy = p.origem;
  }
  if (stage === "venda") {
    camposDeData.saleAt = quando;
    camposDeData.saleValue = p.valor ?? null;
    camposDeData.saleBy = p.origem;
    camposDeData.closedAt = quando;
  }
  await db.trackConversation.update({ where: { id: conversationId }, data: camposDeData });

  const despachos = await enfileirarConversoes({
    db, workspaceId, conversationId, cfg, quando,
    stagesNovos: criados,
    conversa,
  });

  return { criados, despachos: despachos.total, motivoSemDespacho: despachos.motivo };
}

interface ConversaParaDespacho {
  clickId: string | null;
  matchConfidence: string;
  gclid: string | null;
  ctwaClid: string | null;
  source: string;
  firstMessageAt: Date;
}

async function enfileirarConversoes(p: {
  db: Db;
  workspaceId: string;
  conversationId: string;
  cfg: TrackConfig;
  quando: Date;
  stagesNovos: Stage[];
  conversa: ConversaParaDespacho;
}): Promise<{ total: number; motivo?: string }> {
  const { db, workspaceId, cfg, conversa } = p;

  // Atribuição por proximidade é palpite: a conversa chegou perto de um
  // clique sem dono, mas ninguém provou que é a mesma pessoa. Subir isso como
  // conversão treina o algoritmo do cliente contra ele mesmo, então por
  // padrão não sobe. Aparece no painel como "baixa confiança" para o gestor
  // decidir na mão.
  if (conversa.matchConfidence === "low") {
    return { total: 0, motivo: "atribuição de baixa confiança, não enviada automaticamente" };
  }
  if (conversa.matchConfidence === "none") {
    return { total: 0, motivo: "conversa sem atribuição de anúncio" };
  }

  const alvos = await db.trackConversionTarget.findMany({
    where: { workspaceId, enabled: true, stage: { in: p.stagesNovos } },
  });
  if (alvos.length === 0) {
    return { total: 0, motivo: "nenhum destino de conversão configurado para este estágio" };
  }

  let total = 0;
  for (const alvo of alvos) {
    // Sem click id não existe conversão para o Google: ele casa pelo gclid.
    if (alvo.platform === "google" && !conversa.gclid) continue;
    if (alvo.platform === "meta" && !conversa.ctwaClid) continue;

    const evento = await db.trackEvent.findUnique({
      where: { conversationId_stage: { conversationId: p.conversationId, stage: alvo.stage } },
      select: { id: true },
    });
    if (!evento) continue;

    // Conversão enviada minutos depois do clique costuma bater em
    // CLICK_NOT_FOUND: o clique ainda não foi processado do lado do Google.
    // Por isso o envio espera um tempo configurável a partir do clique.
    const liberaEm = new Date(
      Math.max(
        conversa.firstMessageAt.getTime() + cfg.uploadLagHours * 3600_000,
        Date.now(),
      ),
    );

    try {
      await db.trackDispatch.create({
        data: {
          workspaceId,
          eventId: evento.id,
          targetId: alvo.id,
          platform: alvo.platform,
          status: "pending",
          notBeforeAt: liberaEm,
          nextAttemptAt: liberaEm,
        },
      });
      total++;
    } catch (err) {
      // P2002 = já estava na fila. Idempotência funcionando.
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  }

  return { total, motivo: total === 0 ? "nada elegível para envio" : undefined };
}
