import { criarLog, tel } from "../log";
import { db } from "../prisma";
import { extractCode } from "../../src/lib/track/code";
import { contactKeyFromJid, isGroupJid, isLidJid, phoneFromJid } from "../../src/lib/track/phone";
import {
  ehAntigaDemais,
  ehMensagemDeVerdade,
  lerConteudo,
  lerTimestamp,
} from "../../src/lib/track/mensagem";
import { parseTrackSettings } from "../../src/lib/track/settings";
import { reavaliar } from "./funil";

const log = criarLog("mensagem");

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Entrada de mensagem do WhatsApp.
 *
 * O worker grava FATOS: existe conversa, chegou mensagem, veio deste anúncio.
 * Quem interpreta esses fatos como funil e dispara conversão é o cron do Next.
 *
 * Dois pontos que decidem se o produto funciona:
 *
 * 1. `append` é processado igual a `notify`. Mensagem que chegou com o socket
 *    fora do ar volta como append (messages-recv.js:1073), e é justamente aí
 *    que não se pode perder lead.
 * 2. O contato precisa cair sempre na mesma conversa, apesar do @lid das
 *    contas Business. Ver `resolverContato`.
 */

/**
 * Mapa @lid → telefone real, por instância.
 *
 * Conta Business manda ora o @lid (id interno), ora o número real, de forma
 * intermitente. Sem um canônico estável o mesmo cliente vira duas conversas e
 * o funil conta o lead duas vezes. Assim que o número real aparece uma vez,
 * memorizamos e passamos a resolver sempre para ele.
 */
const mapaLidParaNumero = new Map<string, string>();

function resolverContato(
  instanceId: string,
  key: any,
): { contactKey: string; lidKey: string | null } | null {
  const remoteJid: string = key?.remoteJid ?? "";
  if (!remoteJid || isGroupJid(remoteJid)) return null;

  // remoteJidAlt existe no tipo estendido WAMessageKey (Types/Message.d.ts) e
  // é preenchido em decode-wa-message.js quando não é grupo. É ele que traz o
  // telefone de verdade quando o remoteJid veio como @lid.
  const alt: string = key?.remoteJidAlt ?? "";

  const chaveMapa = `${instanceId}:${remoteJid}`;

  if (alt && !isLidJid(alt)) {
    const real = contactKeyFromJid(alt);
    if (real) {
      if (isLidJid(remoteJid)) mapaLidParaNumero.set(chaveMapa, real);
      return { contactKey: real, lidKey: isLidJid(remoteJid) ? remoteJid : null };
    }
  }

  if (isLidJid(remoteJid)) {
    const memorizado = mapaLidParaNumero.get(chaveMapa);
    if (memorizado) return { contactKey: memorizado, lidKey: remoteJid };
    // Ainda não sabemos o número real: usa o próprio lid como chave e
    // consolida depois, quando o número aparecer.
    const lidLimpo = remoteJid.replace(/@.*$/, "").replace(/\D/g, "");
    return lidLimpo ? { contactKey: lidLimpo, lidKey: remoteJid } : null;
  }

  const direto = contactKeyFromJid(remoteJid);
  return direto ? { contactKey: direto, lidKey: null } : null;
}

export async function processarMensagens(ctx: {
  instanceId: string;
  workspaceId: string;
  mensagens: any[];
  tipo: string;
}): Promise<void> {
  for (const msg of ctx.mensagens) {
    try {
      await processarUma(ctx.instanceId, ctx.workspaceId, msg, ctx.tipo);
    } catch (err) {
      // Uma mensagem problemática não pode derrubar o lote inteiro.
      log.erro(`${ctx.instanceId}: falha ao processar mensagem: ${(err as Error).message}`);
    }
  }
}

