/**
 * Visibilidade de KPIs por workspace. null = auto-detect (padrão antigo —
 * mostra KPIs que têm dado >0 no período); objeto = override explícito por
 * KPI. Salvo em Workspace.visibleMetrics como JSON.
 */

export type MetricKey =
  // Volume e alcance
  | "spend"
  | "impressions"
  | "reach"
  | "frequency"
  | "clicks"
  // Eficiência
  | "ctr"
  | "cpc"
  | "cpm"
  | "cpa"
  | "roas"
  | "aov"
  // Conversão e resultado
  | "messages"
  | "leads"
  | "purchases"
  | "revenue"
  | "conversions";

export type VisibleMetrics = Partial<Record<MetricKey, boolean>>;

export type MetricCategory = "volume" | "eficiencia" | "conversao";

export interface MetricDefinition {
  key: MetricKey;
  label: string;
  description: string;
  category: MetricCategory;
  /** Se true, aparece por padrão no modo auto-detect (mesmo sem dado > 0). */
  defaultAuto?: boolean;
}

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  // ─── Volume e alcance ────────────────────────────────────────────
  { key: "spend", label: "Investimento", description: "Valor total gasto em anúncios", category: "volume", defaultAuto: true },
  { key: "impressions", label: "Impressões", description: "Quantas vezes os anúncios apareceram", category: "volume", defaultAuto: true },
  { key: "reach", label: "Alcance", description: "Pessoas únicas alcançadas", category: "volume", defaultAuto: true },
  { key: "frequency", label: "Frequência", description: "Média de vezes que cada pessoa viu o anúncio (impressões / alcance)", category: "volume" },
  { key: "clicks", label: "Cliques", description: "Cliques nos anúncios", category: "volume", defaultAuto: true },

  // ─── Eficiência ──────────────────────────────────────────────────
  { key: "ctr", label: "CTR", description: "Taxa de cliques (cliques / impressões)", category: "eficiencia" },
  { key: "cpc", label: "CPC", description: "Custo por clique (investimento / cliques)", category: "eficiencia" },
  { key: "cpm", label: "CPM", description: "Custo por mil impressões", category: "eficiencia" },
  { key: "cpa", label: "CPA", description: "Custo por conversão (investimento / conversões)", category: "eficiencia" },
  { key: "roas", label: "ROAS", description: "Retorno sobre investimento (faturamento / investimento)", category: "eficiencia" },
  { key: "aov", label: "Ticket médio", description: "Valor médio por venda (faturamento / vendas)", category: "eficiencia" },

  // ─── Conversão e resultado ───────────────────────────────────────
  { key: "messages", label: "Mensagens iniciadas", description: "Conversas no WhatsApp ou Messenger", category: "conversao" },
  { key: "leads", label: "Leads", description: "Cadastros de lead capturados", category: "conversao" },
  { key: "purchases", label: "Vendas", description: "Compras registradas pelo pixel", category: "conversao" },
  { key: "revenue", label: "Faturamento", description: "Receita gerada pelas vendas", category: "conversao" },
  { key: "conversions", label: "Conversões totais", description: "Vendas + leads + mensagens somados", category: "conversao" },
];

export const METRIC_CATEGORIES: { id: MetricCategory; label: string; description: string }[] = [
  { id: "volume", label: "Volume e alcance", description: "Quantos viram seus anúncios e clicaram" },
  { id: "eficiencia", label: "Eficiência", description: "Custo, retorno e proporções" },
  { id: "conversao", label: "Conversões e resultado", description: "Vendas, leads e mensagens" },
];

export function parseVisibleMetrics(raw: string | null | undefined): VisibleMetrics | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (typeof obj !== "object" || obj === null) return null;
    const out: VisibleMetrics = {};
    for (const def of METRIC_DEFINITIONS) {
      if (typeof obj[def.key] === "boolean") out[def.key] = obj[def.key];
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function serializeVisibleMetrics(v: VisibleMetrics | null): string | null {
  if (!v || Object.keys(v).length === 0) return null;
  return JSON.stringify(v);
}

/**
 * Resolve se um KPI deve aparecer dado:
 * - `override`: objeto vindo do workspace (null = auto)
 * - `hasData`: o KPI tem valor > 0 no período (auto-detect anterior)
 *
 * Regras:
 *   - override null → fallback pro auto-detect (mostra se hasData OU se
 *     defaultAuto=true na definição)
 *   - override define a key explicitamente → respeita o boolean
 *   - override existe mas não define essa key → trata como `true` (assume
 *     que o usuário deixou no padrão; é melhor mostrar a mais do que esconder
 *     KPIs que ele provavelmente nem sabe que existem)
 */
export function shouldShowMetric(
  key: MetricKey,
  override: VisibleMetrics | null,
  hasData: boolean,
): boolean {
  if (override === null) return hasData;
  if (key in override) return override[key] === true;
  return true;
}
