/**
 * Os estágios do funil do Track e a ordem entre eles.
 *
 * Sem dependência de Node nem de Next: o worker importa por caminho relativo.
 */

export const STAGES = ["lead", "respondeu", "qualificado", "venda"] as const;
export type Stage = (typeof STAGES)[number];

/** Perdido existe como estado da conversa, mas não é etapa do funil e nunca vira conversão. */
export const STAGE_PERDIDO = "perdido";
export type ConversationStage = Stage | typeof STAGE_PERDIDO;

const ORDEM: Record<Stage, number> = {
  lead: 0,
  respondeu: 1,
  qualificado: 2,
  venda: 3,
};

export function isStage(s: string): s is Stage {
  return (STAGES as readonly string[]).includes(s);
}

export function ordemDoStage(s: Stage): number {
  return ORDEM[s];
}

/**
 * O estágio `novo` é mais avançado que o `atual`?
 * O funil só anda para frente: uma etiqueta removida no celular não desfaz
 * uma venda já contabilizada, porque conversão já enviada não se "des-envia".
 */
export function avancou(atual: ConversationStage, novo: Stage): boolean {
  if (atual === STAGE_PERDIDO) return true; // reabrir conversa perdida é válido
  return ORDEM[novo] > ORDEM[atual as Stage];
}

/**
 * Todos os estágios implicados por um estágio alcançado, o próprio incluído.
 *
 * Registrar `venda` implica registrar `qualificado` e `respondeu`
 * retroativamente. Sem isso o painel mostraria "1 venda, 0 qualificados", que
 * destrói a credibilidade do funil na frente do cliente.
 */
export function stagesImplicados(alcancado: Stage): Stage[] {
  return STAGES.filter((s) => ORDEM[s] <= ORDEM[alcancado]);
}

export const STAGE_LABEL: Record<ConversationStage, string> = {
  lead: "Lead",
  respondeu: "Respondeu",
  qualificado: "Qualificado",
  venda: "Venda",
  perdido: "Perdido",
};

/** Cor por estágio. Verde é sempre conversão, alinhado com o resto do painel. */
export const STAGE_COR: Record<ConversationStage, string> = {
  lead: "text-slate-400",
  respondeu: "text-blue-400",
  qualificado: "text-amber-400",
  venda: "text-emerald-400",
  perdido: "text-red-400",
};

/** Como a conversa foi atribuída ao clique. */
export const MATCH_TYPES = ["code", "ctwa", "proximity", "manual", "none"] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export const MATCH_LABEL: Record<MatchType, string> = {
  code: "Código na mensagem",
  ctwa: "Anúncio do Meta",
  proximity: "Por proximidade",
  manual: "Atribuído na mão",
  none: "Sem atribuição",
};

/**
 * Confiança da atribuição. `proximity` é palpite: a conversa chegou logo
 * depois de um clique sem dono, mas ninguém provou que é a mesma pessoa.
 * Por padrão isso NÃO dispara conversão paga, porque conversão falsa treina
 * o algoritmo do cliente contra ele mesmo.
 */
export function confiancaDoMatch(tipo: MatchType): "high" | "low" | "none" {
  if (tipo === "code" || tipo === "ctwa" || tipo === "manual") return "high";
  if (tipo === "proximity") return "low";
  return "none";
}
