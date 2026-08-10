/**
 * Configuração de qualificação do Track, por workspace.
 *
 * As listas vivem como JSON em String no banco (padrão do repo, ver
 * `Workspace.visibleMetrics` e `leadSources`), então tudo que entra e sai
 * passa por aqui, com defaults seguros para linha ainda não criada.
 *
 * Sem dependência de Node nem de Next: o worker importa por caminho relativo.
 */

export type DirecaoFrase = "in" | "out" | "any";

export interface FraseGatilho {
  text: string;
  /**
   * De quem tem que ser a frase. Importa muito: "parabéns pela sua compra" é
   * do atendente, "quanto custa" é do cliente. Sem direção, o próprio
   * atendente perguntando o preço qualificaria o lead sozinho.
   */
  direction: DirecaoFrase;
}

export interface TrackConfig {
  respondedMinInbound: number;
  respondedRequiresOutbound: boolean;
  /**
   * Idas e voltas completas para qualificar sozinho, sem ninguém marcar nada.
   * Uma troca = o cliente escreveu e o atendente respondeu. 0 desliga.
   */
  qualifiedMinTrocas: number;
  qualifiedLabelIds: string[];
  qualifiedPhrases: FraseGatilho[];
  saleLabelIds: string[];
  salePhrases: FraseGatilho[];
  lostLabelIds: string[];
  defaultSaleValue: number | null;
  syncCrmSale: boolean;
  createLeadInCrm: boolean;
  storeMessageText: boolean;
  messageRetentionDays: number;
  journeyResetDays: number;
  matchWindowMinutes: number;
  uploadLagHours: number;
  timezone: string;
}

export const CONFIG_PADRAO: TrackConfig = {
  respondedMinInbound: 2,
  respondedRequiresOutbound: true,
  qualifiedMinTrocas: 3,
  qualifiedLabelIds: [],
  qualifiedPhrases: [],
  saleLabelIds: [],
  salePhrases: [],
  lostLabelIds: [],
  defaultSaleValue: null,
  syncCrmSale: true,
  createLeadInCrm: true,
  storeMessageText: true,
  messageRetentionDays: 90,
  journeyResetDays: 30,
  matchWindowMinutes: 30,
  uploadLagHours: 3,
  timezone: "America/Sao_Paulo",
};

/** Linha crua vinda do Prisma (campos JSON ainda como String). */
export interface TrackSettingsRow {
  respondedMinInbound: number;
  respondedRequiresOutbound: boolean;
  qualifiedMinTrocas?: number;
  qualifiedLabelIds: string | null;
  qualifiedPhrases: string | null;
  saleLabelIds: string | null;
  salePhrases: string | null;
  lostLabelIds: string | null;
  defaultSaleValue: number | null;
  syncCrmSale: boolean;
  createLeadInCrm: boolean;
  storeMessageText: boolean;
  messageRetentionDays: number;
  journeyResetDays: number;
  matchWindowMinutes: number;
  uploadLagHours: number;
  timezone: string;
}

function listaDeIds(bruto: string | null): string[] {
  if (!bruto) return [];
  try {
    const v = JSON.parse(bruto);
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 50);
  } catch {
    return [];
  }
}

function listaDeFrases(bruto: string | null): FraseGatilho[] {
  if (!bruto) return [];
  try {
    const v = JSON.parse(bruto);
    if (!Array.isArray(v)) return [];
    return v
      .map((x): FraseGatilho | null => {
        if (typeof x === "string") return { text: x, direction: "any" };
        if (x && typeof x.text === "string") {
          const d = x.direction;
          return {
            text: x.text,
            direction: d === "in" || d === "out" ? d : "any",
          };
        }
        return null;
      })
      .filter((x): x is FraseGatilho => x !== null && x.text.trim().length >= 3)
      .slice(0, 50);
  } catch {
    return [];
  }
}

