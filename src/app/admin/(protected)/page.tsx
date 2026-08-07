"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import {
  Activity, AlertTriangle, Clock, CreditCard, DollarSign, Layers,
  LayoutDashboard, Plug, RefreshCw, Target, TrendingUp, UserCheck, Users,
} from "lucide-react";
import {
  CardKpi, EstadoErro, EstadoVazio, Secao, Skeleton,
  COR_PLANO_PADRAO, COR_STATUS, corDoPlano,
  formatarDataHora, formatarMoeda, formatarNumero, formatarPercentual,
} from "../_components/admin-ui";
import { cn } from "@/lib/utils";

/**
 * Dashboard principal do painel admin.
 *
 * Antes esta tela era um Server Component que ia direto no Prisma. Agora
 * consome GET /api/admin/metrics como client component, pelos mesmos motivos
 * que as telas de contas/analytics: o seletor de período e o botão de recarregar
 * precisam trocar dados sem navegação, e a rota já concentra toda a regra de
 * negócio (o que entra no MRR, como se aproxima o histórico, o que é churn).
 *
 * O REQUISITO CENTRAL desta tela é o campo `degradado` da resposta.
 * A rota usa allSettled: quando uma agregação quebra, ela devolve o bloco
 * ZERADO e anota o nome em `degradado`. Sem tratar isso, um MRR que falhou
 * apareceria como "R$ 0,00" — indistinguível de "não temos receita", que é a
 * pior mentira possível num painel financeiro. Por isso todo card e todo
 * gráfico consulta o mapa AGREGACAO_* antes de renderizar um número.
 *
 * COR: nada de paleta local. As cores de plano vivem em `admin-ui.tsx`
 * (`PALETA_PLANO`/`corDoPlano`), validadas contra a superfície escura real —
 * inclusive em deuteranopia. Duplicar hex aqui foi exatamente o que colocou um
 * roxo reprovado (#a855f7) na rosca de planos.
 */

// ─── Fronteiras de carregamento (code-splitting) ──────────────────────────────
//
// Nada aqui muda comportamento — só QUANDO cada módulo pesado chega ao browser.
//
// · WorldMap puxa a cadeia globe.tsx → land-outline.ts (~22 KB de geometria
//   Natural Earth) e roda `CONTORNO_TERRA.map(...)` no nível do módulo. Com
//   import estático tudo isso entrava no chunk inicial do dashboard, inclusive
//   para quem nunca rola até o mapa. O `dynamic` adia o download/parse para
//   depois do primeiro paint; a projeção em nível de módulo continua onde
//   sempre esteve (em world-map.tsx) e roda quando o chunk carrega.
// · Os quatro desenhos recharts foram extraídos para componentes em
//   `_components/grafico-*.tsx` pelo mesmo motivo: recharts era a maior fatia
//   do bundle desta tela. Toda a regra de dados (séries, guardas de vazio,
//   estados de erro, legendas) continua NESTA página — os componentes só
//   desenham o que recebem pronto.
// · `ssr: false` nos cinco: são peças puramente client-side (recharts mede o
//   container no browser; o mapa faz polling), e o HTML do servidor ficaria
//   maior sem valor de leitura.
// · Cada `loading` tem as MESMAS dimensões do desenho real (220px nos
//   gráficos; o esqueleto do mapa espelha o primeiro paint do WorldMap) para o
//   carregamento adiado não causar salto de layout.

const WorldMap = dynamic(
  () => import("../_components/world-map").then((m) => m.WorldMap),
  { ssr: false, loading: () => <EsqueletoMapa /> }
);

// Os quatro vêm do MESMO módulo (graficos-lazy) de propósito: cada origem
// diferente num dynamic() vira fronteira de chunk própria e copia o recharts
// inteiro para dentro (medido em produção: 4 × 348 KB). Mesma origem → o
// recharts entra uma vez, num chunk compartilhado com o /admin/analytics.
const GraficoReceitaMensal = dynamic(
  () => import("../_components/graficos-lazy").then((m) => m.GraficoReceitaMensal),
  { ssr: false, loading: () => <Skeleton className="h-[220px] w-full rounded-xl" /> }
);

const GraficoChurnMensal = dynamic(
  () => import("../_components/graficos-lazy").then((m) => m.GraficoChurnMensal),
  { ssr: false, loading: () => <Skeleton className="h-[220px] w-full rounded-xl" /> }
);

const GraficoReceitaPorPlano = dynamic(
  () => import("../_components/graficos-lazy").then((m) => m.GraficoReceitaPorPlano),
  { ssr: false, loading: () => <Skeleton className="h-[220px] w-full rounded-xl" /> }
);

const GraficoUsuariosAtivos = dynamic(
  () => import("../_components/graficos-lazy").then((m) => m.GraficoUsuariosAtivos),
  { ssr: false, loading: () => <Skeleton className="h-[220px] w-full rounded-xl" /> }
);

/**
 * Esqueleto exibido enquanto o chunk do WorldMap baixa.
 *
 * Espelha o primeiro paint do próprio WorldMap (Moldura + Esqueleto de
 * world-map.tsx): barra de controles à direita e a grade 2/3 + 1/3 com o mapa
 * em aspect-[2/1]. NÃO importa nada de world-map.tsx de propósito — um import
 * estático aqui puxaria o módulo (e a geometria) de volta para o chunk
 * inicial, desfazendo exatamente o que o `dynamic` acima compra.
 */
function EsqueletoMapa() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-3">
        {/* Mesma altura da barra de controles real (botão p-2 + ícone de 13). */}
        <div className="h-[29px] w-36 animate-pulse motion-reduce:animate-none bg-slate-800/60 rounded-full" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-slate-900/60 ring-1 ring-inset ring-slate-800/60 rounded-2xl p-5 space-y-4">
          <div className="h-2.5 w-40 animate-pulse motion-reduce:animate-none bg-slate-800/60 rounded" />
          <div className="h-12 w-32 animate-pulse motion-reduce:animate-none bg-slate-800/60 rounded-lg" />
          <div className="w-full aspect-[2/1] animate-pulse motion-reduce:animate-none bg-slate-800/60 rounded-2xl" />
        </div>
        <div className="bg-slate-900/60 ring-1 ring-inset ring-slate-800/60 rounded-2xl p-5 space-y-3">
          <div className="h-2.5 w-28 animate-pulse motion-reduce:animate-none bg-slate-800/60 rounded" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-11 animate-pulse motion-reduce:animate-none bg-slate-800/60 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Contrato da API ──────────────────────────────────────────────────────────

type Periodo = 7 | 30 | 90;

const PERIODOS: Periodo[] = [7, 30, 90];

interface LinhaPlano {
  plano: string;
  assinantes: number;
  receita: number;
}

interface PontoReceita {
  mes: string;
  receita: number;
  novosAssinantes: number;
  cancelados: number;
}

interface PontoChurn {
  mes: string;
  ativosInicio: number;
  cancelados: number;
  /** Percentual de 0 a 100 (não fração) — mesmo padrão de `taxaConversao`. */
  taxa: number;
}

