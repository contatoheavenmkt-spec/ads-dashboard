import { criarLog, tel } from "../log";
import { db } from "../prisma";
import { extractCode } from "../../src/lib/track/code";
import { isGroupJid } from "../../src/lib/track/phone";
import { resolverContatoDaMensagem } from "./contatos";
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
 * Resolve quem é o contato. A implementação vive em ./contatos porque o
 * handler de etiqueta precisa chegar exatamente ao mesmo resultado: se os
 * dois discordarem, a etiqueta de venda não acha a conversa.
 */
function resolverContato(instanceId: string, key: any) {
  const remoteJid: string = key?.remoteJid ?? "";
  if (!remoteJid || isGroupJid(remoteJid)) return null;
  return resolverContatoDaMensagem(instanceId, remoteJid, key?.remoteJidAlt ?? null);
}

/**
 * Erro de banco vale nova tentativa; erro de dado, não.
 *
 * A distinção importa porque a PRIMEIRA mensagem é a que carrega o código de
 * rastreio: perdê-la por um soluço de rede de dois segundos significa que o
 * cliente pagou o clique no Google e a venda nunca vai voltar para a campanha.
 * Já uma mensagem malformada vai falhar igual nas dez tentativas seguintes.
 */
function valeTentarDeNovo(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  const codigo = e?.code ?? "";
  // P1001/P1002/P1008/P1017 = banco inalcançável, timeout ou conexão fechada.
  if (["P1001", "P1002", "P1008", "P1017"].includes(codigo)) return true;
  const msg = (e?.message ?? "").toLowerCase();
  return (
    msg.includes("connection") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("terminating connection") ||
    msg.includes("too many clients")
  );
}

const ESPERAS_MS = [500, 2000, 5000];

