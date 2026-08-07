/**
 * O código curto que amarra um clique no anúncio à conversa no WhatsApp.
 *
 * Ele viaja dentro da mensagem pré-preenchida do wa.me. Quando a pessoa
 * envia sem apagar, o worker lê o código da primeira mensagem e sabe
 * exatamente qual gclid originou aquela conversa.
 *
 * Sem dependência de Node nem de Next: o worker importa este arquivo por
 * caminho relativo, fora do resolver de paths do tsconfig.
 */

/** Sem 0/O/1/I/L: o código é lido e digitado por gente. 32^8 ≈ 1,1 trilhão. */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const CODE_LENGTH = 8;

/** Prefixo que torna o código localizável no meio de qualquer texto. */
const MARKER = "#";

const CODE_RE = new RegExp(`${MARKER}([${ALPHABET}]{${CODE_LENGTH}})`);

/**
 * Gera um código aleatório. Usa crypto quando disponível (server e worker),
 * com Math.random como último recurso para não quebrar em runtime exótico:
 * a colisão é tratada no banco pelo unique [workspaceId, code].
 */
export function generateCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    // 256 % 32 === 0, então o módulo não enviesa a distribuição.
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) {
    c.getRandomValues(buf);
    return buf;
  }
  for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 256);
  return buf;
}

/** Como o código aparece dentro da mensagem. */
export function formatCode(code: string): string {
  return `${MARKER}${code}`;
}

/**
 * Extrai o código de um texto de mensagem. Aceita minúsculas porque alguns
 * teclados capitalizam sozinhos, e ignora o resto do texto: a pessoa pode
 * escrever antes ou depois do código sem quebrar o rastreio.
 */
export function extractCode(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = CODE_RE.exec(text.toUpperCase());
  return match ? match[1] : null;
}

/** Valida o formato sem tocar no banco (usado para descartar lixo cedo). */
export function isValidCode(code: string): boolean {
  return new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`).test(code);
}

/**
 * Monta a mensagem final a partir do template do link. `{code}` é o único
 * placeholder obrigatório; se o usuário apagar do template, o código é
 * acrescentado ao fim, senão o link nasce sem rastreio nenhum.
 */
export function renderMessage(template: string, code: string): string {
  const tag = formatCode(code);
  if (template.includes("{code}")) return template.replaceAll("{code}", tag);
  return `${template.trim()} ${tag}`.trim();
}

/**
 * Slug do link rastreável (o que aparece em /r/<slug>). Curto de propósito:
 * ele entra na URL final do anúncio, que o Google exibe.
 */
export function generateSlug(length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length].toLowerCase();
  return out;
}
