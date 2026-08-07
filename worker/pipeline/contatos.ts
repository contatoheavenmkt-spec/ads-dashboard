import { canonicalPhoneKey, isLidJid, phoneFromJid } from "../../src/lib/track/phone";

/**
 * Resolução de identidade do contato, compartilhada entre mensagem e etiqueta.
 *
 * Existe porque conta Business endereça por `@lid` (um id interno do
 * WhatsApp) em vez do telefone, de forma intermitente. Duas partes do worker
 * precisam resolver isso e precisam chegar ao MESMO resultado:
 *
 * - `messages.upsert` traz `key.remoteJidAlt` com o telefone real, então dá
 *   para aprender o mapeamento.
 * - `labels.association` traz apenas `chatId`, que em conta Business vem como
 *   `@lid` e sem nenhuma pista do telefone. É exatamente o evento que decide
 *   se a venda vira conversão, então errar aqui mata o produto em silêncio.
 */

/** Mapa `${instanceId}:${lidJid}` → chave canônica do telefone. */
const lidParaTelefone = new Map<string, string>();

/** Guarda o telefone real assim que ele aparece numa mensagem. */
export function memorizarLid(instanceId: string, lidJid: string, contactKey: string): void {
  if (!lidJid || !contactKey) return;
  lidParaTelefone.set(`${instanceId}:${lidJid}`, contactKey);
}

/** Consulta o que já foi aprendido nesta execução do processo. */
export function telefoneDoLid(instanceId: string, lidJid: string): string | null {
  return lidParaTelefone.get(`${instanceId}:${lidJid}`) ?? null;
}

/**
 * Os dígitos parecem um telefone de verdade?
 *
 * Um `@lid` tem 14 a 16 dígitos e não é telefone nenhum. Sem esta checagem,
 * dígitos de lid entram como se fossem número, e no pior caso um lid que
 * comece com 55 e tenha 13 dígitos colide com a chave canônica de um contato
 * brasileiro real, aplicando a etiqueta na conversa errada.
 */
export function pareceTelefone(digitos: string): boolean {
  if (!/^\d+$/.test(digitos)) return false;
  // E.164 vai de 8 (alguns países) a 15 dígitos, mas com DDI e DDD o piso
  // real aqui é 10. Acima de 13 é lid, não telefone.
  return digitos.length >= 10 && digitos.length <= 13;
}

export interface ContatoResolvido {
  /** Chave de BUSCA, canônica: as duas formas do celular caem na mesma. */
  contactKey: string;
  /**
   * O número como o WhatsApp entregou, com o nono dígito.
   *
   * `contactKey` descarta o nono para 5511987654321 e 551187654321 caírem na
   * mesma conversa, mas discar o resultado disso não funciona. O lead que vai
   * para o CRM precisa deste campo, senão nasce com telefone inexistente e o
   * cliente não consegue ligar de volta.
   */
  contactPhone: string | null;
  lidKey: string | null;
  /** false quando a chave é um lid ainda não traduzido para telefone. */
  ehTelefoneReal: boolean;
}

/**
 * Resolve a identidade a partir do `key` de uma mensagem.
 *
 * `remoteJidAlt` é preenchido pelo Baileys (decode-wa-message) quando o
 * endereçamento é por lid e não é grupo: é a única fonte do telefone real.
 */
export function resolverContatoDaMensagem(
  instanceId: string,
  remoteJid: string,
  remoteJidAlt: string | null,
): ContatoResolvido | null {
  if (!remoteJid) return null;

  if (remoteJidAlt && !isLidJid(remoteJidAlt)) {
    const discavel = phoneFromJid(remoteJidAlt);
    const real = canonicalPhoneKey(discavel, false);
    if (real && pareceTelefone(real)) {
      if (isLidJid(remoteJid)) memorizarLid(instanceId, remoteJid, real);
      return {
        contactKey: real,
        contactPhone: discavel,
        lidKey: isLidJid(remoteJid) ? remoteJid : null,
        ehTelefoneReal: true,
      };
    }
  }

  if (isLidJid(remoteJid)) {
    const memorizado = telefoneDoLid(instanceId, remoteJid);
    if (memorizado) {
      return { contactKey: memorizado, contactPhone: null, lidKey: remoteJid, ehTelefoneReal: true };
    }
    // Sem o telefone ainda: usa o próprio lid como chave provisória e
    // consolida quando o número aparecer.
    const digitos = remoteJid.replace(/@.*$/, "").replace(/\D/g, "");
    return digitos ? { contactKey: digitos, contactPhone: null, lidKey: remoteJid, ehTelefoneReal: false } : null;
  }

  const discavelDireto = phoneFromJid(remoteJid);
  const direto = canonicalPhoneKey(discavelDireto, false);
  return direto
    ? { contactKey: direto, contactPhone: discavelDireto, lidKey: null, ehTelefoneReal: pareceTelefone(direto) }
    : null;
}

/**
 * Chaves candidatas para achar a conversa a partir de um `chatId` de etiqueta.
 *
 * A etiqueta não traz `remoteJidAlt`, então a busca precisa cobrir os dois
 * jeitos que a conversa pode ter sido gravada: pelo telefone real (quando a
 * mensagem trouxe o alt) ou pelos dígitos do lid (quando não trouxe).
 * Devolve também o próprio jid, para casar pela coluna `lidKey`.
 */
export function candidatosParaEtiqueta(
  instanceId: string,
  chatId: string,
): { chaves: string[]; lidJid: string | null } {
  if (!chatId) return { chaves: [], lidJid: null };

  if (isLidJid(chatId)) {
    const digitos = chatId.replace(/@.*$/, "").replace(/\D/g, "");
    const memorizado = telefoneDoLid(instanceId, chatId);
    const chaves = [memorizado, digitos].filter((c): c is string => Boolean(c));
    return { chaves: [...new Set(chaves)], lidJid: chatId };
  }

  const telefone = canonicalPhoneKey(phoneFromJid(chatId), false);
  return { chaves: telefone ? [telefone] : [], lidJid: null };
}
