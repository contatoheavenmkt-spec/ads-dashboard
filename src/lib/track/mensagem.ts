/**
 * Leitura do conteúdo de uma mensagem do WhatsApp.
 *
 * Fica separado do worker de propósito: é lógica pura, cheia de caminhos
 * aninhados que mudam entre versões da lib, e é onde um erro passa
 * despercebido (mensagem sem texto extraído = código de rastreio perdido =
 * venda que nunca volta para a campanha).
 *
 * Os caminhos abaixo foram conferidos no WAProto do Baileys 7.0.0-rc.9.
 * Sem dependência de Node nem de Next.
 */

export type TipoMensagem = "text" | "audio" | "image" | "video" | "document" | "sticker" | "other";

export interface ConteudoMensagem {
  texto: string | null;
  tipo: TipoMensagem;
  /** Veio de clique em anúncio do Meta (Click to WhatsApp). */
  ctwaClid: string | null;
  /** Id do anúncio de origem, quando a mensagem nasce de um anúncio. */
  adId: string | null;
  adUrl: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Mensagem pode vir embrulhada em camadas (efêmera, view once, edição).
 * Sem desembrulhar, uma mensagem efêmera parece vazia e o código nela se perde.
 */
function desembrulhar(message: any): any {
  let m = message;
  for (let i = 0; i < 5 && m; i++) {
    const proximo =
      m.ephemeralMessage?.message ??
      m.viewOnceMessage?.message ??
      m.viewOnceMessageV2?.message ??
      m.viewOnceMessageV2Extension?.message ??
      m.documentWithCaptionMessage?.message ??
      m.editedMessage?.message ??
      // deviceSentMessage é o que chega quando a pessoa manda de OUTRO
      // aparelho pareado. O normalizeMessageContent da lib não desembrulha
      // este caso, e sem tratar aqui a mensagem parece vazia: um lead que
      // digitou do desktop entraria sem o código de rastreio.
      m.deviceSentMessage?.message ??
      null;
    if (!proximo) break;
    m = proximo;
  }
  return m;
}

/**
 * A mensagem representa fala de gente?
 *
 * Reação, edição de protocolo e voto em enquete chegam pelo mesmo evento de
 * mensagem. Sem este filtro, um emoji de reação contaria como resposta do
 * lead e empurraria a conversa para o estágio "respondeu" sozinho.
 *
 * Espelha o `isRealMessage` da lib (Utils/process-message.js), reescrito aqui
 * para manter este módulo puro e testável.
 */
export function ehMensagemDeVerdade(msg: any): boolean {
  const conteudo = msg?.message;
  if (!conteudo) {
    // Sem conteúdo é falha de decriptação (messageStubType CIPHERTEXT) ou
    // notificação de sistema. Não é mensagem.
    return false;
  }
  const m = desembrulhar(conteudo);
  if (!m) return false;
  if (m.protocolMessage || m.reactionMessage || m.pollUpdateMessage) return false;
  // Chave de distribuição de sessão do Signal, puro protocolo.
  if (Object.keys(m).length === 1 && m.senderKeyDistributionMessage) return false;
  return true;
}

function primeiroTexto(m: any): { texto: string | null; tipo: TipoMensagem } {
  if (!m) return { texto: null, tipo: "other" };

  if (typeof m.conversation === "string" && m.conversation) {
    return { texto: m.conversation, tipo: "text" };
  }
  if (typeof m.extendedTextMessage?.text === "string" && m.extendedTextMessage.text) {
    return { texto: m.extendedTextMessage.text, tipo: "text" };
  }
  // Legenda de mídia conta como texto: é comum a pessoa mandar print do
  // anúncio com a mensagem pronta junto, e o código está na legenda.
  if (typeof m.imageMessage?.caption === "string" && m.imageMessage.caption) {
    return { texto: m.imageMessage.caption, tipo: "image" };
  }
  if (typeof m.videoMessage?.caption === "string" && m.videoMessage.caption) {
    return { texto: m.videoMessage.caption, tipo: "video" };
  }
  if (typeof m.documentMessage?.caption === "string" && m.documentMessage.caption) {
    return { texto: m.documentMessage.caption, tipo: "document" };
  }
  if (typeof m.buttonsResponseMessage?.selectedDisplayText === "string") {
    return { texto: m.buttonsResponseMessage.selectedDisplayText, tipo: "text" };
  }
  if (typeof m.listResponseMessage?.title === "string") {
    return { texto: m.listResponseMessage.title, tipo: "text" };
  }
  if (typeof m.templateButtonReplyMessage?.selectedDisplayText === "string") {
    return { texto: m.templateButtonReplyMessage.selectedDisplayText, tipo: "text" };
  }

  if (m.imageMessage) return { texto: null, tipo: "image" };
  if (m.videoMessage) return { texto: null, tipo: "video" };
  if (m.audioMessage) return { texto: null, tipo: "audio" };
  if (m.documentMessage) return { texto: null, tipo: "document" };
  if (m.stickerMessage) return { texto: null, tipo: "sticker" };

  return { texto: null, tipo: "other" };
}

/**
 * Atribuição de anúncio do Meta, que chega dentro da própria mensagem.
 *
 * Por isso o Meta não precisa de link rastreável: quem clicou num anúncio
 * Click to WhatsApp já traz o ctwaClid junto da primeira mensagem.
 * Caminho conferido em WAProto: ContextInfo.ExternalAdReplyInfo.
 */
function atribuicaoDeAnuncio(m: any): Pick<ConteudoMensagem, "ctwaClid" | "adId" | "adUrl"> {
  // contextInfo é propriedade de cada TIPO de conteúdo, não da raiz da
  // mensagem: a raiz só tem messageContextInfo, que é outro tipo e não carrega
  // externalAdReply. Por isso a busca é por tipo, um a um.
  const candidatos = [
    m?.extendedTextMessage?.contextInfo,
    m?.imageMessage?.contextInfo,
    m?.videoMessage?.contextInfo,
    m?.documentMessage?.contextInfo,
    m?.audioMessage?.contextInfo,
    m?.stickerMessage?.contextInfo,
    m?.templateMessage?.hydratedTemplate?.contextInfo,
    m?.buttonsMessage?.contextInfo,
    m?.interactiveMessage?.contextInfo,
  ];

  for (const ctx of candidatos) {
    const ad = ctx?.externalAdReply;
    if (!ad) continue;
    if (ad.ctwaClid || ad.sourceId || ad.sourceUrl) {
      return {
        ctwaClid: ad.ctwaClid ?? null,
        adId: ad.sourceId ?? null,
        adUrl: ad.sourceUrl ?? null,
      };
    }
  }
  return { ctwaClid: null, adId: null, adUrl: null };
}

export function lerConteudo(message: unknown): ConteudoMensagem {
  const m = desembrulhar(message);
  const { texto, tipo } = primeiroTexto(m);
  const anuncio = atribuicaoDeAnuncio(m);
  return { texto, tipo, ...anuncio };
}

/**
 * Timestamp da mensagem em Date. O campo vem em segundos e às vezes como
 * Long do protobuf, não como number.
 */
export function lerTimestamp(messageTimestamp: unknown): Date {
  if (typeof messageTimestamp === "number") return new Date(messageTimestamp * 1000);
  if (typeof messageTimestamp === "string") {
    const n = Number(messageTimestamp);
    if (Number.isFinite(n)) return new Date(n * 1000);
  }
  // Long do protobuf: { low, high, unsigned } com toNumber()
  const obj = messageTimestamp as { toNumber?: () => number; low?: number };
  if (typeof obj?.toNumber === "function") return new Date(obj.toNumber() * 1000);
  if (typeof obj?.low === "number") return new Date(obj.low * 1000);
  return new Date();
}

/**
 * Mensagem antiga demais para ser tratada como nova.
 *
 * O `append` traz mensagens que chegaram com o worker fora do ar, e isso é
 * desejado. Mas uma sincronização pode arrastar histórico muito velho, e
 * transformar conversa de meses atrás em "lead novo" estragaria o funil.
 */
export function ehAntigaDemais(quando: Date, limiteDias = 7): boolean {
  const idadeMs = Date.now() - quando.getTime();
  return idadeMs > limiteDias * 24 * 60 * 60 * 1000;
}
