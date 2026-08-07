/**
 * Tipos do motor de sugestões.
 *
 * Separado das regras para o worker, o cron e os testes compartilharem sem
 * arrastar dependência de banco nem de rede.
 */

/** Metas e limites do workspace. */
export interface PoliticaIa {
  enabled: boolean;
  targetCpa: number | null;
  targetRoas: number | null;
  maxBudgetChangePct: number;
  maxDailyBudgetCeiling: number | null;
  maxAppliedPerDay: number;
  minConversionsForCpa: number;
  lookbackDays: number;
  disabledRules: string[];
}

export const POLITICA_PADRAO: PoliticaIa = {
  enabled: false,
  targetCpa: null,
  targetRoas: null,
  maxBudgetChangePct: 20,
  maxDailyBudgetCeiling: null,
  maxAppliedPerDay: 5,
  minConversionsForCpa: 10,
  lookbackDays: 14,
  disabledRules: [],
};

/** Uma campanha, com o que a regra precisa saber. */
export interface Campanha {
  id: string;
  nome: string;
  status: string;
  custo: number;
  cliques: number;
  impressoes: number;
  conversoes: number;
  valorConversoes: number;
  /** Fatia de impressões perdida por orçamento, de 0 a 1. */
  perdaPorOrcamento: number | null;
  orcamentoId: string | null;
  orcamentoDiario: number | null;
  /** Orçamento compartilhado mexe em outras campanhas: nunca sugerir. */
  orcamentoCompartilhado: boolean;
}

/** Um anúncio dentro de um grupo. */
export interface Anuncio {
  id: string;
  adGroupId: string;
  adGroupNome: string;
  campaignId: string;
  campanhaNome: string;
  custo: number;
  cliques: number;
  impressoes: number;
  conversoes: number;
  /** Quantos anúncios ativos existem no mesmo grupo. */
  ativosNoGrupo: number;
}

/** Uma palavra-chave. */
export interface Palavra {
  criterioId: string;
  texto: string;
  adGroupId: string;
  campaignId: string;
  campanhaNome: string;
  custo: number;
  cliques: number;
  conversoes: number;
}

/** Um termo de busca que disparou os anúncios. */
export interface TermoBusca {
  termo: string;
  adGroupId: string;
  campaignId: string;
  campanhaNome: string;
  custo: number;
  cliques: number;
  conversoes: number;
  /** Palavras ativas do grupo, para julgar se o termo tem a ver. */
  palavrasDoGrupo: string[];
}

/** O que o CRM e o Track sabem sobre a campanha: a verdade do faturamento. */
export interface RealidadeCrm {
  campaignId: string;
  leads: number;
  qualificados: number;
  vendas: number;
  faturamento: number;
}

export interface ContextoAnalise {
  politica: PoliticaIa;
  /** Média de conversão do workspace, para não punir campanha melhor que a média. */
  taxaVendaMediaWorkspace: number;
  campanhas: Campanha[];
  anuncios: Anuncio[];
  palavras: Palavra[];
  termos: TermoBusca[];
  crm: RealidadeCrm[];
}

export type Acao =
  | { tipo: "pausar_campanha"; campaignId: string }
  | { tipo: "pausar_anuncio"; adGroupId: string; adId: string }
  | { tipo: "pausar_palavra"; adGroupId: string; criterioId: string }
  | { tipo: "negativar_termo"; adGroupId: string; termo: string }
  | { tipo: "ajustar_orcamento"; orcamentoId: string; deMicros: number; paraMicros: number };

export interface Sugestao {
  ruleCode: string;
  severidade: "critica" | "alta" | "media" | "baixa";
  escopo: "campanha" | "grupo" | "anuncio" | "palavra" | "termo" | "orcamento";
  entityId: string;
  entityNome: string;
  campaignId: string | null;
  adGroupId: string | null;
  titulo: string;
  porque: string;
  /** Os números crus que embasaram, para a tela poder mostrar a conta. */
  evidencia: Record<string, unknown>;
  /** Quanto se economiza ou se ganha por mês, em reais. Ordena a fila. */
  impactoEstimado: number;
  acao: Acao;
}
