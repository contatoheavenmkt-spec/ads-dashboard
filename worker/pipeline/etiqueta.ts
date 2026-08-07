import { criarLog } from "../log";
import { db } from "../prisma";
import { contactKeyFromJid } from "../../src/lib/track/phone";
import { isGroupJid } from "../../src/lib/track/phone";

const log = criarLog("etiqueta");

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Etiquetas do WhatsApp Business.
 *
 * É o coração do produto: o atendente marca a conversa como "Pago" no celular
 * e isso vira conversão no Google Ads. É também o motivo de usarmos Baileys em
 * vez da API oficial, que não expõe etiqueta nenhuma.
 *
 * Dois eventos, com papéis diferentes:
 *
 * - `labels.edit` traz o Label completo (id, name, color, deleted). É a ÚNICA
 *   fonte do nome da etiqueta.
 * - `labels.association` traz só `{ association: { chatId, labelId }, type }`,
 *   sem nome nenhum.
 *
 * Por isso o painel casa etiqueta por `waLabelId` e nunca por nome: o cliente
 * renomear "Pago" para "Pago ✅" não pode quebrar o funil.
 *
 * ARMADILHA: existem dois campos chamados `type` no payload de association,
 * com significados diferentes. O de fora é 'add' | 'remove'; o de dentro
 * (association.type) é 'label_jid' | 'label_message'.
 */

export async function processarEtiqueta(ctx: {
  instanceId: string;
  workspaceId: string;
  evento: "association" | "edit";
  payload: any;
}): Promise<void> {
  if (ctx.evento === "edit") {
    await registrarEtiqueta(ctx.instanceId, ctx.payload);
    return;
  }
  await aplicarAssociacao(ctx.instanceId, ctx.workspaceId, ctx.payload);
}

/** Guarda nome e cor da etiqueta, para o painel poder listar por nome. */
async function registrarEtiqueta(instanceId: string, label: any): Promise<void> {
  const waLabelId = String(label?.id ?? "");
  if (!waLabelId) return;

  const nome = typeof label?.name === "string" && label.name ? label.name : `Etiqueta ${waLabelId}`;

  try {
    await db.whatsappLabel.upsert({
      where: { instanceId_waLabelId: { instanceId, waLabelId } },
      update: {
        name: nome,
        color: typeof label?.color === "number" ? label.color : null,
        deleted: Boolean(label?.deleted),
        lastSeenAt: new Date(),
      },
      create: {
        instanceId,
        waLabelId,
        name: nome,
        color: typeof label?.color === "number" ? label.color : null,
        deleted: Boolean(label?.deleted),
      },
    });
    log.info(`${instanceId}: etiqueta "${nome}" (id ${waLabelId})${label?.deleted ? " apagada" : ""}`);
  } catch (err) {
    log.erro(`${instanceId}: falha ao gravar etiqueta ${waLabelId}: ${(err as Error).message}`);
  }
}

/**
 * Etiqueta colocada ou tirada de uma conversa.
 *
 * Aqui só o FATO é registrado (a lista de etiquetas atuais da conversa). Quem
 * decide se "Pago" significa venda é o cron do Next, lendo as regras do
 * workspace. Essa separação evita duplicar regra de negócio no worker.
 */
async function aplicarAssociacao(
  instanceId: string,
  workspaceId: string,
  payload: any,
): Promise<void> {
  const acao: "add" | "remove" = payload?.type === "remove" ? "remove" : "add";
  const assoc = payload?.association;
  const chatId: string = assoc?.chatId ?? "";
  const labelId = String(assoc?.labelId ?? "");

  if (!chatId || !labelId) return;
  // Etiqueta em grupo não é conversa de lead.
  if (isGroupJid(chatId)) return;

  const contactKey = contactKeyFromJid(chatId);
  if (!contactKey) return;

  // A jornada mais recente daquele contato é a que recebe a etiqueta: o
  // atendente está marcando a conversa que está aberta na tela dele.
  const conversa = await db.trackConversation.findFirst({
    where: { instanceId, contactKey },
    orderBy: { cycle: "desc" },
    select: { id: true, labelsJson: true, stage: true },
  });

  if (!conversa) {
    // Etiqueta numa conversa que o Track nunca viu (contato antigo, anterior
    // à instalação). Não é erro, só não há a que amarrar.
    log.info(`${instanceId}: etiqueta ${labelId} em conversa desconhecida, ignorada`);
    return;
  }

  const atuais = new Set<string>(parseLista(conversa.labelsJson));
  if (acao === "add") atuais.add(labelId);
  else atuais.delete(labelId);

  try {
    await db.trackConversation.update({
      where: { id: conversa.id },
      data: { labelsJson: JSON.stringify([...atuais]) },
    });
    log.info(
      `${instanceId}: etiqueta ${labelId} ${acao === "add" ? "posta em" : "tirada de"} conversa ${conversa.id}`,
    );
  } catch (err) {
    log.erro(`${instanceId}: falha ao atualizar etiquetas: ${(err as Error).message}`);
  }
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
