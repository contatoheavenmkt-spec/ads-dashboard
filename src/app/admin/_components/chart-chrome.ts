import type { CSSProperties } from "react";

// ─── Chrome dos gráficos ──────────────────────────────────────────────────────
//
// Grade e eixos são RECESSIVOS de propósito: hairline sólida (nunca tracejada,
// que lê como "projeção") a um passo da superfície, rótulos em slate-500. Quem
// pode ser notado no card é o dado — o resto é andaime.
//
// Estes valores viviam duplicados (de propósito, para as duas telas falarem a
// mesma língua) no dashboard e no analytics. Com os desenhos extraídos para
// componentes carregados via `next/dynamic`, o chrome passou a morar aqui, num
// módulo SEM recharts: os componentes de gráfico importam daqui, e as páginas
// podem continuar importando qualquer constante compartilhada sem puxar a lib
// de gráficos para o chunk inicial.

export const ESTILO_TOOLTIP: CSSProperties = {
  background: "rgba(15,23,42,0.97)",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 14,
  boxShadow: "0 18px 40px -18px rgba(2,6,23,0.95)",
  padding: "8px 12px",
  fontSize: 12,
  color: "#e2e8f0",
};

export const ESTILO_ROTULO_TOOLTIP: CSSProperties = {
  color: "#94a3b8",
  fontWeight: 700,
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 2,
};

export const ESTILO_ITEM_TOOLTIP: CSSProperties = {
  color: "#f1f5f9",
  fontSize: 12,
  fontWeight: 700,
  padding: 0,
};

export const ESTILO_EIXO = { fill: "#64748b", fontSize: 10, fontWeight: 600 };

export const COR_GRADE = "rgba(148,163,184,0.09)";

/** Cursor do hover em gráficos de linha/área — fio fino, some no fundo. */
export const CURSOR_LINHA = { stroke: "rgba(148,163,184,0.28)", strokeWidth: 1 };