interface Metricas {
  mrr: number;
  arr: number;
  arpu: number;
  assinantesAtivos: number;
  porPlano: LinhaPlano[];
  assinaturas: {
    total: number;
    trialsExpiradosNaoProcessados: number;
    trialsVencendo7d: number;
    inadimplentes: number;
  };
  usuarios: {
    total: number;
    ativos30d: number;
    inativos30d: number;
    novos7d: number;
    novos30d: number;
    onboardingIncompleto: number;
  };
  funil: {
    /** Só quem está DENTRO do prazo — vencidos saem para o campo próprio. */
    emTrial: number;
    vencidosNaoProcessados: number;
    converteram: number;
    expiraramSemConverter: number;
    /** null = nenhum caso resolvido ainda. Diferente de 0%. */
    taxaConversao: number | null;
  };
  integracoes: {
    total: number;
    ativas: number;
    comErro: number;
    workspacesSemBm: number;
  };
  receitaMensal: PontoReceita[];
  churn: PontoChurn[];
  onlineAgora: number;
  periodo: number;
  /** Nomes das agregações que FALHARAM. Vazio = todos os números são reais. */
  degradado: string[];
  geradoEm: string | null;
}

// ─── Mapa agregação → o que ela alimenta ──────────────────────────────────────
//
// As strings vêm literalmente de api/admin/metrics/route.ts (as chamadas a
// `ouEntao`). Ficam em constantes nomeadas para que uma renomeação no backend
// quebre num lugar só, e não em oito comparações espalhadas pelo JSX.

const AGREGACAO_MRR = "calcularMrr";                 // mrr, arr, arpu, assinantesAtivos, porPlano
const AGREGACAO_ASSINATURAS = "resumoAssinaturas";   // assinaturas.*
const AGREGACAO_USUARIOS = "metricasUsuarios";       // usuarios.*
const AGREGACAO_FUNIL = "funilTrial";                // funil.*
const AGREGACAO_INTEGRACOES = "saudeIntegracoes";    // integracoes.*
const AGREGACAO_RECEITA = "receitaMensal";           // receitaMensal[]
const AGREGACAO_CHURN = "churnMensal";               // churn[]
const AGREGACAO_ONLINE = "onlineAgora";              // onlineAgora

/** Nome legível de cada agregação, para o aviso do topo. */
const ROTULO_AGREGACAO: Record<string, string> = {
  [AGREGACAO_MRR]: "Receita (MRR, ARR, ARPU)",
  [AGREGACAO_ASSINATURAS]: "Assinaturas",
  [AGREGACAO_USUARIOS]: "Usuários",
  [AGREGACAO_FUNIL]: "Funil de trial",
  [AGREGACAO_INTEGRACOES]: "Integrações",
  [AGREGACAO_RECEITA]: "Receita mensal",
  [AGREGACAO_CHURN]: "Churn",
  // Fica no mapa por completude do contrato, mas na prática nunca chega ao
  // aviso: `onlineAgora` é filtrado em `degradadoVisivel` porque nenhum bloco
  // desta tela consome o campo (ver a nota lá).
  [AGREGACAO_ONLINE]: "Presença em tempo real",
};

// ─── Cores das séries desta tela ──────────────────────────────────────────────
//
// Planos NÃO entram aqui: quem responde por eles é `corDoPlano` de admin-ui.
// O que sobra são QUATRO séries de uma medida só, e cada uma tem justificativa:
//
//  · receita  → azul do produto (mesmo passo do slot categórico `start`; como é
//               série única num gráfico próprio, não há como colidir com plano);
//  · churn    → vermelho de estado, legítimo porque a série INTEIRA significa
//               "coisa ruim acontecendo" e vem sempre com título e rótulo;
//  · ativo    → o mesmo azul do produto, pelo mesmo motivo da receita;
//  · inativo  → cinza neutro, o mesmo passo do fallback de plano. Cinza não é
//               "série 4": é a ausência de destaque ao lado do azul de ativos.

const COR_RECEITA = "#3b82f6";
const COR_CHURN = COR_STATUS.grave;
/**
 * Azul do produto — NÃO `COR_STATUS.bom`.
 *
 * Era #10b981 e isso era uso proibido: cor de estado é RESERVADA e ali ela não
 * significava "saudável", só distinguia uma barra categórica da outra, que é
 * justamente o papel de uma paleta categórica. Contra o cinza de inativos o
 * azul separa com folga, inclusive em deuteranopia, e a legenda das duas barras
 * já nomeia cada uma (nenhuma depende de cor sozinha).
 */
const COR_ATIVO = "#3b82f6";
/** Reaproveita o cinza de admin-ui para existir UM cinza de "dado sem
 *  destaque" no painel inteiro — não é uma cor de série nova. */
const COR_INATIVO = COR_PLANO_PADRAO;

/** "premium" → "Premium". Plano desconhecido volta como veio (nunca vazio). */
function rotuloPlano(plano: string): string {
  if (typeof plano !== "string" || plano.trim() === "") return "—";
  return plano.charAt(0).toUpperCase() + plano.slice(1);
}

// O id do gradiente da área de receita e o chrome compartilhado dos gráficos
// (tooltip, eixos, grade, cursor) moram agora com os desenhos: o chrome em
// `_components/chart-chrome.ts` e o gradiente dentro de
// `_components/grafico-receita-mensal.tsx` — fora do chunk inicial desta tela.

/**
 * Respiro interno dos KPIs desta tela: um passo abaixo do padrão do CardKpi
 * (p-5 / gap-3.5). São DEZ cards em duas faixas empilhadas, e 8px de padding +
 * 4px de gap a menos por card devolvem ~20px de primeira dobra sem encostar no
 * conteúdo — o valor continua no mesmo corpo, porque quem manda no tamanho do
 * número é o CardKpi compartilhado e mexer nele reflowaria Contas, Assinaturas
 * e Analytics de lambuja. Passa pelo `cn` (tailwind-merge) do componente, então
 * `p-4` substitui o `p-5` em vez de empilhar duas classes conflitantes.
 *
 * NÃO vai no card do MRR: é o único com série no rodapé, e ela sangra até a
 * borda com `-mx-5 -mb-5` — a medida do padding PADRÃO. Com `p-4` sobrariam
 * 4px para fora da caixa, que o `overflow-hidden` do cartão cortaria bem no
 * ponto mais baixo da curva.
 */
const CLASSE_KPI = "p-4 gap-3";

// ─── Normalização da resposta ─────────────────────────────────────────────────
//
// Mesma estratégia de world-map.tsx: toda a defesa acontece aqui, uma vez, e
// depois deste ponto o render trata os tipos como garantidos — sem `?.` e sem
// `?? 0` espalhados pelo JSX. Um campo faltando aqui viraria "R$ NaN" na tela
// ou, pior, um `<Area>` com valores undefined que some sem erro no console.

type Registro = Record<string, unknown>;

function comoObjeto(v: unknown): Registro {
  return typeof v === "object" && v !== null ? (v as Registro) : {};
}

function comoLista(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/**
 * Converte para número finito ou devolve o padrão. Não usa `Number(v)` direto:
 * `Number(null)` é 0 e `Number(true)` é 1 — ambos finitos — então um campo nulo
 * passaria como zero legítimo em vez de cair no fallback.
 */
function num(v: unknown, padrao = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : padrao;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : padrao;
  }
  return padrao;
}

function texto(v: unknown, padrao: string): string {
  return typeof v === "string" && v.trim() !== "" ? v : padrao;
}

