import { criarLog } from "../log";
import { db } from "../prisma";
import { registrarStage } from "../../src/lib/track/events";
import {
  avaliarConversa,
  foiMarcadaComoPerdida,
  valorDaVenda,
  type MensagemAvaliada,
} from "../../src/lib/track/rules";
import { parseTrackSettings, type TrackConfig } from "../../src/lib/track/settings";
import { formatPhoneDisplay } from "../../src/lib/track/phone";

const log = criarLog("funil");

/**
 * Aplica as regras do workspace numa conversa e registra o que mudou.
 *
 * Chamado depois de cada mensagem e de cada mudança de etiqueta. É barato:
 * a maior parte das chamadas não muda nada e sai cedo, porque o funil só
 * anda para frente.
 */
export async function reavaliar(p: {
  workspaceId: string;
  conversationId: string;
  cfg?: TrackConfig;
  /** A mensagem que acabou de chegar, quando a chamada vem do fluxo dela. */
  mensagem?: MensagemAvaliada;
  quando?: Date;
}): Promise<void> {
  const cfg =
    p.cfg ??
    parseTrackSettings(await db.trackSettings.findUnique({ where: { workspaceId: p.workspaceId } }));

  const conversa = await db.trackConversation.findUnique({
    where: { id: p.conversationId },
    select: {
      id: true, stage: true, inboundCount: true, outboundCount: true,
      labelsJson: true, contactKey: true, contactName: true, leadId: true,
      source: true, campaignId: true, matchConfidence: true,
    },
  });
  if (!conversa) return;

  const labelIds = parseLista(conversa.labelsJson);

  // Perdido é estado, não etapa: não gera conversão e não bloqueia a pessoa
  // de voltar depois por outro anúncio.
  const etiquetaPerdido = foiMarcadaComoPerdida(cfg, labelIds);
  if (etiquetaPerdido && conversa.stage !== "venda" && conversa.stage !== "perdido") {
    await db.trackConversation.update({
      where: { id: conversa.id },
      data: { stage: "perdido", lostAt: p.quando ?? new Date(), closedAt: p.quando ?? new Date() },
    });
    await espelharNoCrm(conversa.leadId, { status: "perdido" });
    log.info(`conversa ${conversa.id} marcada como perdida (etiqueta ${etiquetaPerdido})`);
    return;
  }

  const detectado = avaliarConversa(
    cfg,
    {
      stage: conversa.stage as never,
      inboundCount: conversa.inboundCount,
      outboundCount: conversa.outboundCount,
      labelIds,
      houveOutboundAntesDoUltimoInbound: await houveTrocaDeVerdade(conversa.id),
    },
    p.mensagem,
  );

  if (!detectado) return;

  const resultado = await registrarStage({
    db,
    workspaceId: p.workspaceId,
    conversationId: conversa.id,
    stage: detectado.stage,
    origem: detectado.origem,
    cfg,
    occurredAt: p.quando ?? new Date(),
    valor: detectado.stage === "venda" ? valorDaVenda(cfg, null) : null,
    detalhe: detectado.detalhe,
  });

  if (resultado.criados.length === 0) return;

  log.info(
    `conversa ${conversa.id}: ${detectado.stage} por ${detectado.origem}${detectado.detalhe ? ` (${detectado.detalhe})` : ""}` +
      ` | ${resultado.despachos} envio(s) na fila${resultado.motivoSemDespacho ? ` (${resultado.motivoSemDespacho})` : ""}`,
  );

  await sincronizarCrm(p.workspaceId, conversa, detectado.stage, cfg);
}

/**
 * Espelha a conversa no CRM que o cliente já usa.
 *
 * O Lead continua sendo a entidade do CRM, criada e editada por gente. O
 * Track só preenche e atualiza; nenhuma coluna de Lead foi alterada para
 * isso funcionar.
 */
async function sincronizarCrm(
  workspaceId: string,
  conversa: {
    id: string;
    leadId: string | null;
    contactKey: string;
    contactName: string | null;
    source: string;
    campaignId: string | null;
  },
  stage: string,
  cfg: TrackConfig,
): Promise<void> {
  if (!cfg.createLeadInCrm) return;

  const statusCrm =
    stage === "venda" ? "vendido" : stage === "qualificado" ? "negociando" : "contato";

  if (conversa.leadId) {
    await espelharNoCrm(conversa.leadId, {
      status: statusCrm,
      ...(stage === "venda"
        ? { closedAt: new Date(), saleValue: cfg.defaultSaleValue ?? undefined }
        : {}),
    });
    return;
  }

  try {
    const lead = await db.lead.create({
      data: {
        workspaceId,
        name: conversa.contactName || formatPhoneDisplay(conversa.contactKey),
        phone: conversa.contactKey,
        source: conversa.source === "meta" ? "meta_messaging" : "google",
        campaignId: conversa.campaignId,
        status: statusCrm,
        notes: "Criado automaticamente pelo Track (conversa de WhatsApp rastreada).",
      },
      select: { id: true },
    });
    await db.trackConversation.update({
      where: { id: conversa.id },
      data: { leadId: lead.id },
    });
    log.info(`conversa ${conversa.id} espelhada no CRM como lead ${lead.id}`);
  } catch (err) {
    // O CRM é conveniência: falhar aqui não pode impedir o registro da
    // conversão, que é o que o cliente está pagando para acontecer.
    log.warn(`não consegui espelhar conversa ${conversa.id} no CRM: ${(err as Error).message}`);
  }
}

async function espelharNoCrm(
  leadId: string | null,
  dados: Record<string, unknown>,
): Promise<void> {
  if (!leadId) return;
  try {
    await db.lead.update({ where: { id: leadId }, data: dados });
  } catch (err) {
    log.warn(`não consegui atualizar lead ${leadId}: ${(err as Error).message}`);
  }
}

/**
 * Houve troca de verdade, ou só o cliente falando sozinho?
 *
 * "Respondeu" significa que a conversa engatou. Duas mensagens seguidas do
 * cliente sem ninguém atender não é engajamento, é lead abandonado, e mandar
 * isso pro Google como lead qualificado ensinaria o algoritmo a trazer mais
 * gente que ninguém atende.
 */
async function houveTrocaDeVerdade(conversationId: string): Promise<boolean> {
  const ultimoInbound = await db.trackMessage.findFirst({
    where: { conversationId, direction: "in" },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });
  if (!ultimoInbound) return false;

  const outboundAntes = await db.trackMessage.findFirst({
    where: { conversationId, direction: "out", sentAt: { lt: ultimoInbound.sentAt } },
    select: { id: true },
  });
  return Boolean(outboundAntes);
}

function parseLista(bruto: string | null): string[] {
  if (!bruto) return [];
  try {
    const v = JSON.parse(bruto);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