async function processarUma(
  instanceId: string,
  workspaceId: string,
  msg: any,
  tipoUpsert: string,
): Promise<void> {
  const key = msg?.key;
  if (!key?.remoteJid) return;

  // Reação, voto em enquete e mensagem de protocolo chegam pelo mesmo evento.
  // Sem este filtro um emoji de reação contaria como resposta do lead e
  // empurraria a conversa para "respondeu" sozinho. Também barra falha de
  // decriptação, que chega sem conteúdo.
  if (!ehMensagemDeVerdade(msg)) return;

  const contato = resolverContato(instanceId, key);
  if (!contato) return;

  const quando = lerTimestamp(msg?.messageTimestamp);
  // Sincronização pode arrastar histórico velho: transformar conversa de
  // meses atrás em "lead novo" estragaria o funil do cliente.
  if (ehAntigaDemais(quando)) return;

  const conteudo = lerConteudo(msg?.message);
  const daAgencia = Boolean(key.fromMe);
  const waMessageId: string | null = key.id ?? null;

  const cfg = parseTrackSettings(
    await db.trackSettings.findUnique({ where: { workspaceId } }),
  );

  const conversa = await acharOuCriarConversa({
    instanceId,
    workspaceId,
    contactKey: contato.contactKey,
    lidKey: contato.lidKey,
    nome: typeof msg?.pushName === "string" ? msg.pushName : null,
    quando,
    conteudo,
    daAgencia,
    journeyResetDays: cfg.journeyResetDays,
  });
  if (!conversa) return;

  // Dedupe pelo unique [conversationId, waMessageId]: o mesmo id pode voltar
  // quando notify e append se sobrepõem numa reconexão.
  if (waMessageId) {
    const jaTem = await db.trackMessage.findUnique({
      where: { conversationId_waMessageId: { conversationId: conversa.id, waMessageId } },
      select: { id: true },
    });
    if (jaTem) return;
  }

  await db.trackMessage.create({
    data: {
      conversationId: conversa.id,
      waMessageId,
      direction: daAgencia ? "out" : "in",
      type: conteudo.tipo,
      // LGPD: o workspace pode desligar o armazenamento do conteúdo. Sem
      // texto o funil ainda anda por etiqueta, só perde a frase-gatilho.
      text: cfg.storeMessageText ? conteudo.texto?.slice(0, 1000) ?? null : null,
      isAdReply: Boolean(conteudo.ctwaClid || conteudo.adId),
      sentAt: quando,
    },
  });

  await db.trackConversation.update({
    where: { id: conversa.id },
    data: {
      lastMessageAt: quando,
      ...(daAgencia
        ? { outboundCount: { increment: 1 } }
        : { inboundCount: { increment: 1 } }),
      ...(conversa.contactName === null && typeof msg?.pushName === "string" && msg.pushName
        ? { contactName: String(msg.pushName).slice(0, 120) }
        : {}),
    },
  });

  log.info(
    `${instanceId}: ${daAgencia ? "saiu" : "entrou"} msg de ${tel(contato.contactKey)} (${tipoUpsert}) conversa ${conversa.id}`,
  );

  // A frase-gatilho ("parabéns pela sua compra") é avaliada aqui, junto com a
  // contagem que define "respondeu". Falhar nisso não pode desfazer a gravação
  // da mensagem, que já é o dado bruto correto.
  try {
    await reavaliar({
      workspaceId,
      conversationId: conversa.id,
      cfg,
      mensagem: { texto: conteudo.texto, direcao: daAgencia ? "out" : "in" },
      quando,
    });
  } catch (err) {
    log.erro(`falha ao reavaliar funil da conversa ${conversa.id}: ${(err as Error).message}`);
  }
}

interface ConversaResumo {
  id: string;
  contactName: string | null;
  clickId: string | null;
  matchType: string;
}