function normalizar(bruto: unknown): Metricas {
  const raiz = comoObjeto(bruto);
  const assinaturas = comoObjeto(raiz.assinaturas);
  const usuarios = comoObjeto(raiz.usuarios);
  const funil = comoObjeto(raiz.funil);
  const integracoes = comoObjeto(raiz.integracoes);

  return {
    mrr: num(raiz.mrr),
    arr: num(raiz.arr),
    arpu: num(raiz.arpu),
    assinantesAtivos: num(raiz.assinantesAtivos),
    porPlano: comoLista(raiz.porPlano)
      .map(comoObjeto)
      .map((p) => ({
        plano: texto(p.plano, "—"),
        assinantes: Math.max(0, num(p.assinantes)),
        receita: Math.max(0, num(p.receita)),
      })),
    assinaturas: {
      total: Math.max(0, num(assinaturas.total)),
      trialsExpiradosNaoProcessados: Math.max(0, num(assinaturas.trialsExpiradosNaoProcessados)),
      trialsVencendo7d: Math.max(0, num(assinaturas.trialsVencendo7d)),
      inadimplentes: Math.max(0, num(assinaturas.inadimplentes)),
    },
    usuarios: {
      total: Math.max(0, num(usuarios.total)),
      ativos30d: Math.max(0, num(usuarios.ativos30d)),
      inativos30d: Math.max(0, num(usuarios.inativos30d)),
      novos7d: Math.max(0, num(usuarios.novos7d)),
      novos30d: Math.max(0, num(usuarios.novos30d)),
      onboardingIncompleto: Math.max(0, num(usuarios.onboardingIncompleto)),
    },
    funil: {
      emTrial: Math.max(0, num(funil.emTrial)),
      vencidosNaoProcessados: Math.max(0, num(funil.vencidosNaoProcessados)),
      converteram: Math.max(0, num(funil.converteram)),
      expiraramSemConverter: Math.max(0, num(funil.expiraramSemConverter)),
      // Preserva null: `num()` devolveria 0 e o card exibiria "0,0%" como se
      // fosse medição, quando o que a API disse foi "não há o que medir".
      taxaConversao:
        typeof funil.taxaConversao === "number" && Number.isFinite(funil.taxaConversao)
          ? Math.max(0, funil.taxaConversao)
          : null,
    },
    integracoes: {
      total: Math.max(0, num(integracoes.total)),
      ativas: Math.max(0, num(integracoes.ativas)),
      comErro: Math.max(0, num(integracoes.comErro)),
      workspacesSemBm: Math.max(0, num(integracoes.workspacesSemBm)),
    },
    receitaMensal: comoLista(raiz.receitaMensal)
      .map(comoObjeto)
      .map((p) => ({
        mes: texto(p.mes, ""),
        receita: num(p.receita),
        novosAssinantes: num(p.novosAssinantes),
        cancelados: num(p.cancelados),
      })),
    churn: comoLista(raiz.churn)
      .map(comoObjeto)
      .map((p) => ({
        mes: texto(p.mes, ""),
        ativosInicio: num(p.ativosInicio),
        cancelados: num(p.cancelados),
        taxa: num(p.taxa),
      })),
    onlineAgora: Math.max(0, num(raiz.onlineAgora)),
    periodo: num(raiz.periodo, 30),
    degradado: comoLista(raiz.degradado).filter((x): x is string => typeof x === "string"),
    geradoEm: typeof raiz.geradoEm === "string" ? raiz.geradoEm : null,
  };
}

// ─── Formatadores locais dos gráficos ─────────────────────────────────────────

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * "2026-02" → "fev/26".
 *
 * Fatiar a string em vez de `new Date("2026-02")` é deliberado: o JS interpreta
 * a forma curta ISO como UTC e, num fuso negativo (Brasília = UTC-3), o Date
 * cai no último instante do mês ANTERIOR — o eixo mostraria "jan/26" para o
 * ponto de fevereiro. Bug silencioso e difícil de notar num gráfico.
 */
function rotuloMes(mes: string): string {
  if (typeof mes !== "string") return "—";
  const partes = mes.split("-");
  const ano = partes[0];
  const indice = Number(partes[1]) - 1;
  if (!ano || !Number.isInteger(indice) || indice < 0 || indice > 11) return mes || "—";
  return `${MESES_CURTOS[indice]}/${ano.slice(2)}`;
}

// ─── Peças locais desta tela ──────────────────────────────────────────────────

interface ItemLegenda {
  chave: string;
  /**
   * Cor da marca correspondente NO GRÁFICO. Opcional de propósito: um item que
   * é só número de apoio (não tem traço, fatia nem barra desenhada) fica SEM
   * cor. Pintar uma bolinha para ele prometeria uma série que o leitor vai
   * procurar e não achar — e reusaria um swatch que já nomeia outra entidade
   * em outro card da mesma grade.
   */
  cor?: string;
  nome: string;
  /** Contexto curto ao lado do nome (ex.: "12 assinantes", "último mês"). */
  nota?: string;
  valor: string;
}

/**
 * Rodapé-legenda dos gráficos: ponto de cor (quando há série) + nome + valor.
 *
 * É a codificação secundária que a paleta EXIGE. `premium` (#059669) e `plus`
 * (#ec4899) ficam num ΔE de fronteira quando comparados fora dos pares
 * adjacentes; só é legítimo usá-los juntos porque nenhuma fatia depende de cor
 * sozinha para ser identificada. Se esta legenda sumir, a rosca fica ilegal.
 *
 * O texto usa cor de TEXTO, nunca a cor da série — quem carrega a identidade é
 * o ponto ao lado (com anel na cor da superfície, para não borrar no fundo).
 */
function LegendaGrafico({ itens }: { itens: ItemLegenda[] }) {
  return (
    <ul className="space-y-2">
      {itens.map((i) => (
        <li key={i.chave} className="flex items-center gap-2.5 min-w-0">
          {i.cor ? (
            <span
              aria-hidden
              className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-slate-900/80"
              style={{ background: i.cor }}
            />
          ) : (
            // Espaçador do mesmo tamanho da bolinha: o item sem série continua
            // com o nome alinhado na coluna dos demais.
            <span aria-hidden className="w-2.5 h-2.5 shrink-0" />
          )}
          <span className="text-[11px] font-bold text-slate-300 truncate">{i.nome}</span>
          {i.nota && <span className="text-[10px] text-slate-500 truncate">{i.nota}</span>}
          <span className="ml-auto text-[11px] font-bold text-slate-100 tabular-nums shrink-0">{i.valor}</span>
        </li>
      ))}
    </ul>
  );
}