/** Linha do banco (ou a ausência dela) vira config utilizável. */
export function parseTrackSettings(row: TrackSettingsRow | null | undefined): TrackConfig {
  if (!row) return { ...CONFIG_PADRAO };
  return {
    respondedMinInbound: Math.max(1, row.respondedMinInbound ?? CONFIG_PADRAO.respondedMinInbound),
    respondedRequiresOutbound: row.respondedRequiresOutbound ?? CONFIG_PADRAO.respondedRequiresOutbound,
    qualifiedMinTrocas: Math.max(0, row.qualifiedMinTrocas ?? CONFIG_PADRAO.qualifiedMinTrocas),
    qualifiedLabelIds: listaDeIds(row.qualifiedLabelIds),
    qualifiedPhrases: listaDeFrases(row.qualifiedPhrases),
    saleLabelIds: listaDeIds(row.saleLabelIds),
    salePhrases: listaDeFrases(row.salePhrases),
    lostLabelIds: listaDeIds(row.lostLabelIds),
    defaultSaleValue: row.defaultSaleValue ?? null,
    syncCrmSale: row.syncCrmSale ?? CONFIG_PADRAO.syncCrmSale,
    createLeadInCrm: row.createLeadInCrm ?? CONFIG_PADRAO.createLeadInCrm,
    storeMessageText: row.storeMessageText ?? CONFIG_PADRAO.storeMessageText,
    messageRetentionDays: row.messageRetentionDays ?? CONFIG_PADRAO.messageRetentionDays,
    journeyResetDays: row.journeyResetDays ?? CONFIG_PADRAO.journeyResetDays,
    matchWindowMinutes: row.matchWindowMinutes ?? CONFIG_PADRAO.matchWindowMinutes,
    uploadLagHours: row.uploadLagHours ?? CONFIG_PADRAO.uploadLagHours,
    timezone: row.timezone || CONFIG_PADRAO.timezone,
  };
}

/** Config utilizável vira campos prontos para gravar. */
export function serializeTrackSettings(c: Partial<TrackConfig>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (c.respondedMinInbound !== undefined) out.respondedMinInbound = c.respondedMinInbound;
  if (c.respondedRequiresOutbound !== undefined) out.respondedRequiresOutbound = c.respondedRequiresOutbound;
  if (c.qualifiedMinTrocas !== undefined) out.qualifiedMinTrocas = c.qualifiedMinTrocas;
  if (c.qualifiedLabelIds !== undefined) out.qualifiedLabelIds = JSON.stringify(c.qualifiedLabelIds);
  if (c.qualifiedPhrases !== undefined) out.qualifiedPhrases = JSON.stringify(c.qualifiedPhrases);
  if (c.saleLabelIds !== undefined) out.saleLabelIds = JSON.stringify(c.saleLabelIds);
  if (c.salePhrases !== undefined) out.salePhrases = JSON.stringify(c.salePhrases);
  if (c.lostLabelIds !== undefined) out.lostLabelIds = JSON.stringify(c.lostLabelIds);
  if (c.defaultSaleValue !== undefined) out.defaultSaleValue = c.defaultSaleValue;
  if (c.syncCrmSale !== undefined) out.syncCrmSale = c.syncCrmSale;
  if (c.createLeadInCrm !== undefined) out.createLeadInCrm = c.createLeadInCrm;
  if (c.storeMessageText !== undefined) out.storeMessageText = c.storeMessageText;
  if (c.messageRetentionDays !== undefined) out.messageRetentionDays = c.messageRetentionDays;
  if (c.journeyResetDays !== undefined) out.journeyResetDays = c.journeyResetDays;
  if (c.matchWindowMinutes !== undefined) out.matchWindowMinutes = c.matchWindowMinutes;
  if (c.uploadLagHours !== undefined) out.uploadLagHours = c.uploadLagHours;
  if (c.timezone !== undefined) out.timezone = c.timezone;
  return out;
}

/**
 * Normaliza texto para comparação de frase-gatilho: minúsculo, sem acento,
 * espaços colapsados. O atendente escreve "Parabéns pela sua compra!" e a
 * regra cadastrada diz "parabens pela sua compra"; as duas têm que casar.
 */
export function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    // Faixa dos diacríticos combinantes, escrita com escape para não depender
    // da codificação do arquivo.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