async function acharOuCriarConversa(p: {
  instanceId: string;
  workspaceId: string;
  contactKey: string;
  lidKey: string | null;
  nome: string | null;
  quando: Date;
  conteudo: ReturnType<typeof lerConteudo>;
  daAgencia: boolean;
  journeyResetDays: number;
}): Promise<ConversaResumo | null> {
  const existente = await db.trackConversation.findFirst({
    where: { instanceId: p.instanceId, contactKey: p.contactKey },
    orderBy: { cycle: "desc" },
    select: {
      id: true, cycle: true, contactName: true, clickId: true,
      matchType: true, stage: true, lastMessageAt: true,
    },
  });

  if (existente) {
    // A jornada continua, a não ser que já tenha terminado em venda ou esteja
    // parada há muito tempo. Nesse caso quem volta é lead novo, com clique
    // novo: é o que faz o mesmo cliente poder ser atribuído a duas campanhas
    // diferentes ao longo do ano.
    const paradaHaMuito =
      Date.now() - existente.lastMessageAt.getTime() > p.journeyResetDays * 24 * 60 * 60 * 1000;
    const jaFechou = existente.stage === "venda" || existente.stage === "perdido";

    if (!paradaHaMuito && !jaFechou) return existente;

    // Mensagem que sai da agência não abre jornada nova: seria o atendente
    // reativando contato, não um lead novo do anúncio.
    if (p.daAgencia) return existente;

    return criar({ ...p, cycle: existente.cycle + 1 });
  }

  // Mensagem da agência para contato desconhecido não cria jornada: o produto
  // mede lead que chega, não prospecção ativa.
  if (p.daAgencia) return null;

  return criar({ ...p, cycle: 1 });
}

async function criar(p: {
  instanceId: string;
  workspaceId: string;
  contactKey: string;
  lidKey: string | null;
  nome: string | null;
  quando: Date;
  conteudo: ReturnType<typeof lerConteudo>;
  cycle: number;
}): Promise<ConversaResumo | null> {
  // Atribuição, em ordem de confiança:
  // 1. Código na mensagem (nosso link rastreável, Google)
  // 2. ctwaClid dentro da própria mensagem (anúncio do Meta)
  // A atribuição por proximidade é palpite e roda depois, no cron, para não
  // segurar o processamento da mensagem.
  const codigo = extractCode(p.conteudo.texto);
  let clickId: string | null = null;
  let matchType = "none";
  let matchConfidence = "none";
  let source = "organic";
  let gclid: string | null = null;
  let campaignId: string | null = null;

  if (codigo) {
    const clique = await db.trackClick.findUnique({
      where: { workspaceId_code: { workspaceId: p.workspaceId, code: codigo } },
      select: { id: true, gclid: true, campaignId: true, matchedAt: true },
    });
    if (clique) {
      clickId = clique.id;
      matchType = "code";
      matchConfidence = "high";
      source = "google";
      gclid = clique.gclid;
      campaignId = clique.campaignId;
      if (!clique.matchedAt) {
        await db.trackClick.update({ where: { id: clique.id }, data: { matchedAt: p.quando } });
      }
    } else {
      log.warn(`código ${codigo} não bate com clique nenhum deste workspace`);
    }
  }

  if (!clickId && p.conteudo.ctwaClid) {
    matchType = "ctwa";
    matchConfidence = "high";
    source = "meta";
  }

  try {
    const nova = await db.trackConversation.create({
      data: {
        workspaceId: p.workspaceId,
        instanceId: p.instanceId,
        contactKey: p.contactKey,
        lidKey: p.lidKey,
        cycle: p.cycle,
        contactName: p.nome?.slice(0, 120) ?? null,
        clickId,
        matchType,
        matchConfidence,
        source,
        gclid,
        ctwaClid: p.conteudo.ctwaClid,
        campaignId,
        adId: p.conteudo.adId,
        stage: "lead",
        firstMessageAt: p.quando,
        lastMessageAt: p.quando,
      },
      select: { id: true, contactName: true, clickId: true, matchType: true },
    });
    log.info(
      `nova conversa ${nova.id} de ${tel(p.contactKey)} atribuída por ${matchType}${gclid ? " (com gclid)" : ""}`,
    );
    return nova;
  } catch (err) {
    // Corrida entre duas mensagens do mesmo contato no mesmo instante: o
    // unique [instanceId, contactKey, cycle] barra a segunda, e aí basta ler.
    if ((err as { code?: string }).code === "P2002") {
      return db.trackConversation.findFirst({
        where: { instanceId: p.instanceId, contactKey: p.contactKey },
        orderBy: { cycle: "desc" },
        select: { id: true, contactName: true, clickId: true, matchType: true },
      });
    }
    throw err;
  }
}