function CardGrafico({
  titulo,
  descricao,
  icone,
  rodape,
  children,
}: {
  titulo: string;
  descricao?: string;
  icone?: ReactNode;
  rodape?: ReactNode;
  children: ReactNode;
}) {
  return (
    // `min-w-0` é obrigatório: sem ele o ResponsiveContainer do recharts empurra
    // a coluna da grade além da largura disponível e a página ganha scroll
    // horizontal em telas estreitas.
    // `h-full flex flex-col` + `mt-auto` no rodapé mantêm os quatro cards da
    // grade com a mesma altura e as legendas alinhadas na base, mesmo quando um
    // rodapé tem quatro linhas e o vizinho tem uma.
    <div className="glass-panel rounded-2xl p-5 min-w-0 h-full flex flex-col ring-1 ring-slate-100/[0.03] transition-shadow duration-300 hover:shadow-xl hover:shadow-slate-950/40">
      {/* mb-4 (e não 5): o título já está separado do desenho pelo próprio
          respiro do gráfico, que tem 4px de margem no topo. */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[11px] font-black text-slate-300 uppercase tracking-widest">{titulo}</h3>
          {descricao && <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{descricao}</p>}
        </div>
        {icone && (
          <div className="w-8 h-8 rounded-xl bg-slate-800/70 ring-1 ring-inset ring-slate-700/60 text-slate-400 flex items-center justify-center shrink-0">
            {icone}
          </div>
        )}
      </div>

      <div className="min-w-0">{children}</div>

      {rodape && <div className="mt-auto pt-4 border-t border-slate-700/50">{rodape}</div>}
    </div>
  );
}

/**
 * Substitui o gráfico quando a agregação que o alimenta falhou no backend.
 * Uma série zerada por erro desenharia uma linha reta no chão — visualmente
 * idêntica a "não houve receita". O aviso é a única forma honesta.
 */
function AvisoIndisponivel({ mensagem }: { mensagem: string }) {
  return (
    <div className="h-[220px] rounded-xl border border-amber-500/20 bg-amber-500/5 flex flex-col items-center justify-center text-center gap-2 px-6">
      <AlertTriangle size={18} className="text-amber-400" />
      <p className="text-xs font-bold text-amber-400">Indicador indisponível</p>
      <p className="text-[10px] text-slate-500 max-w-xs leading-relaxed">{mensagem}</p>
    </div>
  );
}

/**
 * Piso de altura para vazio/skeleton: mantém os quatro cards da grade
 * alinhados. É `min-h`, não `h`: o EstadoVazio de admin-ui passa de 220px
 * (py-16 + ícone de 56px + título e descrição) e, com altura travada, o
 * excedente vazaria para fora do cartão nos dois sentidos.
 */
function MolduraGrafico({ children }: { children: ReactNode }) {
  return <div className="min-h-[220px] flex items-center justify-center">{children}</div>;
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const [periodo, setPeriodo] = useState<Periodo>(30);
  const [dados, setDados] = useState<Metricas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  /** Requisição em voo, para cancelar quando o período muda ou ao desmontar. */
  const abortRef = useRef<AbortController | null>(null);

  const buscar = useCallback(async () => {
    // Cancela a chamada anterior: trocando de período rápido, duas respostas
    // podem voltar fora de ordem e a mais VELHA sobrescrever a mais nova.
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setCarregando(true);
    // Limpar o erro aqui é o que dá feedback ao "Tentar novamente": sem isso,
    // numa falha de primeira carga o EstadoErro continuava idêntico durante a
    // retentativa inteira e o clique parecia não ter surtido efeito.
    setErro(null);
    try {
      // `no-store`: painel financeiro não pode ser servido do cache do Next nem
      // de proxy no caminho — o admin abre a tela para ver o estado de AGORA.
      const res = await fetch(`/api/admin/metrics?periodo=${periodo}`, {
        cache: "no-store",
        signal: ctrl.signal,
      });
      if (!res.ok) {
        throw new Error(
          res.status === 401
            ? "Sessão do admin expirada. Faça login novamente."
            : `A API respondeu ${res.status}.`
        );
      }
      setDados(normalizar(await res.json()));
      setErro(null);
    } catch (err) {
      // Abort é troca de período ou desmontagem — nunca falha de rede.
      if (ctrl.signal.aborted) return;
      setErro(err instanceof Error ? err.message : "Falha de rede.");
    } finally {
      if (!ctrl.signal.aborted) setCarregando(false);
    }
  }, [periodo]);

  useEffect(() => {
    void buscar();
    // Sem este cleanup o fetch pendente resolveria num componente desmontado.
    return () => abortRef.current?.abort();
  }, [buscar]);

  /** Set para consulta O(1) — o JSX pergunta por `degradado` umas 12 vezes. */
  const falhas = useMemo(() => new Set(dados?.degradado ?? []), [dados]);

  /**
   * Degradações com CONSUMIDOR nesta tela — é isso que o aviso do topo anuncia.
   *
   * `onlineAgora` fica de fora: o card que lia esse campo foi removido de
   * propósito (a presença é do WorldMap, que busca /api/admin/realtime e trata
   * o próprio erro). Anunciar a falha dele mandava o operador procurar um card
   * "indisponível" que não existe — alarme sobre um número que a tela nem usa,
   * logo acima de um mapa mostrando a presença normalmente.
   */
  const degradadoVisivel = useMemo(
    () => (dados?.degradado ?? []).filter((d) => d !== AGREGACAO_ONLINE),
    [dados]
  );

  const falhouMrr = falhas.has(AGREGACAO_MRR);
  const falhouAssinaturas = falhas.has(AGREGACAO_ASSINATURAS);
  const falhouUsuarios = falhas.has(AGREGACAO_USUARIOS);
  const falhouFunil = falhas.has(AGREGACAO_FUNIL);
  const falhouIntegracoes = falhas.has(AGREGACAO_INTEGRACOES);
  const falhouReceita = falhas.has(AGREGACAO_RECEITA);
  const falhouChurn = falhas.has(AGREGACAO_CHURN);

  /** Skeleton dos KPIs (e das legendas dos gráficos): só na PRIMEIRA carga.
   *  Trocar o período mantém os números antigos na tela — o backend só muda as
   *  séries com o período — e sinaliza o refetch girando o ícone do botão;
   *  piscar a tela inteira seria pior. Os quatro DESENHOS são a exceção e usam
   *  `carregando`, porque são exatamente o que o filtro muda (nota na grade). */
  const primeiraCarga = carregando && dados === null;

  /**
   * Falhou e não há NADA em tela. Precisa ser um booleano próprio (e não só o
   * ternário dos KPIs) porque os gráficos moram num bloco separado do dos
   * cards — o WorldMap, com fonte de dados própria, fecha a página depois
   * deles. Sem esta guarda os gráficos cairiam nos estados vazios ("Sem
   * receita no histórico"), que afirmam um fato sobre o negócio quando na
   * verdade a requisição nem chegou a voltar.
   */
  const semDados = erro !== null && dados === null;

  // ─── Séries dos gráficos ────────────────────────────────────────────────────

  const serieReceita = useMemo(
    () => (dados?.receitaMensal ?? []).map((p) => ({ ...p, rotulo: rotuloMes(p.mes) })),
    [dados]
  );

  const serieChurn = useMemo(
    () => (dados?.churn ?? []).map((p) => ({ ...p, rotulo: rotuloMes(p.mes) })),
    [dados]
  );

  const seriePlano = useMemo(
    () =>
      (dados?.porPlano ?? []).map((p) => ({
        ...p,
        rotulo: rotuloPlano(p.plano),
        cor: corDoPlano(p.plano),
      })),
    [dados]
  );

  // Tipo explícito no useMemo: a função tem dois `return` (o `[]` e a lista
  // montada) e, sem ele, o TS inferiria a união `never[] | {...}[]` — que
  // atrapalha o `.reduce` mais abaixo.
  const serieUsuarios = useMemo<Array<{ rotulo: string; quantidade: number; cor: string }>>(() => {
    const u = dados?.usuarios;
    if (!u) return [];
    return [
      { rotulo: "Ativos (30d)", quantidade: u.ativos30d, cor: COR_ATIVO },
      { rotulo: "Inativos (30d)", quantidade: u.inativos30d, cor: COR_INATIVO },
    ];
  }, [dados]);

  // Série "toda zerada" não vira gráfico: uma linha colada no eixo não informa
  // nada e ainda parece um bug. Cada card cai no EstadoVazio explicando o porquê.
  const receitaVazia = serieReceita.length === 0 || serieReceita.every((p) => p.receita <= 0);
  // Guarda pelo campo que o gráfico DESENHA (`taxa`), e não por taxa+cancelados:
  // `churnMensal` devolve taxa 0 quando `ativosInicio` é 0 mesmo com cancelados
  // > 0 (mês sem base paga no início não gera churn — cenário realista numa base
  // de 2 pagantes). Com `&&` a série passava pela guarda e o LineChart desenhava
  // uma reta colada no eixo. Mesmo ajuste já feito em `planoVazio` logo abaixo.
  const churnVazio = serieChurn.length === 0 || serieChurn.every((p) => p.taxa <= 0);
  // O guarda olha só `receita` porque é o único campo que a rosca desenha.
  // Com `&&` havia um estado alcançável de rosca em branco: PATCH aceita
  // plano e status independentes, então `plano: "trial" + status: "active"` é
  // gravável e produz assinantes > 0 com receita 0 em todos os planos.
  const planoVazio = seriePlano.length === 0 || seriePlano.every((p) => p.receita <= 0);
  const totalUsuariosGrafico = serieUsuarios.reduce((s, u) => s + u.quantidade, 0);
  const usuariosVazio = totalUsuariosGrafico <= 0;

  const percentualAtivos =
    totalUsuariosGrafico > 0 && dados
      ? (dados.usuarios.ativos30d / totalUsuariosGrafico) * 100
      : 0;

  const mesesReceita = serieReceita.length;
  const mesesChurn = serieChurn.length;

  // Último ponto de cada série: é o rótulo direto de cada card (um valor, não um
  // número em cima de todo ponto). Leitura direta do array — nada agregado.
  const ultimoReceita = mesesReceita > 0 ? serieReceita[mesesReceita - 1] : null;
  const ultimoChurn = mesesChurn > 0 ? serieChurn[mesesChurn - 1] : null;

  /** Soma das fatias — é literalmente o que a rosca inteira representa. */
  const totalReceitaPlanos = seriePlano.reduce((s, p) => s + p.receita, 0);

  /** Índice do período ativo: posiciona a pílula do segmented control. */
  const indicePeriodo = Math.max(0, PERIODOS.indexOf(periodo));

  return (
    // `space-y-6` (e não 8) é o ritmo que Contas, Assinaturas, Analytics e
    // Financeiro já usam: era esta tela a fora do padrão, e os 8px extras
    // apareciam cinco vezes antes do primeiro gráfico.
    <div className="p-6 space-y-6">
      {/* ─── Cabeçalho ───────────────────────────────────────────────────────
          Mesma anatomia de Contas e Assinaturas: ladrilho com o ÍCONE DA
          NAVEGAÇÃO (o mesmo `LayoutDashboard` que a sidebar acende), h1 em
          text-xl e UMA linha de apoio.

          O cabeçalho anterior gastava ~120px de altura antes de qualquer dado:
          olho-mágico "Painel administrativo" (que a sidebar já marca em azul),
          h1 em text-4xl com gradiente e mais duas linhas empilhadas. Numa tela
          cujo problema é a densidade, era um sexto da primeira dobra para dizer
          o nome da página.

          O carimbo de atualização virou sufixo da linha de apoio — mesmos TRÊS
          estados de antes, mesma função `formatarDataHora`. */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-blue-500/10 ring-1 ring-inset ring-blue-500/25 text-blue-400 grid place-items-center shrink-0">
            <LayoutDashboard size={19} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black text-slate-100 tracking-tight leading-tight">Dashboard</h1>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-2xl">
              Receita, base de clientes e saúde operacional do Dashfy em uma tela só.
              {/* Três estados, não dois: quando a primeira carga falha, `dados`
                  segue null e o ramo antigo escrevia "Atualizado em —" logo
                  acima do erro, afirmando uma atualização que nunca houve. */}
              <span className="tabular-nums">
                {" · "}
                {primeiraCarga
                  ? "carregando indicadores…"
                  : dados
                    ? `atualizado em ${formatarDataHora(dados.geradoEm)}`
                    : "nenhuma leitura concluída"}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Grupo de escolha única: sem role/aria-pressed, um leitor de tela
              anuncia três botões idênticos e o operador não descobre qual
              janela está aplicada — a diferença hoje é só de cor.

              A pílula é um irmão absoluto (não um `bg-*` no botão ativo) para
              deslizar entre as opções: as três células têm a MESMA largura
              (grid-cols-3, sem gap), então translateX de 100% = exatamente uma
              célula, sem medir nada no DOM. */}
          <div
            role="group"
            aria-label="Período dos gráficos históricos"
            // Sombra interna escrita como valor arbitrário (e não `shadow-inner`,
            // que não existe mais no Tailwind 4): é o que dá o "trilho" fundo do
            // segmented control, com a pílula parecendo pousada em cima.
            className="relative grid grid-cols-3 rounded-xl bg-slate-900/70 ring-1 ring-inset ring-slate-700/50 p-1 shadow-[inset_0_1px_3px_rgba(2,6,23,0.55)]"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-1 left-1 rounded-lg bg-blue-500/15 ring-1 ring-inset ring-blue-400/35 shadow-[0_0_18px_-4px_rgba(59,130,246,0.75)] transition-transform duration-300 ease-out"
              style={{
                width: "calc((100% - 0.5rem) / 3)",
                transform: `translateX(${indicePeriodo * 100}%)`,
              }}
            />
            {PERIODOS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={periodo === p}
                onClick={() => setPeriodo(p)}
                className={cn(
                  "relative z-10 px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors duration-200",
                  periodo === p ? "text-blue-200" : "text-slate-500 hover:text-slate-300"
                )}
              >
                {p} dias
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void buscar()}
            disabled={carregando}
            title="Recarregar indicadores"
            aria-label="Recarregar indicadores"
            className="p-2.5 rounded-xl bg-slate-900/70 ring-1 ring-inset ring-slate-700/50 text-slate-400 hover:text-slate-200 hover:ring-slate-500/60 transition-[color,box-shadow] duration-200 disabled:opacity-60"
          >
            <RefreshCw size={14} className={carregando ? "animate-spin" : undefined} />
          </button>
        </div>
      </header>

      {/*
        Aviso de degradação. Aparece ANTES dos cards para que o operador saiba,
        de cara, que a tela está incompleta — e não descubra card a card.
      */}
      {dados && degradadoVisivel.length > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-amber-400">
              {degradadoVisivel.length === 1
                ? "1 indicador não pôde ser calculado"
                : `${degradadoVisivel.length} indicadores não puderam ser calculados`}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              Falharam: {degradadoVisivel.map((d) => ROTULO_AGREGACAO[d] ?? d).join(", ")}. Os cards
              afetados aparecem como “indisponível” — nenhum valor zerado por erro é exibido como real.
            </p>
          </div>
        </div>
      )}

      {/* Falha no refetch com dados antigos em tela: mantém os números e avisa
          que estão velhos. Piscar para vazio a cada blip de rede seria pior. */}
      {erro && dados && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 flex flex-wrap items-center gap-3">
          <AlertTriangle size={16} className="text-rose-400 shrink-0" />
          <p className="text-[11px] text-slate-300 flex-1 min-w-[220px] leading-relaxed">
            Não foi possível atualizar: {erro} Os números abaixo são da última leitura bem-sucedida
            {dados.geradoEm ? ` (${formatarDataHora(dados.geradoEm)})` : ""}.
          </p>
          <button
            type="button"
            onClick={() => void buscar()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition-colors"
          >
            <RefreshCw size={12} />
            Tentar novamente
          </button>
        </div>
      )}

      {semDados ? (
        // Sem nenhum dado não há painel: estado terminal com caminho de volta.
        // O WorldMap continua abaixo porque tem fonte de dados própria
        // (/api/admin/realtime) e trata o próprio erro.
        <EstadoErro mensagem={erro ?? undefined} onTentarNovamente={() => void buscar()} />
      ) : (
        <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-x-4 gap-y-3">
          {/* ─── Faixa única de KPI ───────────────────────────────────────
              Eram duas <section> irmãs, cada uma com <Secao> e grade próprias,
              afastadas pelos 32px do `space-y` da página: ~70px de moldura
              entre as duas faixas, no trecho mais caro da tela. Agora é UMA
              grade de cinco colunas com os dez cards, e cada rótulo ocupa uma
              linha inteira (`col-span-full`). De quebra, as colunas das duas
              faixas passam a ser as MESMAS — antes eram duas grades
              independentes que só se alinhavam por terem a mesma largura.

              A separação semântica não sumiu: ficou explícita. Antes quem
              marcava a fronteira era espaço em branco; agora o segundo rótulo
              vem com fio de borda em cima e mais ar acima do que abaixo, então
              ele se lê colado nos cinco cards que apresenta, e não solto entre
              os dois grupos.

              `col-span-full` numa grade de auto-placement sempre começa linha
              nova, então a ordem "rótulo → seus cinco cards" vale nos três
              breakpoints — inclusive em `grid-cols-2` e `md:grid-cols-3`, onde
              os cinco cards de uma faixa não fecham a última linha.

              gap-y menor que gap-x (12 × 16) de propósito: a folga horizontal é
              o que separa um cartão do vizinho da MESMA faixa; a vertical só
              empilha bandas que o rótulo já separa. */}
          <div className="col-span-full">
            <Secao
              titulo="Receita e base"
              descricao="Foto do estado atual — estes números não mudam com o período selecionado."
            />
          </div>

          {/* 5 cards e não 6: a presença ("online agora") é do WorldMap.
              Havia um CardKpi aqui lendo `onlineAgora` de /api/admin/metrics,
              que só atualiza quando o admin recarrega, enquanto o mapa lê
              /api/admin/realtime a cada 10s. Mesma pergunta, duas respostas na
              mesma dobra, divergindo depois do primeiro minuto — num painel
              cujo princípio é nunca exibir número que possa ser mal lido, isso
              custa mais confiança do que o card entrega de informação.

              O MRR é também o único card sem `CLASSE_KPI`: a série do rodapé
              sangra na medida do padding padrão (ver a nota da constante). */}
          <CardKpi
            titulo="MRR"
            valor={formatarMoeda(dados?.mrr)}
            sufixo="/mês"
            icone={<DollarSign size={16} />}
            destaque
            indisponivel={falhouMrr}
            carregando={primeiraCarga}
            // SEM sparkline de propósito. Aqui vinha a série de `receitaMensal`,
            // que responde uma pergunta DIFERENTE do valor grande logo acima:
            // MRR é a foto de hoje (só assinaturas "active"), enquanto a série
            // conta quem pagou qualquer parte do mês — inclusive quem caiu no
            // meio dele. Com os dados de hoje isso dá R$ 599,80 no número e
            // R$ 899,70 no último ponto da curva: 50% de diferença dentro do
            // mesmo cartão, sem nada avisando que são medidas distintas.
            // A série continua íntegra no gráfico "Receita mensal", onde tem
            // eixo, rótulo e contexto para ser lida pelo que é.
          />
          <CardKpi
            titulo="ARR"
            valor={formatarMoeda(dados?.arr)}
            sufixo="/ano"
            icone={<TrendingUp size={16} />}
            indisponivel={falhouMrr}
            carregando={primeiraCarga}
            className={CLASSE_KPI}
          />
          {/* ARPU = MRR ÷ assinantesAtivos. Com denominador zero a lib devolve
              0 (divisão protegida), e "R$ 0,00" afirmaria um ticket médio de
              zero — quando o correto é que não há base para calcular ticket
              nenhum. Sem assinante ativo, o card fica indisponível. */}
          <CardKpi
            titulo="ARPU"
            valor={formatarMoeda(dados?.arpu)}
            sufixo="/assinante"
            icone={<CreditCard size={16} />}
            indisponivel={falhouMrr || (dados?.assinantesAtivos ?? 0) === 0}
            carregando={primeiraCarga}
            className={CLASSE_KPI}
          />
          <CardKpi
            titulo="Assinantes ativos"
            valor={dados?.assinantesAtivos}
            // "com assinatura ativa" e não "pagantes": a query por trás filtra
            // apenas `status = "active"`, sem olhar o plano. Como o PATCH de
            // assinaturas aceitava gravar plano e status de forma independente,
            // um `trial + active` entraria nesta contagem contribuindo R$ 0,00
            // para o MRR — e o rótulo "pagantes" viraria mentira. O Financeiro
            // já usava a formulação correta; as duas telas agora concordam.
            sufixo="com assinatura ativa"
            icone={<UserCheck size={16} />}
            indisponivel={falhouMrr}
            carregando={primeiraCarga}
            className={CLASSE_KPI}
          />
          <CardKpi
            titulo="Usuários totais"
            valor={dados?.usuarios.total}
            sufixo={dados ? `+${formatarNumero(dados.usuarios.novos7d)} em 7d` : undefined}
            icone={<Users size={16} />}
            indisponivel={falhouUsuarios}
            carregando={primeiraCarga}
            className={CLASSE_KPI}
          />

          {/* ─── Segunda faixa: funil e alarmes ───────────────────────────
              O tom de cada card vem do CardKpi compartilhado (`tom`), que pinta
              anel/ícone/brilho e deixa o VALOR em slate-100. Antes esta tela
              tinha um `CardAlerta` próprio que coloria o número inteiro — ficou
              redundante e saiu: um número em âmbar é o tipo de identidade por
              cor sozinha que a diretriz proíbe. */}
          <div className="col-span-full mt-1 pt-3 border-t border-slate-700/50">
            <Secao
              titulo="Funil e alarmes"
              descricao="Trial vencido continua em “trialing” até alguém processar — é dinheiro parado. Integração com erro significa cliente vendo dado desatualizado."
            />
          </div>

          {/* "Em trial" agora conta só quem está DENTRO do prazo. Antes contava
              todo `status = "trialing"`, o que somava os vencidos que ninguém
              processou: em produção o card dizia 22 quando havia 7 trials vivos
              — e o card de alarme ao lado já denunciava os outros 15. Os dois
              números conviviam na mesma faixa se contradizendo. */}
          <CardKpi
            titulo="Em trial"
            valor={dados?.funil.emTrial}
            sufixo="dentro do prazo"
            icone={<Clock size={16} />}
            indisponivel={falhouFunil}
            carregando={primeiraCarga}
            className={CLASSE_KPI}
          />
          {/* SEM `tom`: o acento verde estava fixo aqui e afirmava "saudável"
              sem nunca olhar o valor. Todos os outros toms desta tela saem do
              dado, e para conversão não existe limiar acordado com o negócio;
              inventar um corte aqui seria trocar um acento falso por outro.

              `taxaConversao` agora vem `null` quando não há NENHUM caso
              resolvido — e null vira `indisponivel`, não "0,0%". Zero por cento
              afirma que ninguém converte; a ausência de casos resolvidos é
              outra coisa. */}
          <CardKpi
            titulo="Taxa de conversão"
            valor={
              dados?.funil.taxaConversao === null
                ? undefined
                : formatarPercentual(dados?.funil.taxaConversao)
            }
            sufixo={
              dados && dados.funil.taxaConversao !== null
                ? `${formatarNumero(dados.funil.converteram)} de ${formatarNumero(
                    dados.funil.converteram +
                      dados.funil.expiraramSemConverter +
                      dados.funil.vencidosNaoProcessados,
                  )} resolvidos`
                : "trial → pago"
            }
            icone={<Target size={16} />}
            indisponivel={falhouFunil || dados?.funil.taxaConversao === null}
            carregando={primeiraCarga}
            className={CLASSE_KPI}
          />

          {/* A expiração do trial é preguiçosa (só roda quando o usuário
              volta). Quem nunca mais voltou fica preso em "trialing" e some
              do radar de cobrança. Zero é a situação saudável — aí o card
              volta ao tom neutro sozinho. */}
          <CardKpi
            titulo="Trials vencidos"
            valor={dados?.assinaturas.trialsExpiradosNaoProcessados}
            sufixo="não processados"
            icone={<AlertTriangle size={16} />}
            tom={
              !falhouAssinaturas && (dados?.assinaturas.trialsExpiradosNaoProcessados ?? 0) > 0
                ? "atencao"
                : "neutro"
            }
            indisponivel={falhouAssinaturas}
            carregando={primeiraCarga}
            className={CLASSE_KPI}
          />

          <CardKpi
            titulo="Inadimplentes"
            valor={dados?.assinaturas.inadimplentes}
            sufixo="assinaturas"
            icone={<CreditCard size={16} />}
            indisponivel={falhouAssinaturas}
            carregando={primeiraCarga}
            className={CLASSE_KPI}
          />

          {/* Integração com erro = conta de anúncio fora do portfólio; o
              cliente final vê dados velhos sem saber. */}
          <CardKpi
            titulo="Integrações com erro"
            valor={dados?.integracoes.comErro}
            sufixo={dados ? `de ${formatarNumero(dados.integracoes.total)}` : undefined}
            icone={<Plug size={16} />}
            tom={!falhouIntegracoes && (dados?.integracoes.comErro ?? 0) > 0 ? "grave" : "neutro"}
            indisponivel={falhouIntegracoes}
            carregando={primeiraCarga}
            className={CLASSE_KPI}
          />
        </section>
      )}

      {/* ─── Gráficos ──────────────────────────────────────────────────────
          Sobem para logo depois dos KPIs (antes vinham DEPOIS da presença).

          Motivo: os quatro gráficos são o histórico dos MESMOS números da faixa
          acima — MRR → receita mensal, assinantes → receita por plano, usuários
          → ativos vs inativos — e vêm da MESMA requisição. Ler "MRR de hoje" e
          logo em seguida "como o MRR chegou aqui" é uma leitura só; enfiar um
          bloco de outra fonte de dados no meio quebrava a frase e empurrava os
          gráficos para a terceira dobra.

          Some-se que o seletor de período mora no cabeçalho e é o ÚNICO
          controle da tela: ele agora fica a uma distância curta do que
          realmente comanda. */}
      {!semDados && (
        <section className="space-y-3">
          <Secao
            titulo="Séries históricas"
            descricao="Os únicos blocos da tela que respondem ao período selecionado no topo."
            acao={
              // O período ECOADO pela resposta, nunca o estado local: a pílula
              // fica colada nos quatro gráficos e precisa falar da janela que
              // eles estão desenhando. Clicar em "90 dias" muda o estado na
              // hora, mas as séries em tela continuam sendo as da janela
              // anterior até o fetch voltar (e "?periodo=abc" cai em 30 no
              // servidor — a rota ecoa `periodo` exatamente para isto).
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-blue-300 bg-blue-500/10 ring-1 ring-inset ring-blue-500/25 px-2.5 py-1 rounded-full tabular-nums">
                Janela de {dados?.periodo ?? periodo} dias
              </span>
            }
          />

          {/* Os quatro desenhos abaixo voltam ao skeleton em QUALQUER carga em
              voo (`carregando`), e não só na primeira: são os únicos blocos que
              respondem ao período, então segurar a série anterior enquanto a
              requisição de outra janela está a caminho mostraria 6 meses de "30
              dias" sob o rótulo de 90. Os KPIs continuam em `primeiraCarga` de
              propósito — não mudam com o filtro, e piscá-los a cada troca seria
              ruído puro.

              Os rodapés-legenda também seguem em `primeiraCarga`: cada item
              nomeia o mês a que se refere ("último mês · fev/26"), então o valor
              da leitura anterior não mente sobre a janela; sumir com eles a cada
              refetch encolheria o cartão e faria a grade inteira saltar. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
            {/* Receita mensal */}
            <CardGrafico
              titulo="Receita mensal"
              icone={<DollarSign size={15} />}
              descricao={
                mesesReceita > 0
                  ? `Últimos ${mesesReceita} ${mesesReceita === 1 ? "mês" : "meses"} · reconstruída por aproximação`
                  : "Histórico aproximado de receita"
              }
              rodape={
                !primeiraCarga && !falhouReceita && !receitaVazia && ultimoReceita ? (
                  <LegendaGrafico
                    itens={[
                      {
                        chave: "receita",
                        cor: COR_RECEITA,
                        nome: "Receita",
                        nota: `último mês · ${ultimoReceita.rotulo}`,
                        valor: formatarMoeda(ultimoReceita.receita),
                      },
                    ]}
                  />
                ) : undefined
              }
            >
              {carregando ? (
                <Skeleton className="h-[220px] w-full rounded-xl" />
              ) : falhouReceita ? (
                <AvisoIndisponivel mensagem="A agregação de receita mensal falhou nesta leitura. Recarregue para tentar de novo." />
              ) : receitaVazia ? (
                <MolduraGrafico>
                  <EstadoVazio
                    icone={<DollarSign size={20} />}
                    titulo="Sem receita no histórico"
                    descricao="Nenhum mês da janela registrou receita. Assim que houver assinatura paga, a curva aparece aqui."
                  />
                </MolduraGrafico>
              ) : (
                // O desenho em si vive em `grafico-receita-mensal.tsx` e chega
                // via `next/dynamic` — só o QUANDO do carregamento mudou.
                <GraficoReceitaMensal serie={serieReceita} cor={COR_RECEITA} />
              )}
            </CardGrafico>

            {/* Churn */}
            <CardGrafico
              titulo="Churn mensal"
              icone={<TrendingUp size={15} />}
              descricao={
                mesesChurn > 0
                  ? `Últimos ${mesesChurn} ${mesesChurn === 1 ? "mês" : "meses"} · só planos pagos`
                  : "Cancelamentos sobre a base paga"
              }
              rodape={
                !primeiraCarga && !falhouChurn && !churnVazio && ultimoChurn ? (
                  <LegendaGrafico
                    itens={[
                      {
                        chave: "churn",
                        cor: COR_CHURN,
                        nome: "Churn",
                        nota: `último mês · ${ultimoChurn.rotulo}`,
                        valor: formatarPercentual(ultimoChurn.taxa),
                      },
                      {
                        // SEM cor: `cancelados` é contagem, e o gráfico ao lado
                        // desenha só a taxa. Uma bolinha aqui anunciaria uma
                        // segunda linha inexistente (e repetiria o cinza que já
                        // identifica "Inativos (30d)" no card vizinho).
                        chave: "cancelados",
                        nome: "Cancelamentos",
                        nota: `em ${ultimoChurn.rotulo}`,
                        valor: formatarNumero(ultimoChurn.cancelados),
                      },
                    ]}
                  />
                ) : undefined
              }
            >
              {carregando ? (
                <Skeleton className="h-[220px] w-full rounded-xl" />
              ) : falhouChurn ? (
                <AvisoIndisponivel mensagem="A agregação de churn falhou nesta leitura. Recarregue para tentar de novo." />
              ) : churnVazio ? (
                <MolduraGrafico>
                  <EstadoVazio
                    icone={<UserCheck size={20} />}
                    // A guarda olha só a taxa, então este estado é alcançável
                    // COM cancelamentos existindo — a cópia não pode afirmar
                    // que ninguém cancelou.
                    titulo="Sem churn no período"
                    descricao="A taxa ficou em zero em todos os meses da janela — cancelamentos em meses sem base paga no início não geram churn."
                  />
                </MolduraGrafico>
              ) : (
                <GraficoChurnMensal serie={serieChurn} cor={COR_CHURN} />
              )}
            </CardGrafico>

            {/* Distribuição por plano */}
            <CardGrafico
              titulo="Receita por plano"
              icone={<Layers size={15} />}
              descricao="Assinaturas pagas ativas hoje"
              rodape={
                !primeiraCarga && !falhouMrr && !planoVazio ? (
                  <LegendaGrafico
                    itens={seriePlano.map((p) => ({
                      chave: p.plano,
                      cor: p.cor,
                      nome: p.rotulo,
                      nota: `${formatarNumero(p.assinantes)} ${p.assinantes === 1 ? "assinante" : "assinantes"}`,
                      valor: formatarMoeda(p.receita),
                    }))}
                  />
                ) : undefined
              }
            >
              {carregando ? (
                <Skeleton className="h-[220px] w-full rounded-xl" />
              ) : falhouMrr ? (
                <AvisoIndisponivel mensagem="A agregação de MRR falhou nesta leitura, então a divisão por plano não pode ser exibida." />
              ) : planoVazio ? (
                <MolduraGrafico>
                  <EstadoVazio
                    icone={<Layers size={20} />}
                    titulo="Nenhuma assinatura paga"
                    descricao="Só entram aqui as assinaturas com status “ativo” em plano pago. Trials não contam."
                  />
                </MolduraGrafico>
              ) : (
                <div className="relative">
                  <GraficoReceitaPorPlano serie={seriePlano} />

                  {/* Total no miolo da rosca: rótulo direto do que o anel
                      inteiro soma. `pointer-events-none` para não bloquear o
                      hover das fatias que passam por baixo. */}
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total</span>
                    <span className="text-lg font-black text-slate-100 leading-none tracking-tight">
                      {formatarMoeda(totalReceitaPlanos)}
                    </span>
                    <span className="text-[10px] text-slate-400">/mês</span>
                  </div>
                </div>
              )}
            </CardGrafico>

            {/* Usuários ativos vs inativos */}
            <CardGrafico
              titulo="Usuários ativos vs inativos"
              icone={<Users size={15} />}
              descricao="Ativo = navegou nos últimos 30 dias"
              rodape={
                !primeiraCarga && !falhouUsuarios && !usuariosVazio && dados ? (
                  <div className="space-y-3">
                    <LegendaGrafico
                      itens={serieUsuarios.map((u) => ({
                        chave: u.rotulo,
                        cor: u.cor,
                        nome: u.rotulo,
                        valor: formatarNumero(u.quantidade),
                      }))}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] text-slate-500">
                        <span className="text-slate-200 font-bold tabular-nums">
                          {formatarPercentual(percentualAtivos)}
                        </span>{" "}
                        da base esteve ativa nos últimos 30 dias
                      </p>
                      {dados.usuarios.onboardingIncompleto > 0 && (
                        <p className="text-[10px] text-amber-400 font-bold flex items-center gap-1.5">
                          <AlertTriangle size={11} className="shrink-0" />
                          {formatarNumero(dados.usuarios.onboardingIncompleto)} com onboarding incompleto
                        </p>
                      )}
                    </div>
                  </div>
                ) : undefined
              }
            >
              {carregando ? (
                <Skeleton className="h-[220px] w-full rounded-xl" />
              ) : falhouUsuarios ? (
                <AvisoIndisponivel mensagem="A agregação de usuários falhou nesta leitura. Recarregue para tentar de novo." />
              ) : usuariosVazio ? (
                <MolduraGrafico>
                  <EstadoVazio
                    icone={<Users size={20} />}
                    titulo="Nenhum usuário cadastrado"
                    descricao="Assim que existirem contas na base, a divisão entre ativos e inativos aparece aqui."
                  />
                </MolduraGrafico>
              ) : (
                <GraficoUsuariosAtivos serie={serieUsuarios} />
              )}
            </CardGrafico>
          </div>
        </section>
      )}

      {/* ─── Presença em tempo real (fonte de dados própria) ───────────────
          Moldura de destaque: é a peça mais impressionante da tela e merece
          respirar num bloco só dela. O brilho é decorativo e fica fora do
          fluxo (pointer-events-none) para não roubar clique do mapa.

          Fecha a página, e de propósito. As duas alternativas foram descartadas:

          · lado a lado com um gráfico — o WorldMap é uma grade `xl:grid-cols-3`
            por dentro (mapa em 2 colunas + lista de sessões em 1). Em meia
            largura o globo cairia para ~200px e viraria enfeite, que é
            exatamente o que não pode acontecer com a peça de assinatura;
          · continuar entre os KPIs e os gráficos — era o que empurrava as
            séries para longe.

          A ordem final também separa dois modos de uso: KPIs e gráficos são
          superfície de LEITURA (o admin varre de cima a baixo e para), a
          presença é superfície de VIGIA (fica aberta, se atualiza sozinha a
          cada 10s). Vigia no fim ganha a largura inteira e não interrompe a
          varredura. */}
      <section className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-x-6 -top-10 h-40 rounded-full bg-blue-500/10 blur-3xl"
        />
        <div className="relative rounded-3xl ring-1 ring-inset ring-slate-100/[0.06] bg-gradient-to-b from-slate-100/[0.045] to-transparent p-4 sm:p-5 space-y-4">
          <Secao
            titulo="Presença em tempo real"
            descricao="Sessões dos últimos minutos, atualizadas sozinhas a cada 10 segundos."
            acao={
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-800/70 ring-1 ring-inset ring-slate-700/60 px-2.5 py-1 rounded-full">
                <Activity size={11} className="text-emerald-400" />
                Ao vivo
              </span>
            }
          />
          <WorldMap />
        </div>
      </section>

      {/* Rodapé: contexto do que o período realmente controla. Sem isso o
          operador troca para 7 dias, vê o MRR igual e acha que a tela travou. */}
      <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-800/60 pt-4">
        O período selecionado ({periodo} dias) define apenas a janela dos gráficos históricos. MRR,
        assinaturas, usuários, funil e integrações são a foto do estado atual e não mudam com o filtro.
        {dados && dados.assinaturas.trialsVencendo7d > 0
          ? ` ${formatarNumero(dados.assinaturas.trialsVencendo7d)} ${
              dados.assinaturas.trialsVencendo7d === 1 ? "trial vence" : "trials vencem"
            } nos próximos 7 dias.`
          : ""}
      </p>
    </div>
  );
}
