import { maskPhone } from "../src/lib/track/phone";

/**
 * Log do worker.
 *
 * Regra dura: telefone de terceiro NUNCA sai inteiro no stdout, nem em erro.
 * O worker lê conversa de cliente do cliente, e o log do PM2 fica em disco na
 * VPS por dias. Use `tel()` para qualquer número que for parar numa mensagem.
 */

type Nivel = "info" | "warn" | "erro";

function carimbo(): string {
  return new Date().toISOString().slice(11, 19);
}

function escrever(nivel: Nivel, escopo: string, msg: string, extra?: unknown) {
  const linha = `${carimbo()} [${escopo}] ${msg}`;
  const saida = nivel === "erro" ? console.error : nivel === "warn" ? console.warn : console.log;
  if (extra === undefined) saida(linha);
  else saida(linha, extra);
}

export function criarLog(escopo: string) {
  return {
    info: (msg: string, extra?: unknown) => escrever("info", escopo, msg, extra),
    warn: (msg: string, extra?: unknown) => escrever("warn", escopo, msg, extra),
    erro: (msg: string, extra?: unknown) => escrever("erro", escopo, msg, extra),
  };
}

/** Telefone mascarado para log. Sempre use isto, nunca o número cru. */
export function tel(numero: string | null | undefined): string {
  return maskPhone(numero);
}

/** Texto de mensagem em log: só o tamanho, nunca o conteúdo. */
export function textoResumo(texto: string | null | undefined): string {
  if (!texto) return "(vazio)";
  return `(${texto.length} chars)`;
}
