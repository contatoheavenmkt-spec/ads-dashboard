import { criarLog } from "../log";
import { db } from "../prisma";
import { isGroupJid } from "../../src/lib/track/phone";
import { candidatosParaEtiqueta } from "./contatos";
import { reavaliar } from "./funil";
import { emSerie } from "./serial";

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

  /*
   * ATENÇÃO, este é o ponto mais delicado do worker.
   *
   * O `chatId` de labels.association é o índice cru do app state
   * (chat-utils.js monta a partir de syncAction.index), e em conta Business
   * ele vem como `@lid`. Só que a conversa foi gravada com o TELEFONE real,
   * porque a mensagem trouxe `remoteJidAlt`. Procurar pelo lid como se fosse
   * telefone não acha nada, e conta Business é justamente a única que tem
   * etiqueta: seria o produto inteiro falhando calado no caso principal.
   *
   * Por isso a busca cobre três caminhos: o telefone aprendido para aquele
   * lid, os dígitos do lid (quando o telefone nunca apareceu) e a coluna
   * `lidKey`, que existe exatamente para esta reconciliação.
   */
  const { chaves, lidJid } = candidatosParaEtiqueta(instanceId, chatId);
  if (chaves.length === 0 && !lidJid) return;

  const condicoes: Array<Record<string, unknown>> = [];
  if (chaves.length > 0) condicoes.push({ contactKey: { in: chaves } });
  if (lidJid) condicoes.push({ lidKey: lidJid });

  const conversa = await db.trackConversation.findFirst({
    // A jornada mais recente daquele contato é a que recebe a etiqueta: o
    // atendente está marcando a conversa que está aberta na tela dele.
    where: { instanceId, OR: condicoes },
    orderBy: { cycle: "desc" },
    select: { id: true, labelsJson: true, stage: true },
  });

  if (!conversa) {
    // Pode ser contato anterior à instalação do Track, mas também pode ser
    // falha de resolução de identidade. Fica em warn, e não info, porque uma
    // etiqueta de venda perdida aqui é dinheiro que não volta pra campanha.
    log.warn(
      `${instanceId}: etiqueta ${labelId} num chat que não casou com conversa nenhuma ` +
        `(chaves testadas: ${chaves.length}, lid: ${lidJid ? "sim" : "não"})`,
    );
    return;
  }

  /*
   * A lista de etiquetas é lida, alterada e gravada de volta. O app state do
   * WhatsApp entrega associações em rajada depois de uma sincronização, e sem
   * serializar por conversa a segunda gravação sobrescreve a primeira. Quando
   * a perdida é a "Pago", a venda nunca vira conversão e ninguém percebe,
   * porque a etiqueta continua visível no celular do atendente.
   */
  const gravou = await emSerie(`labels:${conversa.id}`, async () => {
    // Relê DENTRO da seção serial: o estado pode ter mudado na espera.
    const atual = await db.trackConversation.findUnique({
      where: { id: conversa.id },
      select: { labelsJson: true },
    });
    const atuais = new Set<string>(parseLista(atual?.labelsJson ?? null));
    if (acao === "add") atuais.add(labelId);
    else atuais.delete(labelId);

    await db.trackConversation.update({
      where: { id: conversa.id },
      data: { labelsJson: JSON.stringify([...atuais]) },
    });
    return true;
  }).catch((err: Error) => {
    log.erro(`${instanceId}: falha ao atualizar etiquetas: ${err.message}`);
    return false;
  });

  if (!gravou) return;
  log.info(
    `${instanceId}: etiqueta ${labelId} ${acao === "add" ? "posta em" : "tirada de"} conversa ${conversa.id}`,
  );

  // Aqui a etiqueta "Pago" vira venda: é o momento em que o produto entrega o
  // que promete. Tirar a etiqueta atualiza a lista, mas não desfaz evento já
  // registrado, porque conversão enviada ao Google não se "des-envia".
  try {
    await reavaliar({ workspaceId, conversationId: conversa.id });
  } catch (err) {
    log.erro(`falha ao reavaliar funil após etiqueta: ${(err as Error).message}`);
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