export async function processarMensagens(ctx: {
  instanceId: string;
  workspaceId: string;
  mensagens: any[];
  tipo: string;
}): Promise<void> {
  for (const msg of ctx.mensagens) {
    let ultimoErro: unknown = null;

    for (let tentativa = 0; tentativa <= ESPERAS_MS.length; tentativa++) {
      try {
        await processarUma(ctx.instanceId, ctx.workspaceId, msg, ctx.tipo);
        ultimoErro = null;
        break;
      } catch (err) {
        ultimoErro = err;
        if (!valeTentarDeNovo(err) || tentativa === ESPERAS_MS.length) break;
        const espera = ESPERAS_MS[tentativa];
        log.warn(
          `${ctx.instanceId}: banco indisponível, tentando de novo em ${espera}ms ` +
            `(tentativa ${tentativa + 1}/${ESPERAS_MS.length})`,
        );
        await new Promise((r) => setTimeout(r, espera));
      }
    }

    if (ultimoErro) {
      // Uma mensagem problemática não pode derrubar o lote inteiro, mas
      // perder lead é grave o bastante para sair como erro no log.
      log.erro(
        `${ctx.instanceId}: LEAD PERDIDO, não consegui processar a mensagem: ${(ultimoErro as Error).message}`,
      );
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

  // A atribuição do Meta pode chegar DEPOIS da primeira mensagem (o
  // externalAdReply vem na mensagem que o anúncio gerou, que nem sempre é a
  // primeira a ser processada). Conversa sem atribuição absorve o ctwa_clid
  // que aparecer: sem isso, um clique pago viraria conversa "orgânica".
  if (!daAgencia && conteudo.ctwaClid) {
    await db.trackConversation.updateMany({
      where: {
        instanceId,
        contactKey: contato.contactKey,
        matchType: "none",
        ctwaClid: null,
      },
      data: {
        ctwaClid: conteudo.ctwaClid,
        adId: conteudo.adId,
        matchType: "ctwa",
        matchConfidence: "high",
        source: "meta",
      },
    });
  }

  const conversa = await acharOuCriarConversa({
    instanceId,
    workspaceId,
    contactKey: contato.contactKey,
    contactPhone: contato.contactPhone,
    lidKey: contato.lidKey,
    nome: typeof msg?.pushName === "string" ? msg.pushName : null,
    quando,
    conteudo,
    daAgencia,
    journeyResetDays: cfg.journeyResetDays,
    ehTelefoneReal: contato.ehTelefoneReal,
  });
  if (!conversa) return;

  // Dedupe pelo unique [conversationId, waMessageId]: o mesmo id pode voltar
  // quando notify e append se sobrepõem numa reconexão.
  if (waMessageId) {
    const jaTem = await db.trackMessage.findUnique({
      where: { conversationId_waMessageId: { conversationId: conversa.id, waMessageId } },
      select: { id: true },
    });
    if (jaTem) {
      /*
       * A mensagem já está gravada, mas isso NÃO garante que o funil rodou:
       * se o processo morreu entre a gravação e a reavaliação, o retry cai
       * aqui e a frase "venda realizada" daquela mensagem nunca dispararia.
       * Reavaliar é idempotente (o funil só anda pra frente), então o custo
       * de repetir é zero e o de pular é uma venda perdida.
       */
      await reavaliar({
        workspaceId,
        conversationId: conversa.id,
        cfg,
        mensagem: { texto: conteudo.texto, direcao: daAgencia ? "out" : "in" },
        quando,
      }).catch((e) => log.erro(`reavaliação no dedupe falhou: ${e.message}`));
      return;
    }
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
  contactPhone: string | null;
  lidKey: string | null;
  nome: string | null;
  quando: Date;
  conteudo: ReturnType<typeof lerConteudo>;
  daAgencia: boolean;
  journeyResetDays: number;
  ehTelefoneReal?: boolean;
}): Promise<ConversaResumo | null> {
  /*
   * Consolidação do @lid.
   *
   * Quando a primeira mensagem chega sem `remoteJidAlt`, a conversa nasce com
   * os dígitos do lid como chave. Assim que o telefone real aparece, uma
   * segunda conversa nasceria para a MESMA pessoa: a atribuição (o gclid)
   * ficaria numa e a etiqueta cairia na outra, e a venda nunca subiria.
   *
   * Aqui a conversa provisória é promovida para a chave definitiva.
   */
  if (p.lidKey && p.ehTelefoneReal) {
    const provisoria = await db.trackConversation.findFirst({
      where: {
        instanceId: p.instanceId,
        lidKey: p.lidKey,
        contactKey: { not: p.contactKey },
      },
      orderBy: { cycle: "desc" },
      select: { id: true, contactKey: true, cycle: true },
    });

    if (provisoria) {
      const jaExisteDefinitiva = await db.trackConversation.findUnique({
        where: {
          instanceId_contactKey_cycle: {
            instanceId: p.instanceId,
            contactKey: p.contactKey,
            cycle: provisoria.cycle,
          },
        },
        select: { id: true },
      });

      if (!jaExisteDefinitiva) {
        await db.trackConversation.update({
          where: { id: provisoria.id },
          data: { contactKey: p.contactKey, contactPhone: p.contactPhone },
        });
        log.info(
          `conversa ${provisoria.id} promovida do lid provisório para o telefone real ${tel(p.contactKey)}`,
        );
      } else {
        // Já existem as duas. Consolidar de verdade exigiria mover mensagens e
        // eventos, o que é arriscado no meio do fluxo: fica registrado para o
        // painel poder mostrar e alguém decidir.
        log.warn(
          `contato ${tel(p.contactKey)} tem conversa duplicada (lid ${provisoria.id} e telefone ${jaExisteDefinitiva.id})`,
        );
      }
    }
  }

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
  contactPhone: string | null;
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
  let wbraid: string | null = null;
  let gbraid: string | null = null;
  let campaignId: string | null = null;

  if (codigo) {
    const clique = await db.trackClick.findUnique({
      where: { workspaceId_code: { workspaceId: p.workspaceId, code: codigo } },
      select: {
        id: true, gclid: true, wbraid: true, gbraid: true,
        fbclid: true, ctwaClid: true, campaignId: true, matchedAt: true,
      },
    });
    if (clique?.matchedAt) {
      /*
       * O clique já foi consumido por outra conversa.
       *
       * Acontece quando alguém encaminha a mensagem pronta para um conhecido,
       * ou quando a mesma pessoa reabre a jornada depois do prazo de reset com
       * o texto antigo ainda na tela. Reaproveitar o clique mandaria DUAS
       * conversões com o mesmo gclid: com a ação configurada em "contar
       * todas", o CPA aparente cai pela metade e o Smart Bidding sobe o lance
       * numa campanha que na verdade não melhorou.
       *
       * A conversa nasce sem atribuição automática e aparece no painel para o
       * gestor decidir, que é o erro mais barato dos dois.
       */
      log.warn(
        `código ${codigo} já tinha sido usado em ${clique.matchedAt.toISOString()}; ` +
          `a nova conversa fica sem atribuição automática`,
      );
    } else if (clique) {
      clickId = clique.id;
      matchType = "code";
      matchConfidence = "high";
      // A origem sai dos IDs que o clique realmente carrega, não de um
      // "google" fixo: clique casado por código mas vindo de anúncio do Meta
      // (fbclid) ou sem id nenhum (só utm) apareceria como Google no painel
      // e confundiria a leitura do gestor.
      source = clique.gclid || clique.wbraid || clique.gbraid ? "google"
        : clique.fbclid || clique.ctwaClid ? "meta"
        : "outro";
      gclid = clique.gclid;
      // wbraid e gbraid vêm no lugar do gclid quando o consentimento limita o
      // identificador (iOS, PMax, YouTube). Sem copiar os três, a venda dessas
      // campanhas nunca chega ao Google.
      wbraid = clique.wbraid;
      gbraid = clique.gbraid;
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
        contactPhone: p.contactPhone,
        lidKey: p.lidKey,
        cycle: p.cycle,
        contactName: p.nome?.slice(0, 120) ?? null,
        clickId,
        matchType,
        matchConfidence,
        source,
        gclid,
        wbraid,
        gbraid,
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
