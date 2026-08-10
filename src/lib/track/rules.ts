/**
 * Decide em que estágio do funil uma conversa está.
 *
 * Função pura de propósito: é a regra que transforma uma etiqueta no celular
 * do atendente em conversão enviada ao Google Ads. Errar aqui custa dinheiro
 * de anúncio do cliente, então tem que ser testável sem banco, sem WhatsApp e
 * sem rede.
 *
 * Sem dependência de Node nem de Next: o worker importa por caminho relativo.
 */

import { normalizarTexto, type FraseGatilho, type TrackConfig } from "./settings";
import { avancou, type ConversationStage, type Stage } from "./stages";

export interface EstadoConversa {
  stage: ConversationStage;
  inboundCount: number;
  outboundCount: number;
  /**
   * Idas e voltas REAIS: quantas vezes o cliente voltou depois de uma
   * resposta do atendente, na sequência de mensagens de verdade.
   *
   * Não é min(inbound, outbound): com essa conta, um lead que mandou 3
   * mensagens no primeiro dia e sumiu viraria "qualificado" quando o
   * atendente mandasse a 3ª cobrança sem resposta. Follow-up no vácuo não é
   * conversa.
   */
  trocasCompletas: number;
  /** Etiquetas atualmente na conversa, por waLabelId. */
  labelIds: string[];
  /** Houve mensagem da agência antes da última do cliente? */
  houveOutboundAntesDoUltimoInbound: boolean;
}

/**
 * Conta as idas e voltas de uma sequência de direções de mensagem.
 *
 * Colapsa rajadas (3 mensagens seguidas do cliente = 1 bloco) e conta quantos
 * blocos do cliente vieram DEPOIS de um bloco do atendente: é o "voltou
 * depois da resposta", que é o que separa conversa de monólogo dos dois
 * lados.
 */
export function contarTrocasCompletas(direcoes: Array<"in" | "out">): number {
  let trocas = 0;
  let anterior: "in" | "out" | null = null;
  let houveOut = false;
  for (const d of direcoes) {
    if (d === anterior) continue; // rajada do mesmo lado: mesmo bloco
    if (d === "out") houveOut = true;
    if (d === "in" && houveOut) {
      trocas++;
      houveOut = false; // a próxima troca exige nova resposta do atendente
    }
    anterior = d;
  }
  return trocas;
}

export interface MensagemAvaliada {
  texto: string | null;
  direcao: "in" | "out";
}

export interface StageDetectado {
  stage: Stage;
  /** De onde veio a decisão, para o painel poder explicar. */
  origem: "label" | "phrase" | "messages" | "manual" | "crm";
  /** Detalhe legível: qual etiqueta ou qual frase disparou. */
  detalhe?: string;
}

/**
 * Uma frase-gatilho bateu na mensagem?
 *
 * A direção importa muito: "parabéns pela sua compra" é do atendente (out) e
 * "quanto custa" é do cliente (in). Sem checar direção, o próprio atendente
 * perguntando o preço qualificaria o lead sozinho.
 */
function fraseBate(frases: FraseGatilho[], msg: MensagemAvaliada): FraseGatilho | null {
  if (!msg.texto) return null;
  const alvo = normalizarTexto(msg.texto);
  if (!alvo) return null;

  for (const frase of frases) {
    if (frase.direction !== "any" && frase.direction !== msg.direcao) continue;
    const procurado = normalizarTexto(frase.text);
    if (procurado && alvo.includes(procurado)) return frase;
  }
  return null;
}

function temAlgumaEtiqueta(labelIds: string[], procurados: string[]): string | null {
  for (const id of procurados) {
    if (labelIds.includes(id)) return id;
  }
  return null;
}

/**
 * Avalia a conversa e devolve o estágio mais avançado que ela alcançou agora,
 * ou null se nada mudou.
 *
 * A ordem de checagem vai do mais forte para o mais fraco: venda ganha de
 * qualificado, que ganha de respondeu. Uma mensagem que dispara "venda" não
 * precisa passar pelos outros, porque `stagesImplicados` preenche o caminho.
 */
export function avaliarConversa(
  cfg: TrackConfig,
  estado: EstadoConversa,
  mensagem?: MensagemAvaliada,
): StageDetectado | null {
  // 1. Venda, o estágio que vale dinheiro.
  const etiquetaVenda = temAlgumaEtiqueta(estado.labelIds, cfg.saleLabelIds);
  if (etiquetaVenda && avancou(estado.stage, "venda")) {
    return { stage: "venda", origem: "label", detalhe: etiquetaVenda };
  }
  if (mensagem) {
    const frase = fraseBate(cfg.salePhrases, mensagem);
    if (frase && avancou(estado.stage, "venda")) {
      return { stage: "venda", origem: "phrase", detalhe: frase.text };
    }
  }

  // 2. Qualificado por ENGAJAMENTO, sem ninguém marcar nada.
  //
  // Uma conversa com várias idas e voltas é lead de verdade, e isso acontece
  // em volume, sem depender de o atendente lembrar de etiquetar. É o sinal
  // mais útil para o Google aprender a trazer gente parecida.
  //
  // Conta trocas COMPLETAS (min entre o que entrou e o que saiu), não
  // mensagens soltas: cinco mensagens seguidas do cliente sem resposta são
  // lead ansioso, não conversa.
  if (cfg.qualifiedMinTrocas > 0) {
    if (estado.trocasCompletas >= cfg.qualifiedMinTrocas && avancou(estado.stage, "qualificado")) {
      return {
        stage: "qualificado",
        origem: "messages",
        detalhe: `${estado.trocasCompletas} idas e voltas na conversa`,
      };
    }
  }

  const etiquetaQualificado = temAlgumaEtiqueta(estado.labelIds, cfg.qualifiedLabelIds);
  if (etiquetaQualificado && avancou(estado.stage, "qualificado")) {
    return { stage: "qualificado", origem: "label", detalhe: etiquetaQualificado };
  }
  if (mensagem) {
    const frase = fraseBate(cfg.qualifiedPhrases, mensagem);
    if (frase && avancou(estado.stage, "qualificado")) {
      return { stage: "qualificado", origem: "phrase", detalhe: frase.text };
    }
  }

  // 3. Respondeu: houve conversa de verdade, não só o primeiro "oi".
  //    É o estágio que separa lead que existe de lead que engajou, e é
  //    justamente o número que o cliente quer mandar pro Google como
  //    "lead qualificado" em vez do volume bruto.
  if (
    estado.inboundCount >= cfg.respondedMinInbound &&
    (!cfg.respondedRequiresOutbound || estado.houveOutboundAntesDoUltimoInbound) &&
    avancou(estado.stage, "respondeu")
  ) {
    return { stage: "respondeu", origem: "messages" };
  }

  return null;
}

/**
 * A conversa foi marcada como perdida?
 *
 * Fica fora de `avaliarConversa` porque perdido não é etapa do funil: não
 * gera conversão e não impede que a pessoa volte depois.
 */
export function foiMarcadaComoPerdida(cfg: TrackConfig, labelIds: string[]): string | null {
  return temAlgumaEtiqueta(labelIds, cfg.lostLabelIds);
}

/**
 * Valor da venda: o que veio na hora, ou o padrão do workspace.
 * Sem valor definido, a conversão sobe sem valor, que é melhor do que subir
 * com um número inventado.
 */
export function valorDaVenda(cfg: TrackConfig, informado?: number | null): number | null {
  if (typeof informado === "number" && Number.isFinite(informado) && informado >= 0) {
    return informado;
  }
  return cfg.defaultSaleValue ?? null;
}
