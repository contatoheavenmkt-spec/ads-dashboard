/**
 * Normalização de telefone para o Track.
 *
 * Existe por um motivo específico: o mesmo contato precisa cair sempre na
 * mesma linha de TrackConversation. Duas coisas atrapalham isso no Brasil:
 *
 * 1. O nono dígito. Um celular pode chegar como 5511987654321 (13 dígitos) ou,
 *    em registros antigos, 551187654321 (12). São a mesma pessoa.
 * 2. O @lid das contas Business, que é um id interno do WhatsApp e não um
 *    telefone. Isso é resolvido no worker (mapa lid → número real), não aqui.
 *
 * Sem dependência de Node nem de Next: o worker importa por caminho relativo.
 */

/**
 * Só dígitos, com o 55 na frente quando o número veio sem DDI.
 *
 * O complemento do DDI só vale para entrada digitada por gente (formulário do
 * painel), onde brasileiro escreve "11 98765-4321" sem pensar no país. Para
 * número que veio do WhatsApp use `phoneFromJid`: lá o DDI já vem sempre, e
 * completar de novo transformaria um telefone dos EUA (11 dígitos, começando
 * com 1) num "brasileiro" de 13.
 */
export function normalizePhone(input: string | null | undefined, assumirBrasil = true): string {
  if (!input) return "";
  let digits = String(input).replace(/\D/g, "");
  // 10 = fixo com DDD, 11 = celular com DDD. Nesses tamanhos falta o DDI.
  if (assumirBrasil && digits.length >= 10 && digits.length <= 11 && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }
  return digits;
}

/**
 * Chave canônica: o identificador estável do contato, usado no unique
 * [instanceId, contactKey, cycle].
 *
 * Para celular brasileiro, descarta o nono dígito, de forma que a versão de
 * 13 e a de 12 dígitos convirjam para a mesma chave. Não há colisão com fixo:
 * fixo começa com 2 a 5 depois do DDD, celular antigo com 8 ou 9.
 *
 * `assumirBrasil` precisa ser false para número vindo do WhatsApp, porque
 * "11987654321" (celular de SP sem DDI) e "12025550123" (EUA com DDI) têm os
 * mesmos 11 dígitos: só quem chama sabe a origem. Do JID sempre vem com DDI,
 * então lá é false; de formulário digitado é true.
 */
export function canonicalPhoneKey(
  input: string | null | undefined,
  assumirBrasil = true,
): string {
  const digits = normalizePhone(input, assumirBrasil);
  if (!digits.startsWith("55")) return digits;

  // 55 + DDD(2) + 9 + 8 dígitos
  if (digits.length === 13 && digits[4] === "9") {
    return digits.slice(0, 4) + digits.slice(5);
  }
  return digits;
}

/** É celular brasileiro (com ou sem o nono dígito)? */
export function isBrazilMobile(input: string | null | undefined): boolean {
  const digits = normalizePhone(input);
  if (!digits.startsWith("55")) return false;
  if (digits.length === 13) return digits[4] === "9";
  if (digits.length === 12) return ["8", "9"].includes(digits[4]);
  return false;
}

/**
 * Mascara para log. Conversa de terceiro é dado pessoal: o número inteiro
 * nunca vai para stdout, nem em erro.
 */
export function maskPhone(input: string | null | undefined): string {
  const digits = normalizePhone(input);
  if (digits.length < 6) return "***";
  return `${digits.slice(0, 4)}****${digits.slice(-4)}`;
}

/** Formato de exibição no painel: +55 (11) 98765-4321 */
export function formatPhoneDisplay(input: string | null | undefined): string {
  const digits = normalizePhone(input);
  if (!digits.startsWith("55") || digits.length < 12) return digits || "";

  const ddd = digits.slice(2, 4);
  const rest = digits.slice(4);
  const meio = rest.length === 9 ? rest.slice(0, 5) : rest.slice(0, 4);
  const fim = rest.length === 9 ? rest.slice(5) : rest.slice(4);
  return `+55 (${ddd}) ${meio}-${fim}`;
}

/**
 * Extrai o número do JID do WhatsApp (`5511999999999@s.whatsapp.net`).
 * Não completa DDI: o JID já traz o país, e completar aqui quebraria
 * qualquer contato de fora do Brasil.
 */
export function phoneFromJid(jid: string | null | undefined): string {
  if (!jid) return "";
  return normalizePhone(jid.replace(/@.*$/, ""), false);
}

/**
 * Atalho para o worker: do JID direto para a chave canônica, já com a
 * regra de DDI correta. É esta função que o pipeline de mensagens deve usar,
 * para ninguém esquecer o `false`.
 */
export function contactKeyFromJid(jid: string | null | undefined): string {
  return canonicalPhoneKey(phoneFromJid(jid), false);
}

/** JID do WhatsApp é de grupo? Grupo nunca vira conversa de Track. */
export function isGroupJid(jid: string | null | undefined): boolean {
  return Boolean(jid && (jid.includes("@g.us") || jid === "status@broadcast"));
}

/**
 * O JID é um @lid (id interno de conta Business) em vez de um telefone?
 * Nesse caso o número real vem em `remoteJidAlt`, quando vem.
 */
export function isLidJid(jid: string | null | undefined): boolean {
  return Boolean(jid && jid.includes("@lid"));
}
