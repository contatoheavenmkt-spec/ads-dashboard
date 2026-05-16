/**
 * Visibilidade de KPIs por workspace. null = auto-detect (padrão antigo —
 * mostra KPIs que têm dado >0 no período); objeto = override explícito por
 * KPI. Salvo em Workspace.visibleMetrics como JSON.
 */

export type MetricKey =
  | "spend"
  | "impressions"
  | "reach"
  | "clicks"
  | "messages"
  | "purchases"
  | "leads"
  | "revenue"
  | "conversions";

export type VisibleMetrics = Partial<Record<MetricKey, boolean>>;

export const METRIC_DEFINITIONS: { key: MetricKey; label: string; description: string }[] = [
  { key: "spend", label: "Investimento", description: "Valor gasto em anúncios" },
  { key: "impressions", label: "Impressões", description: "Quantas vezes os anúncios apareceram" },
  { key: "reach", label: "Alcance", description: "Pessoas únicas alcançadas" },
  { key: "clicks", label: "Cliques", description: "Cliques nos anúncios" },
  { key: "messages", label: "Mensagens iniciadas", description: "Conversas no WhatsApp/Messenger" },
  { key: "purchases", label: "Vendas", description: "Compras registradas pelo pixel" },
  { key: "leads", label: "Leads", description: "Cadastros de lead capturados" },
  { key: "revenue", label: "Faturamento", description: "Receita gerada pelas vendas" },
  { key: "conversions", label: "Conversões totais", description: "Vendas + leads + mensagens" },
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
 *   - override null → fallback pro auto-detect (mostra se hasData)
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
