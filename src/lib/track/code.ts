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

/**
 * Sem 0, O, 1, I e L: o código é lido e digitado por gente, e num tipo sem
 * serifa esses cinco viram dois. 31^8 ≈ 850 bilhões, folga de sobra.
 *
 * O L estava aqui por engano até uma checagem pegar: ele aparecia em cerca de
 * 22% dos códigos gerados, exatamente o problema que a lista existe para
 * evitar.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 8;

/**
 * Alfabeto de LEITURA, separado do de geração.
 *
 * O L saiu da geração, mas códigos criados antes da mudança o contêm, e uma
 * mensagem pode chegar dias depois do clique (a pessoa guarda o texto pronto
 * e manda quando quer). Ler com o alfabeto novo descartaria esses códigos e a
 * conversa ficaria sem atribuição. Regra: o que já foi emitido um dia precisa
 * ser lido para sempre.
 */
const READ_ALPHABET = `${ALPHABET}L`;

/** Prefixo que torna o código localizável no meio de qualquer texto. */
const MARKER = "#";

const CODE_RE = new RegExp(`${MARKER}([${READ_ALPHABET}]{${CODE_LENGTH}})`);

/**
 * Gera um código aleatório. Usa crypto quando disponível (server e worker),
 * com Math.random como último recurso para não quebrar em runtime exótico:
 * a colisão é tratada no banco pelo unique [workspaceId, code].
 */
export function generateCode(): string {
  return sortearDoAlfabeto(CODE_LENGTH);
}

/**
 * Sorteia caracteres com distribuição uniforme.
 *
 * Com alfabeto de 31, `byte % 31` enviesaria: 256 não é múltiplo de 31, então
 * os primeiros caracteres sairiam com mais frequência que os últimos. O
 * descarte dos bytes acima do maior múltiplo (248) resolve, ao custo de pedir
 * mais alguns bytes de vez em quando.
 */
function sortearDoAlfabeto(tamanho: number): string {
  const n = ALPHABET.length;
  const limite = Math.floor(256 / n) * n;
  let out = "";
  let bytes = randomBytes(tamanho * 2);
  let i = 0;

  while (out.length < tamanho) {
    if (i >= bytes.length) {
      bytes = randomBytes(tamanho);
      i = 0;
    }
    const b = bytes[i++];
    if (b < limite) out += ALPHABET[b % n];
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
  // Alfabeto de leitura: código antigo com L continua válido para sempre.
  return new RegExp(`^[${READ_ALPHABET}]{${CODE_LENGTH}}$`).test(code);
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
  return sortearDoAlfabeto(length).toLowerCase();
}
