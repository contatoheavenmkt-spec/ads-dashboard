"use client";

/**
 * /admin/analytics — tráfego, presença, erros e ranking de receita.
 *
 * Consome GET /api/admin/analytics?period=7d|30d|90d e PATCH
 * /api/admin/errors/[id] (marcar erro como resolvido).
 *
 * Esta tela foi reescrita para falar a MESMA língua do dashboard, de contas e
 * de assinaturas. Três coisas mudaram de fato, e nenhuma é cosmética:
 *
 * 1. NÚMERO QUE PODE SER MENTIRA NÃO É EXIBIDO. A resposta desta rota não tem
 *    campo `degradado` (ela usa Promise.all: ou volta inteira, ou volta 500),
 *    mas ainda existem dois jeitos de um zero chegar aqui sem significar zero:
 *    um campo ausente/não-numérico no JSON e a `errorRate` calculada com
 *    denominador zero. Os dois viram `indisponivel` no <CardKpi> — o mesmo
 *    contrato que o dashboard usa para o MRR.
 *
 * 2. AS DATAS DO GRÁFICO PARARAM DE ANDAR UM DIA PARA TRÁS. `viewsByDay.date`
 *    vem como "2026-06-28" (data pura, sem hora). `new Date("2026-06-28")` é
 *    interpretado como UTC pelo JS e, em Brasília (UTC-3), cai às 21h do dia
 *    ANTERIOR — a versão antiga rotulava o eixo inteiro com o dia errado. Aqui
 *    a string é fatiada, nunca convertida em Date. É o mesmo cuidado que o
 *    dashboard documenta em `rotuloMes`.
 *
 * 3. A COR VOLTOU PARA A PALETA. O bloco de países usava um magenta que não
 *    existe em lugar nenhum do sistema, e o plano "plus" saía roxo (#a855f7),
 *    reprovado por ficar indistinguível do azul em deuteranopia. Agora tudo
 *    sai de `corDoPlano`/`PALETA_PLANO` do admin-ui.
 *
 * 4. O `errorsByType` DA ROTA VOLTOU A TER CONSUMIDOR. A rota mantém um
 *    $queryRaw dedicado agrupando erros por tipo na janela inteira, e nenhum
 *    arquivo lia o resultado — uma agregação paga a cada request e jogada fora.
 *    O painel "Erros por tipo" a consome. Ele NÃO é redundante com a lista de
 *    erros recentes: aquela para nas 20 ocorrências mais novas, esta conta o
 *    período inteiro.
 *
 * O que NÃO mudou: seletor de período, recarregar, filtro de erros, expandir
 * sugestão de correção e o PATCH de resolução continuam exatamente com o mesmo
 * comportamento (o PATCH ganhou verificação de `res.ok`, ver `resolverErro`).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Crown,
  Eye,
  FileText,
  Globe,
  Layers,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PLANS } from "@/lib/plans";
import {
  CardKpi,
  EstadoErro,
  EstadoVazio,
  Secao,
  Skeleton,
  corDoPlano,
  formatarData,
  formatarDataHora,
  formatarMoeda,
  formatarNumero,
  formatarPercentual,
  tempoRelativo,
} from "../../_components/admin-ui";

// ─── Fronteira de carregamento (code-splitting) ───────────────────────────────
//
// O único desenho recharts desta tela foi extraído para
// `_components/grafico-visualizacoes-dia.tsx` e chega via `next/dynamic`:
// mantém a lib de gráficos fora do chunk inicial. Nada de comportamento mudou —
// a série, as guardas de vazio e a legenda continuam nesta página; o componente
// só desenha o que recebe pronto. `ssr: false` porque o recharts mede o
// container no browser; o `loading` tem os MESMOS 260px do desenho real, para o
// carregamento adiado não causar salto de layout. O import vem do barrel
// `graficos-lazy` (não do arquivo do gráfico direto) para cair no MESMO chunk
// dos gráficos do dashboard — recharts uma vez, cacheado entre as duas telas.

const GraficoVisualizacoesDia = dynamic(
  () => import("../../_components/graficos-lazy").then((m) => m.GraficoVisualizacoesDia),
  { ssr: false, loading: () => <Skeleton className="h-[260px] w-full rounded-xl" /> }
);

// ─── Contrato da API ──────────────────────────────────────────────────────────

type Periodo = "7d" | "30d" | "90d";

const PERIODOS: Periodo[] = ["7d", "30d", "90d"];

/** Rótulo do período para texto corrido ("nos últimos 30 dias"). */
const DIAS_DO_PERIODO: Record<Periodo, number> = { "7d": 7, "30d": 30, "90d": 90 };

/**
 * Campos numéricos de `overview`. A lista existe para que a checagem de
 * "chegou como número?" seja feita em UM lugar, e o resultado alimente o
 * `indisponivel` de cada card — em vez de sete `?? 0` espalhados pelo JSX,
 * que é como um zero-por-erro vira número real na tela.
 */
const CAMPOS_VISAO = [
  "totalViewsToday",
  "totalViewsPeriod",
  "uniqueVisitorsPeriod",
  "activeNow",
  "totalErrors",
  "unresolvedErrors",
  "errorRate",
] as const;

type CampoVisao = (typeof CAMPOS_VISAO)[number];

interface PontoDia {
  /** "2026-06-28" — data pura, SEM hora. Nunca passe por `new Date`. */
  date: string;
  views: number;
  unique: number;
}

interface Pagina {
  path: string;
  views: number;
  unique: number;
}

interface Pais {
  country: string;
  views: number;
}

interface ErroSistema {
  id: string;
  path: string;
  errorType: string;
  errorMessage: string;
  statusCode: number | null;
  resolved: boolean;
  fixSuggestion: string | null;
  createdAt: string | null;
}

/** Agregação `errorsByType` da rota: um GROUP BY "errorType" sobre a janela. */
interface TipoErro {
  errorType: string;
  count: number;
}

interface SessaoAtiva {
  sessionId: string;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  path: string | null;
  country: string | null;
  lastSeen: string | null;
}

interface LinhaReceita {
  userId: string;
  email: string;
  name: string | null;
  plan: string;
  totalPaid: number;
  joinedAt: string | null;
}

interface Analytics {
  visaoGeral: Record<CampoVisao, number>;
  /** Campos de `overview` que NÃO vieram como número finito. */
  ausentes: CampoVisao[];
  porDia: PontoDia[];
  topPaginas: Pagina[];
  topPaises: Pais[];
  errosPorTipo: TipoErro[];
  errosRecentes: ErroSistema[];
  ativosAgora: SessaoAtiva[];
  rankingReceita: LinhaReceita[];
}

type FiltroErro = "todos" | "pendentes" | "resolvidos";

const FILTROS_ERRO: Array<{ valor: FiltroErro; rotulo: string }> = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "pendentes", rotulo: "Não resolvidos" },
  { valor: "resolvidos", rotulo: "Resolvidos" },
];

// ─── Cores das séries desta tela ──────────────────────────────────────────────
//
// Só existe UMA medida nesta tela (páginas vistas), contada de dois jeitos.
// Por isso não há paleta categórica aqui: `unique` é um SUBCONJUNTO de `views`
// (todo visitante único também é uma visualização), e a codificação certa para
// quantidades aninhadas é a mesma matiz em dois passos de luminosidade — não
// duas cores diferentes, que anunciariam duas categorias independentes.
//
// Usar um segundo slot categórico (o rosa do `plus`, por exemplo) seria pior do
// que feio: a tabela de ranking logo abaixo pinta planos com essas cores, e o
// mesmo rosa nomearia "plano Plus" num card e "visitantes únicos" no outro.

/** Azul do produto — mesmo passo do slot `start` da paleta. */
const COR_VISUALIZACOES = "#3b82f6";
/** Um passo mais claro da MESMA matiz: lê como "parte do azul de cima". */
const COR_UNICOS = "#93c5fd";
/** Séries de barra (top páginas, países) — medida única por card. */
const COR_SERIE_BARRA = "#3b82f6";

// Os ids dos gradientes e o chrome dos gráficos (tooltip, eixos, grade,
// cursor — os mesmos valores do dashboard, de propósito) moram agora com o
// desenho: o chrome compartilhado em `_components/chart-chrome.ts` e os
// gradientes dentro de `_components/grafico-visualizacoes-dia.tsx` — fora do
// chunk inicial desta tela.

// ─── Chrome dos controles ─────────────────────────────────────────────────────

const BOTAO_SEC =
  "inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl bg-slate-800/70 ring-1 ring-inset ring-slate-700/60 text-slate-300 text-[11px] font-bold hover:bg-slate-700/70 hover:ring-slate-500/50 transition-[background-color,box-shadow] duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800/70 disabled:hover:ring-slate-700/60";

/** Cabeçalho de tabela — MESMA métrica das telas de contas e assinaturas
 *  (`px-5 py-3.5` no cabeçalho, `px-5 py-3` no corpo). Tabelas irmãs com
 *  densidades diferentes fazem o admin sentir troca de sistema ao navegar. */
const CELULA_TH =
  "px-5 py-3.5 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap border-b border-slate-700/50";

// ─── Normalização da resposta ─────────────────────────────────────────────────
//
// Toda a defesa acontece aqui, uma vez. Depois deste ponto o render trata os
// tipos como garantidos — sem `?.` e sem `?? 0` no JSX. Um campo faltando aqui
// viraria "NaN" na tela ou, pior, uma <Area> com valores undefined, que
// simplesmente some sem erro no console.

type Registro = Record<string, unknown>;

function comoObjeto(v: unknown): Registro {
  return typeof v === "object" && v !== null ? (v as Registro) : {};
}

function comoLista(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/**
 * Número finito ou o padrão. Não usa `Number(v)` direto: `Number(null)` é 0 e
 * `Number(true)` é 1 — ambos finitos — então um campo nulo passaria como zero
 * legítimo em vez de cair no fallback.
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

function textoOuNulo(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/**
 * `overview` + a lista de campos que não vieram como número.
 *
 * Este é o coração do "nunca exiba zero-por-erro": um `totalViewsToday`
 * ausente devolve 0 no mapa de valores E o nome do campo em `ausentes`, e o
 * card correspondente renderiza "indisponível" em vez do zero.
 */
function normalizarVisaoGeral(bruto: unknown): {
  valores: Record<CampoVisao, number>;
  ausentes: CampoVisao[];
} {
  const raiz = comoObjeto(bruto);
  const valores = {} as Record<CampoVisao, number>;
  const ausentes: CampoVisao[] = [];

  for (const campo of CAMPOS_VISAO) {
    const v = raiz[campo];
    if (typeof v === "number" && Number.isFinite(v)) {
      valores[campo] = v;
    } else {
      valores[campo] = 0;
      ausentes.push(campo);
    }
  }

  return { valores, ausentes };
}

function normalizar(bruto: unknown): Analytics {
  const raiz = comoObjeto(bruto);
  const { valores, ausentes } = normalizarVisaoGeral(raiz.overview);

  return {
    visaoGeral: valores,
    ausentes,

    porDia: comoLista(raiz.viewsByDay)
      .map(comoObjeto)
      .map((p) => ({
        date: texto(p.date, ""),
        views: Math.max(0, num(p.views)),
        unique: Math.max(0, num(p.unique)),
      }))
      // Ponto sem data não tem onde ser desenhado no eixo.
      .filter((p) => p.date !== ""),

    topPaginas: comoLista(raiz.topPages)
      .map(comoObjeto)
      .map((p) => ({
        path: texto(p.path, "—"),
        views: Math.max(0, num(p.views)),
        unique: Math.max(0, num(p.unique)),
      })),

    topPaises: comoLista(raiz.topCountries)
      .map(comoObjeto)
      .map((p) => ({
        country: texto(p.country, "—"),
        views: Math.max(0, num(p.views)),
      })),

    // A rota devolve esta agregação SEM LIMIT (o GROUP BY sai ordenado por
    // contagem). Reordenamos antes de cortar para que "as 10 primeiras" seja
    // verdade mesmo se a ordem do banco mudar, e cortamos em 10 pelo mesmo
    // motivo dos outros rankings: 40 tipos viram rolagem dentro do cartão.
    errosPorTipo: comoLista(raiz.errorsByType)
      .map(comoObjeto)
      .map((e) => ({
        errorType: texto(e.errorType, "Erro"),
        count: Math.max(0, num(e.count)),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),

    errosRecentes: comoLista(raiz.recentErrors)
      .map(comoObjeto)
      .map((e, i) => ({
        // O id é a chave da lista E o alvo do PATCH. Sem ele o item não é
        // acionável, então o fallback só serve para manter o React feliz.
        id: texto(e.id, `erro-${i}`),
        path: texto(e.path, "—"),
        errorType: texto(e.errorType, "Erro"),
        errorMessage: texto(e.errorMessage, "Sem mensagem registrada."),
        statusCode: typeof e.statusCode === "number" && Number.isFinite(e.statusCode) ? e.statusCode : null,
        // `typeof` em vez de `=== true`: qualquer coisa que não seja um boolean
        // de verdade (null, string "false", campo ausente) cai em "pendente",
        // que é o lado seguro — um erro aberto some do radar se for lido como
        // resolvido por engano, enquanto o contrário só custa um clique.
        resolved: typeof e.resolved === "boolean" ? e.resolved : false,
        fixSuggestion: textoOuNulo(e.fixSuggestion),
        createdAt: textoOuNulo(e.createdAt),
      })),

    ativosAgora: comoLista(raiz.activeUsers)
      .map(comoObjeto)
      .map((s, i) => ({
        sessionId: texto(s.sessionId, `sessao-${i}`),
        userId: textoOuNulo(s.userId),
        userEmail: textoOuNulo(s.userEmail),
        userName: textoOuNulo(s.userName),
        path: textoOuNulo(s.path),
        country: textoOuNulo(s.country),
        lastSeen: textoOuNulo(s.lastSeen),
      })),

    rankingReceita: comoLista(raiz.revenueRanking)
      .map(comoObjeto)
      .map((u, i) => ({
        userId: texto(u.userId, `usuario-${i}`),
        email: texto(u.email, "—"),
        name: textoOuNulo(u.name),
        plan: texto(u.plan, "trial"),
        totalPaid: Math.max(0, num(u.totalPaid)),
        joinedAt: textoOuNulo(u.joinedAt),
      })),
  };
}

// ─── Formatadores locais ──────────────────────────────────────────────────────

// `rotuloDia` e `rotuloDiaCompleto` (o fatiamento da data SEM passar por
// `new Date`, que em Brasília cairia no dia anterior) foram junto com o desenho
// para `_components/grafico-visualizacoes-dia.tsx` — eram usados só pelo eixo e
// pelo tooltip do gráfico.

/**
 * "premium" → "Premium", pela mesma fonte que a API usa para precificar.
 *
 * Normaliza a chave igual a `corDoPlano` (admin-ui) faz. `Subscription.plan` é
 * String livre no schema, não enum: um webhook que grave "Premium" ou
 * " premium " produziria o ponto colorido CERTO (porque `corDoPlano`
 * normaliza) ao lado de um rótulo caído no fallback cru. Mesma entrada, mesma
 * chave, nas duas peças da mesma linha.
 */
function rotuloPlano(plano: string): string {
  if (typeof plano !== "string" || plano.trim() === "") return "—";
  const chave = plano.trim().toLowerCase();
  return PLANS[chave]?.name ?? plano.trim();
}

/**
 * "BR" → 🇧🇷. Dois caracteres regionais indicadores.
 * Código inválido devolve o globo, nunca uma sequência quebrada.
 */
function bandeiraPais(codigo: string): string {
  if (typeof codigo !== "string" || codigo.trim().length !== 2) return "🌍";
  const sigla = codigo.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(sigla)) return "🌍";
  return String.fromCodePoint(...[...sigla].map((c) => 0x1f1e6 - 65 + c.charCodeAt(0)));
}

/**
 * "BR" → "Brasil". Cache no módulo porque o construtor do Intl é caro e a
 * lista de países é redesenhada a cada refetch.
 *
 * `undefined` = ainda não tentamos criar; `null` = o ambiente não suporta.
 * Quando não dá nome, devolve null e a UI mostra só a sigla (que já é a
 * identidade primária da linha — o nome é conforto, não a informação).
 */
let formatadorPais: Intl.DisplayNames | null | undefined;

function nomeDoPais(codigo: string): string | null {
  if (typeof codigo !== "string" || codigo.trim().length !== 2) return null;
  const sigla = codigo.trim().toUpperCase();

  if (formatadorPais === undefined) {
    try {
      formatadorPais = new Intl.DisplayNames(["pt-BR"], { type: "region" });
    } catch {
      formatadorPais = null;
    }
  }
  if (!formatadorPais) return null;

  try {
    const nome = formatadorPais.of(sigla);
    // O Intl devolve a própria sigla quando não conhece a região — nesse caso
    // repetir "BR · BR" na linha não acrescenta nada.
    return typeof nome === "string" && nome.toUpperCase() !== sigla ? nome : null;
  } catch {
    return null;
  }
}

/**
 * Segundos decorridos desde um instante ISO, para alimentar `tempoRelativo`
 * (que recebe segundos, não data). Devolve null quando a data não é confiável.
 */
function segundosDesde(iso: string | null): number | null {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / 1000;
}

/**
 * Largura da barra em porcentagem do maior valor da lista.
 *
 * O piso de 2% é deliberado: uma página com 1 view em cima de outra com 500
 * renderizaria uma barra de 0,2% de largura — invisível, e a linha pareceria
 * ter perdido a barra. O piso mantém a marca presente sem mentir sobre a
 * ordem (o número exato está escrito ao lado, alinhado em tabular-nums).
 */
function larguraBarra(valor: number, maximo: number): string {
  if (!Number.isFinite(valor) || !Number.isFinite(maximo) || maximo <= 0 || valor <= 0) return "0%";
  const pct = Math.max(2, Math.min(100, (valor / maximo) * 100));
  // Uma casa decimal basta: sub-pixel não é visível e "33.33333333333333%" no
  // atributo style suja o DOM que o admin inspeciona quando algo parece errado.
  return `${pct.toFixed(1)}%`;
}

// ─── Peças locais ─────────────────────────────────────────────────────────────

/**
 * Cartão-padrão desta tela: título em caixa alta, descrição opcional, ícone à
 * direita e uma faixa de ação (filtros, contadores). Mesma anatomia do
 * `CardGrafico` do dashboard — `min-w-0` é obrigatório, senão o
 * ResponsiveContainer do recharts empurra a coluna da grade além da largura
 * disponível e a página inteira ganha scroll horizontal.
 */
function Painel({
  titulo,
  descricao,
  icone,
  acao,
  children,
  semPadding = false,
  className,
}: {
  titulo: string;
  descricao?: string;
  icone?: ReactNode;
  acao?: ReactNode;
  children: ReactNode;
  /** Para listas/tabelas que sangram até a borda do cartão. */
  semPadding?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "glass-panel rounded-2xl min-w-0 h-full flex flex-col ring-1 ring-slate-100/[0.03]",
        // Só a sombra anima. `transition-all` num painel que recarrega a cada
        // troca de período animaria também o texto trocando de largura.
        "transition-shadow duration-300 hover:shadow-xl hover:shadow-slate-950/40",
        // `overflow-hidden` SÓ na variante que sangra até a borda (listas e
        // tabelas precisam dele para respeitar o raio do cartão). Na variante
        // com padding ele cortaria o tooltip do recharts quando o cursor chega
        // perto da borda do gráfico — o dado sumiria justamente no extremo da
        // série, que costuma ser o ponto que o operador foi olhar.
        semPadding && "overflow-hidden",
        className
      )}
    >
      <div
        className={cn(
          "flex items-start justify-between gap-3 flex-wrap",
          semPadding ? "px-5 py-4 border-b border-slate-700/50" : "p-5 pb-4"
        )}
      >
        <div className="min-w-0">
          <h3 className="text-[11px] font-black text-slate-300 uppercase tracking-widest">{titulo}</h3>
          {descricao && <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{descricao}</p>}
        </div>
        {acao ? (
          <div className="shrink-0">{acao}</div>
        ) : icone ? (
          <div className="w-8 h-8 rounded-xl bg-slate-800/70 ring-1 ring-inset ring-slate-700/60 text-slate-400 flex items-center justify-center shrink-0">
            {icone}
          </div>
        ) : null}
      </div>

      <div className={cn("min-w-0 flex-1", semPadding ? "" : "px-5 pb-5")}>{children}</div>
    </div>
  );
}

/**
 * Rodapé-legenda do gráfico. É a codificação secundária exigida pela paleta:
 * o ponto colorido carrega a identidade da série e o TEXTO fica sempre em cor
 * de texto — nunca na cor da série, que derruba contraste e some para quem tem
 * daltonismo. Com 2+ séries a legenda é obrigatória.
 */
function LegendaGrafico({
  itens,
}: {
  itens: Array<{ chave: string; cor: string; nome: string; nota?: string; valor: string }>;
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
      {itens.map((i) => (
        <li key={i.chave} className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden
            className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-slate-900/80"
            style={{ backgroundColor: i.cor }}
          />
          <span className="text-[11px] font-bold text-slate-300 whitespace-nowrap">{i.nome}</span>
          <span className="text-[11px] font-bold text-slate-100 tabular-nums">{i.valor}</span>
          {i.nota && <span className="text-[10px] text-slate-500 whitespace-nowrap">{i.nota}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Barra horizontal de ranking (top páginas / países / tipos de erro).
 *
 * A barra tem 8px de altura com `rounded-full` — que nesse tamanho é
 * exatamente o raio de 4px pedido para a ponta. O trilho fica um passo acima
 * da superfície para que a barra tenha contra o que ler.
 *
 * A barra NÃO anima. `width` é propriedade de layout: animá-la faria as três
 * dezenas de barras da tela (páginas, países e tipos de erro) reflowarem a
 * cada quadro em toda troca de período, e a regra de gráficos restringe a
 * animação a
 * opacity/transform/border-color/box-shadow/background-color. Trocar por
 * `transform: scaleX()` — o caminho usual para tirar `width` da animação —
 * esmagaria o `rounded-full` na horizontal e a ponta perderia o raio de 4px
 * justamente nas barras curtas, onde ela é a única forma visível. Sem
 * transição a barra pinta direto no valor certo, que é o que importa.
 */
function BarraRanking({
  posicao,
  rotulo,
  detalhe,
  valor,
  nota,
  largura,
  cor,
  mono = false,
}: {
  posicao: number;
  rotulo: string;
  detalhe?: string;
  valor: string;
  nota?: string;
  largura: string;
  cor: string;
  mono?: boolean;
}) {
  return (
    <li className="space-y-1.5 min-w-0">
      <div className="flex items-baseline justify-between gap-3 min-w-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[10px] font-black text-slate-500 tabular-nums w-4 shrink-0">{posicao}</span>
          <span className={cn("text-[11px] text-slate-200 truncate", mono ? "font-mono" : "font-medium")}>
            {rotulo}
          </span>
          {detalhe && <span className="text-[10px] text-slate-500 truncate shrink-0">{detalhe}</span>}
        </div>
        <div className="shrink-0 flex items-baseline gap-1.5">
          <span className="text-xs font-bold text-slate-100 tabular-nums">{valor}</span>
          {nota && <span className="text-[10px] text-slate-500 tabular-nums whitespace-nowrap">{nota}</span>}
        </div>
      </div>
      <div className="h-2 rounded-full bg-slate-800/80 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: largura, backgroundColor: cor }} />
      </div>
    </li>
  );
}

/**
 * Estado de resolução do erro.
 *
 * Peça local em vez de <BadgeStatus>: o STATUS_MAP do admin-ui não tem chave
 * para "resolvido" — o mais próximo seria "ativo", que escreveria "Ativo" numa
 * linha de erro corrigido. A anatomia é a mesma do badge compartilhado (caixa
 * neutra do matiz, ponto colorido carregando a identidade, TEXTO em cor de
 * texto) e o rótulo escrito é a codificação secundária que a cor exige.
 */
function BadgeResolucao({ resolvido }: { resolvido: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[9px] font-bold px-2 py-[3px] rounded-full ring-1 ring-inset uppercase tracking-wide whitespace-nowrap text-slate-300",
        resolvido ? "bg-emerald-500/10 ring-emerald-500/20" : "bg-amber-500/10 ring-amber-500/20"
      )}
    >
      <span
        aria-hidden
        className={cn("w-1.5 h-1.5 rounded-full shrink-0", resolvido ? "bg-emerald-400" : "bg-amber-400")}
      />
      {resolvido ? "Resolvido" : "Pendente"}
    </span>
  );
}

/** Piso de altura para vazio/skeleton dentro dos cartões da grade — mantém as
 *  duas colunas alinhadas. É `min-h`, não `h`: o <EstadoVazio> passa de 220px e,
 *  com altura travada, o excedente vazaria para fora do cartão. */
function Moldura({ children, altura = 220 }: { children: ReactNode; altura?: number }) {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: altura }}>
      {children}
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function AdminAnalyticsPage() {
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [dados, setDados] = useState<Analytics | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  /** Relógio do CLIENTE no momento em que a leitura voltou. A rota não devolve
   *  `geradoEm`, então é a única marca honesta de "quando isto foi lido". */
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);

  const [filtroErros, setFiltroErros] = useState<FiltroErro>("todos");
  const [erroExpandido, setErroExpandido] = useState<string | null>(null);
  const [resolvendoId, setResolvendoId] = useState<string | null>(null);
  const [falhaResolucao, setFalhaResolucao] = useState<string | null>(null);

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
    // numa falha de primeira carga o <EstadoErro> continuaria idêntico durante
    // a retentativa inteira e o clique pareceria não ter surtido efeito.
    setErro(null);
    try {
      // `no-store`: o admin abre esta tela para ver o estado de AGORA — nem o
      // cache do Next nem um proxy no caminho podem responder por ela.
      const res = await fetch(`/api/admin/analytics?period=${periodo}`, {
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
      setAtualizadoEm(new Date().toISOString());
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

  /**
   * Marca um erro como resolvido.
   *
   * A versão antiga aplicava o estado local ANTES de saber se o PATCH deu
   * certo (não olhava `res.ok`), então um 500 pintava "Resolvido" na tela com
   * o banco intacto — o erro sumia do radar sem ter sido corrigido. Agora a
   * linha só muda depois do 2xx, e a falha aparece com a mensagem da API.
   */
  async function resolverErro(id: string) {
    setResolvendoId(id);
    setFalhaResolucao(null);
    try {
      const res = await fetch(`/api/admin/errors/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolved: true }),
      });
      if (!res.ok) {
        throw new Error(
          res.status === 401 ? "Sessão do admin expirada." : `A API respondeu ${res.status}.`
        );
      }
      setDados((anterior) => {
        if (!anterior) return anterior;
        return {
          ...anterior,
          errosRecentes: anterior.errosRecentes.map((e) => (e.id === id ? { ...e, resolved: true } : e)),
        };
      });
    } catch (err) {
      setFalhaResolucao(
        err instanceof Error
          ? `Não foi possível marcar como resolvido: ${err.message}`
          : "Não foi possível marcar como resolvido."
      );
    } finally {
      setResolvendoId(null);
    }
  }

  // ─── Derivados ──────────────────────────────────────────────────────────────

  /** Set para consulta O(1) — o JSX pergunta por campo ausente 6 vezes. */
  const ausentes = useMemo(() => new Set<CampoVisao>(dados?.ausentes ?? []), [dados]);

  /** Skeleton só na PRIMEIRA carga. Trocar o período mantém os números antigos
   *  na tela e sinaliza o refetch girando o ícone do botão — piscar a tela
   *  inteira a cada troca de janela seria pior. */
  const primeiraCarga = carregando && dados === null;

  /** Falhou e não há NADA em tela: estado terminal, com caminho de volta. */
  const semDados = erro !== null && dados === null;

  const visao = dados?.visaoGeral;
  const dias = DIAS_DO_PERIODO[periodo];

  /**
   * `errorRate` chega da API JÁ EM PORCENTAGEM (0,16 significa 0,16%) — é o
   * erro clássico deste campo, e por isso ele passa por `formatarPercentual`,
   * que NÃO multiplica por 100.
   *
   * O detalhe que importa mais: a rota calcula `erros / visualizações * 100` e
   * devolve 0 quando não houve visualização nenhuma. Zero dividido por zero
   * não é "0% de erro", é uma taxa que não existe — e um "0,0%" ali seria lido
   * como sistema saudável. Por isso vira `indisponivel`.
   */
  const taxaSemBase = !!visao && visao.totalViewsPeriod <= 0;

  const serieDias = dados?.porDia ?? [];
  const graficoVazio = serieDias.length === 0 || serieDias.every((p) => p.views <= 0 && p.unique <= 0);

  const maxPagina = useMemo(
    () => (dados?.topPaginas ?? []).reduce((m, p) => (p.views > m ? p.views : m), 0),
    [dados]
  );
  const maxPais = useMemo(
    () => (dados?.topPaises ?? []).reduce((m, p) => (p.views > m ? p.views : m), 0),
    [dados]
  );
  const maxTipoErro = useMemo(
    () => (dados?.errosPorTipo ?? []).reduce((m, t) => (t.count > m ? t.count : m), 0),
    [dados]
  );

  const errosVisiveis = useMemo(() => {
    const lista = dados?.errosRecentes ?? [];
    if (filtroErros === "pendentes") return lista.filter((e) => !e.resolved);
    if (filtroErros === "resolvidos") return lista.filter((e) => e.resolved);
    return lista;
  }, [dados, filtroErros]);

  const totalErrosLista = dados?.errosRecentes.length ?? 0;
  const pendentesLista = useMemo(
    () => (dados?.errosRecentes ?? []).filter((e) => !e.resolved).length,
    [dados]
  );

  /** Índice do período ativo: posiciona a pílula do segmented control. */
  const indicePeriodo = Math.max(0, PERIODOS.indexOf(periodo));

  return (
    <div className="p-6 space-y-8">
      {/* ─── Cabeçalho ───────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_10px_2px_rgba(59,130,246,0.55)]"
            />
            <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.22em]">
              Painel administrativo
            </p>
          </div>

          <h1 className="mt-2.5 text-3xl md:text-4xl font-black tracking-tight bg-gradient-to-br from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            Analytics
          </h1>

          <p className="mt-2 text-sm text-slate-400 leading-relaxed max-w-xl">
            Tráfego, presença em tempo real, erros do sistema e ranking de receita da plataforma.
          </p>

          <p className="text-[11px] text-slate-500 mt-3 flex items-center gap-1.5">
            <Clock size={11} className="shrink-0" />
            {/* Três estados, não dois: quando a primeira carga falha não houve
                atualização nenhuma, e escrever "Atualizado em —" logo acima do
                erro afirmaria uma leitura que nunca aconteceu. */}
            {primeiraCarga
              ? "Carregando indicadores…"
              : atualizadoEm
                ? `Atualizado em ${formatarDataHora(atualizadoEm)}`
                : "Nenhuma leitura concluída"}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Grupo de escolha única: sem role/aria-pressed um leitor de tela
              anuncia três botões idênticos e o operador não descobre qual
              janela está aplicada — a diferença aqui é só de cor.

              A pílula é um irmão absoluto (e não um `bg-*` no botão ativo) para
              deslizar entre as opções: as três células têm a MESMA largura
              (grid-cols-3, sem gap), então translateX de 100% é exatamente uma
              célula, sem medir nada no DOM. */}
          <div
            role="group"
            aria-label="Período das métricas de tráfego"
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
                {DIAS_DO_PERIODO[p]} dias
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void buscar()}
            disabled={carregando}
            title="Recarregar analytics"
            aria-label="Recarregar analytics"
            className="p-2.5 rounded-xl bg-slate-900/70 ring-1 ring-inset ring-slate-700/50 text-slate-400 hover:text-slate-200 hover:ring-slate-500/60 transition-[color,box-shadow] duration-200 disabled:opacity-60"
          >
            <RefreshCw size={14} className={carregando ? "animate-spin" : undefined} />
          </button>
        </div>
      </header>

      {/* Falha no refetch COM dados antigos em tela: mantém os números e avisa
          que estão velhos. Piscar para vazio a cada blip de rede seria pior. */}
      {erro && dados && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 flex flex-wrap items-center gap-3">
          <AlertTriangle size={16} className="text-rose-400 shrink-0" />
          <p className="text-[11px] text-slate-300 flex-1 min-w-[220px] leading-relaxed">
            Não foi possível atualizar: {erro} Os números abaixo são da última leitura bem-sucedida
            {atualizadoEm ? ` (${formatarDataHora(atualizadoEm)})` : ""}.
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
        <EstadoErro mensagem={erro ?? undefined} onTentarNovamente={() => void buscar()} />
      ) : (
        <>
          {/* ─── Faixa de KPIs ──────────────────────────────────────────── */}
          <section className="space-y-4">
            <Secao
              titulo="Visão geral"
              descricao={`Visualizações e visitantes na janela de ${dias} dias. “Ativos agora” e “erros não resolvidos” são a foto do momento e não respondem ao período.`}
            />

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              <CardKpi
                titulo="Visualizações hoje"
                valor={visao?.totalViewsToday}
                sufixo="páginas"
                icone={<Eye size={16} />}
                destaque
                indisponivel={ausentes.has("totalViewsToday")}
                carregando={primeiraCarga}
              />
              <CardKpi
                titulo="Visualizações no período"
                valor={visao?.totalViewsPeriod}
                sufixo={`em ${dias} dias`}
                icone={<TrendingUp size={16} />}
                indisponivel={ausentes.has("totalViewsPeriod")}
                carregando={primeiraCarga}
              />
              <CardKpi
                titulo="Visitantes únicos"
                valor={visao?.uniqueVisitorsPeriod}
                sufixo="sessões distintas"
                icone={<Users size={16} />}
                indisponivel={ausentes.has("uniqueVisitorsPeriod")}
                carregando={primeiraCarga}
              />
              <CardKpi
                titulo="Ativos agora"
                valor={visao?.activeNow}
                sufixo="últimos 5 min"
                icone={<Activity size={16} />}
                tom="bom"
                indisponivel={ausentes.has("activeNow")}
                carregando={primeiraCarga}
              />
              {/* `unresolvedErrors` NÃO é filtrado por data na rota: conta o
                  histórico inteiro de erros abertos, enquanto `totalErrors`
                  conta só o período. É por isso que "1 no período" e "11 não
                  resolvidos" convivem sem contradição — e é por isso que o
                  sufixo precisa dizer de qual janela cada número fala. */}
              <CardKpi
                titulo="Erros não resolvidos"
                valor={visao?.unresolvedErrors}
                sufixo="acumulado"
                icone={<AlertTriangle size={16} />}
                tom={!ausentes.has("unresolvedErrors") && (visao?.unresolvedErrors ?? 0) > 0 ? "grave" : "neutro"}
                indisponivel={ausentes.has("unresolvedErrors")}
                carregando={primeiraCarga}
              />
              <CardKpi
                titulo="Taxa de erros"
                valor={formatarPercentual(visao?.errorRate)}
                // "páginas" é a mesma unidade que o card "Visualizações hoje"
                // usa no sufixo — o denominador desta taxa é exatamente aquele
                // número. Ficar mais explícito ("páginas vistas") empurraria o
                // sufixo para além da largura do card na grade de 2 colunas do
                // mobile, e quem seria truncado é o valor.
                sufixo="erros ÷ páginas"
                icone={<Target size={16} />}
                indisponivel={ausentes.has("errorRate") || taxaSemBase}
                carregando={primeiraCarga}
              />
            </div>

            {!primeiraCarga && visao && !ausentes.has("totalErrors") && (
              <p className="text-[11px] text-slate-500 leading-relaxed">
                <span className="text-slate-300 font-bold tabular-nums">
                  {formatarNumero(visao.totalErrors)}
                </span>{" "}
                {visao.totalErrors === 1 ? "erro registrado" : "erros registrados"} nos últimos {dias} dias.
                O card de não resolvidos conta o acumulado de todo o histórico, não só desta janela.
              </p>
            )}
          </section>

          {/* ─── Visualizações por dia ──────────────────────────────────── */}
          <section className="space-y-4">
            <Secao
              titulo="Tráfego"
              descricao="Único bloco da tela que desenha a janela inteira do período selecionado."
              acao={
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-blue-300 bg-blue-500/10 ring-1 ring-inset ring-blue-500/25 px-2.5 py-1 rounded-full tabular-nums">
                  Janela de {dias} dias
                </span>
              }
            />

            <Painel
              titulo="Visualizações por dia"
              descricao="Total de páginas vistas e sessões distintas em cada dia."
              icone={<Eye size={15} />}
            >
              {primeiraCarga ? (
                <Skeleton className="h-[260px] w-full rounded-xl" />
              ) : graficoVazio ? (
                <Moldura altura={260}>
                  <EstadoVazio
                    icone={<Eye size={20} />}
                    titulo="Nenhuma visualização na janela"
                    descricao="Nenhum dia do período registrou tráfego. Assim que houver acesso, a curva aparece aqui."
                  />
                </Moldura>
              ) : (
                <div className="space-y-4">
                  {/* O desenho em si vive em `grafico-visualizacoes-dia.tsx` e
                      chega via `next/dynamic` — só o QUANDO do carregamento
                      mudou. */}
                  <GraficoVisualizacoesDia
                    serie={serieDias}
                    corViews={COR_VISUALIZACOES}
                    corUnicos={COR_UNICOS}
                  />

                  <div className="pt-4 border-t border-slate-700/50 space-y-2">
                    {/* Duas séries ⇒ legenda obrigatória. A versão antiga
                        diferenciava "únicos" por linha tracejada e deixava o
                        leitor adivinhar qual era qual. */}
                    <LegendaGrafico
                      itens={[
                        {
                          chave: "views",
                          cor: COR_VISUALIZACOES,
                          nome: "Visualizações",
                          // O MESMO guard dos cards. Quando o campo não vem como
                          // número, `normalizarVisaoGeral` grava 0 no mapa E
                          // empurra o nome para `ausentes` — o <CardKpi> lá em
                          // cima escreve "indisponível" e, sem consultar o Set
                          // aqui, a legenda imprimiria "0" a poucos pixels de
                          // distância. A tela se contradizendo sobre o mesmo
                          // dado é pior do que não mostrar o dado.
                          valor: ausentes.has("totalViewsPeriod")
                            ? "—"
                            : formatarNumero(visao?.totalViewsPeriod),
                          nota: "no período",
                        },
                        {
                          chave: "unique",
                          cor: COR_UNICOS,
                          nome: "Visitantes únicos",
                          valor: ausentes.has("uniqueVisitorsPeriod")
                            ? "—"
                            : formatarNumero(visao?.uniqueVisitorsPeriod),
                          nota: "no período",
                        },
                      ]}
                    />
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      A linha de únicos conta sessões distintas DENTRO DE CADA DIA; o total do período
                      remove quem voltou em dias diferentes, então ele é menor que a soma da curva.
                    </p>
                  </div>
                </div>
              )}
            </Painel>
          </section>

          {/* ─── Páginas e países ───────────────────────────────────────── */}
          <section className="space-y-4">
            <Secao titulo="Origem do tráfego" descricao="Onde os acessos entram e de onde eles vêm." />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
              <Painel
                titulo="Top páginas"
                descricao="As 10 rotas mais vistas no período."
                icone={<FileText size={15} />}
              >
                {primeiraCarga ? (
                  <div className="space-y-4 py-1">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="space-y-1.5">
                        <Skeleton className="h-3 w-2/3" />
                        <Skeleton className="h-2 w-full rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : (dados?.topPaginas.length ?? 0) === 0 ? (
                  <Moldura>
                    <EstadoVazio
                      icone={<FileText size={20} />}
                      titulo="Nenhuma página registrada"
                      descricao="Não houve visualização de página na janela selecionada."
                    />
                  </Moldura>
                ) : (
                  <ul className="space-y-3">
                    {dados?.topPaginas.map((p, i) => (
                      <BarraRanking
                        key={p.path}
                        posicao={i + 1}
                        rotulo={p.path}
                        mono
                        valor={formatarNumero(p.views)}
                        nota={`· ${formatarNumero(p.unique)} únicos`}
                        largura={larguraBarra(p.views, maxPagina)}
                        cor={COR_SERIE_BARRA}
                      />
                    ))}
                  </ul>
                )}
              </Painel>

              <Painel
                titulo="Distribuição por país"
                descricao="Visualizações por origem geográfica da sessão."
                icone={<Globe size={15} />}
              >
                {primeiraCarga ? (
                  <div className="space-y-4 py-1">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="space-y-1.5">
                        <Skeleton className="h-3 w-1/2" />
                        <Skeleton className="h-2 w-full rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : (dados?.topPaises.length ?? 0) === 0 ? (
                  <Moldura>
                    <EstadoVazio
                      icone={<Globe size={20} />}
                      titulo="Sem origem geográfica"
                      descricao="Nenhuma visualização do período trouxe país identificado."
                    />
                  </Moldura>
                ) : (
                  <ul className="space-y-3">
                    {dados?.topPaises.map((p, i) => {
                      const nome = nomeDoPais(p.country);
                      return (
                        <BarraRanking
                          key={p.country}
                          posicao={i + 1}
                          // Bandeira + sigla + nome: três codificações da mesma
                          // identidade. A cor da barra NÃO identifica o país —
                          // é uma série só, com uma cor só (a azul da paleta,
                          // no lugar do magenta que não existia no sistema).
                          rotulo={`${bandeiraPais(p.country)}  ${p.country.toUpperCase()}`}
                          detalhe={nome ?? undefined}
                          valor={formatarNumero(p.views)}
                          nota="visualizações"
                          largura={larguraBarra(p.views, maxPais)}
                          cor={COR_SERIE_BARRA}
                        />
                      );
                    })}
                  </ul>
                )}
              </Painel>
            </div>
          </section>

          {/* ─── Ativos agora ───────────────────────────────────────────── */}
          <section className="space-y-4">
            <Secao
              titulo="Presença"
              descricao="Sessões vistas nos últimos 5 minutos, no instante em que esta leitura foi feita."
              acao={
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-800/70 ring-1 ring-inset ring-slate-700/60 px-2.5 py-1 rounded-full">
                  <Activity size={11} className="text-emerald-400" />
                  Ao vivo
                </span>
              }
            />

            <Painel
              titulo="Ativos agora"
              descricao="Quem está navegando neste momento e em qual rota."
              semPadding
              acao={
                !primeiraCarga && dados ? (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-300 bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/20 px-2.5 py-1 rounded-full tabular-nums">
                    <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    {formatarNumero(dados.ativosAgora.length)}
                    {dados.ativosAgora.length === 1 ? " sessão" : " sessões"}
                  </span>
                ) : undefined
              }
            >
              {primeiraCarga ? (
                <div className="p-5 space-y-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-xl" />
                  ))}
                </div>
              ) : (dados?.ativosAgora.length ?? 0) === 0 ? (
                <EstadoVazio
                  icone={<Users size={20} />}
                  titulo="Ninguém navegando agora"
                  descricao="Nenhuma sessão ativa nos últimos 5 minutos. Recarregue para checar de novo."
                />
              ) : (
                <ul className="divide-y divide-slate-800/60">
                  {dados?.ativosAgora.map((s) => {
                    const segundos = segundosDesde(s.lastSeen);
                    const nomePais = s.country ? nomeDoPais(s.country) : null;
                    return (
                      <li
                        key={s.sessionId}
                        className="px-5 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 transition-[background-color] duration-200 hover:bg-slate-800/40"
                      >
                        <div className="min-w-0 flex-1 basis-[220px]">
                          <p className="text-[11px] font-bold text-slate-100 truncate">
                            {s.userName ?? s.userEmail ?? "Visitante anônimo"}
                          </p>
                          <p className="text-[10px] text-slate-500 truncate">
                            {/* Só repete o email quando ele não é o título da
                                linha — senão a sessão anônima ficaria com duas
                                linhas dizendo a mesma coisa. */}
                            {s.userName && s.userEmail
                              ? s.userEmail
                              : s.userEmail
                                ? "Sessão identificada"
                                : "Sem cadastro vinculado"}
                          </p>
                        </div>

                        <p className="font-mono text-[11px] text-slate-300 truncate min-w-0 flex-1 basis-[180px]">
                          {s.path ?? "—"}
                        </p>

                        <p className="text-[11px] text-slate-400 whitespace-nowrap shrink-0 flex items-center gap-1.5">
                          {s.country ? (
                            <>
                              <span aria-hidden>{bandeiraPais(s.country)}</span>
                              <span className="font-medium">{s.country.toUpperCase()}</span>
                              {nomePais && <span className="text-slate-500 hidden sm:inline">{nomePais}</span>}
                            </>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </p>

                        <p
                          className="text-[11px] text-slate-400 tabular-nums whitespace-nowrap shrink-0 w-20 text-right"
                          title={formatarDataHora(s.lastSeen)}
                        >
                          {segundos === null ? "—" : tempoRelativo(segundos)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Painel>
          </section>

          {/* ─── Erros recentes ─────────────────────────────────────────── */}
          <section className="space-y-4">
            <Secao
              titulo="Erros do sistema"
              descricao="Contagem por tipo na janela inteira e as até 20 ocorrências mais recentes. Marcar como resolvido grava no banco na hora."
            />

            {falhaResolucao && (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 flex items-start gap-3">
                <AlertTriangle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-300 leading-relaxed">{falhaResolucao}</p>
              </div>
            )}

            {/* A rota já paga esta agregação (GROUP BY "errorType" sobre a
                janela inteira) e ela responde ao que a lista abaixo NÃO
                responde: a lista para nas 20 ocorrências mais recentes, esta
                contagem cobre o período todo. Medida única ⇒ uma cor só, a
                mesma dos outros rankings — a cor aqui não identifica o tipo,
                quem identifica é o rótulo escrito.

                O painel fica SEMPRE montado e diz o vazio com <EstadoVazio>,
                igual a "Top páginas" e "Distribuição por país" — sumir da tela
                quando não há dado faria o bloco de erros mudar de anatomia entre
                uma leitura e outra. O texto do vazio fala de CATEGORIA (não de
                ocorrência) para não repetir a frase do painel logo abaixo.

                Zero-por-falha não passa por aqui: a rota monta a resposta com
                Promise.all — ou volta inteira, ou volta 500 — então uma queda
                cai no <EstadoErro> da tela (primeira carga) ou na faixa de
                "última leitura bem-sucedida" no topo, e nunca numa barra de
                comprimento zero fingindo ser contagem real. */}
            <Painel
              titulo="Erros por tipo"
              descricao={`Ocorrências agrupadas por categoria nos últimos ${dias} dias, incluindo as que não couberam na lista abaixo.`}
              icone={<Layers size={15} />}
            >
              {primeiraCarga ? (
                <div className="space-y-4 py-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="space-y-1.5">
                      <Skeleton className="h-3 w-1/3" />
                      <Skeleton className="h-2 w-full rounded-full" />
                    </div>
                  ))}
                </div>
              ) : (dados?.errosPorTipo.length ?? 0) === 0 ? (
                <EstadoVazio
                  icone={<Layers size={20} />}
                  titulo="Nenhuma categoria de erro"
                  descricao={`Nada foi agrupado nos últimos ${dias} dias — não há tipo de erro para contar nesta janela.`}
                />
              ) : (
                <ul className="space-y-3">
                  {dados?.errosPorTipo.map((t, i) => (
                    <BarraRanking
                      key={t.errorType}
                      posicao={i + 1}
                      rotulo={t.errorType}
                      mono
                      valor={formatarNumero(t.count)}
                      nota={t.count === 1 ? "ocorrência" : "ocorrências"}
                      largura={larguraBarra(t.count, maxTipoErro)}
                      cor={COR_SERIE_BARRA}
                    />
                  ))}
                </ul>
              )}
            </Painel>

            <Painel
              titulo="Erros recentes"
              descricao={
                !primeiraCarga && dados
                  ? `${formatarNumero(totalErrosLista)} na lista · ${formatarNumero(pendentesLista)} ${
                      pendentesLista === 1 ? "pendente" : "pendentes"
                    }`
                  : undefined
              }
              semPadding
              acao={
                <div
                  role="group"
                  aria-label="Filtrar erros por estado de resolução"
                  className="flex items-center gap-1 rounded-xl bg-slate-900/70 ring-1 ring-inset ring-slate-700/50 p-1"
                >
                  {FILTROS_ERRO.map((f) => (
                    <button
                      key={f.valor}
                      type="button"
                      aria-pressed={filtroErros === f.valor}
                      onClick={() => setFiltroErros(f.valor)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-colors duration-200",
                        filtroErros === f.valor
                          ? "bg-blue-500/15 text-blue-200 ring-1 ring-inset ring-blue-400/35"
                          : "text-slate-500 hover:text-slate-300"
                      )}
                    >
                      {f.rotulo}
                    </button>
                  ))}
                </div>
              }
            >
              {primeiraCarga ? (
                <div className="p-5 space-y-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-xl" />
                  ))}
                </div>
              ) : errosVisiveis.length === 0 ? (
                // Dois vazios diferentes: "não há erro nenhum" é notícia boa;
                // "o filtro escondeu tudo" é estado da UI. Dizer a mesma frase
                // nos dois casos faria o operador achar que o sistema está
                // limpo quando ele só está com um filtro ligado.
                totalErrosLista === 0 ? (
                  <EstadoVazio
                    icone={<CheckCircle size={20} />}
                    titulo="Nenhum erro no período"
                    descricao="Nada foi registrado na janela selecionada. Erros antigos ainda abertos aparecem no card “Erros não resolvidos”."
                  />
                ) : (
                  <EstadoVazio
                    icone={<Layers size={20} />}
                    titulo="Nenhum erro neste filtro"
                    descricao={`Existem ${formatarNumero(totalErrosLista)} erros na janela, mas nenhum se encaixa no filtro atual.`}
                    acao={
                      <button type="button" className={BOTAO_SEC} onClick={() => setFiltroErros("todos")}>
                        Ver todos
                      </button>
                    }
                  />
                )
              ) : (
                <ul className="divide-y divide-slate-800/60">
                  {errosVisiveis.map((e) => {
                    const expandido = erroExpandido === e.id;
                    const temSugestao = e.fixSuggestion !== null;
                    return (
                      <li key={e.id}>
                        <div
                          className={cn(
                            "px-5 py-4 flex flex-wrap items-start gap-x-4 gap-y-3 transition-[background-color] duration-200",
                            e.resolved ? "hover:bg-slate-800/30" : "hover:bg-slate-800/50"
                          )}
                        >
                          <div className="min-w-0 flex-1 basis-[280px] space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Tipo do erro em caixa NEUTRA: é um rótulo de
                                  categoria ("ReferenceError"), não um estado.
                                  Quem carrega a cor de estado é o badge de
                                  resolução ao lado — pintar os dois de vermelho
                                  gastaria a cor grave em algo que não é alarme. */}
                              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold px-2 py-[3px] rounded-full bg-slate-800/70 ring-1 ring-inset ring-slate-700/60 text-slate-300 whitespace-nowrap">
                                <AlertTriangle size={10} className="text-rose-400 shrink-0" />
                                {e.errorType}
                              </span>
                              <BadgeResolucao resolvido={e.resolved} />
                              {e.statusCode !== null && (
                                <span className="text-[10px] font-bold text-slate-500 tabular-nums">
                                  HTTP {e.statusCode}
                                </span>
                              )}
                            </div>

                            <p className="text-[11px] text-slate-300 leading-relaxed break-words">
                              {e.errorMessage}
                            </p>

                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="font-mono text-[10px] text-slate-500 truncate max-w-[260px]">
                                {e.path}
                              </span>
                              <span className="text-[10px] text-slate-500 tabular-nums whitespace-nowrap">
                                {formatarDataHora(e.createdAt)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {e.resolved ? (
                              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-400 whitespace-nowrap">
                                <CheckCircle size={13} className="text-emerald-400 shrink-0" />
                                Resolvido
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void resolverErro(e.id)}
                                disabled={resolvendoId === e.id}
                                className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/25 text-emerald-300 text-[11px] font-bold hover:bg-emerald-500/20 hover:ring-emerald-400/40 transition-[background-color,box-shadow] duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <CheckCircle size={12} />
                                {resolvendoId === e.id ? "Marcando…" : "Marcar resolvido"}
                              </button>
                            )}

                            {/* O botão de expandir só existe quando HÁ o que
                                expandir. Antes ele aparecia em toda linha e
                                abria um vazio nos erros sem sugestão. */}
                            {temSugestao && (
                              <button
                                type="button"
                                onClick={() => setErroExpandido(expandido ? null : e.id)}
                                aria-expanded={expandido}
                                aria-label={
                                  expandido ? "Ocultar sugestão de correção" : "Ver sugestão de correção"
                                }
                                title={expandido ? "Ocultar sugestão" : "Ver sugestão de correção"}
                                className="p-2 rounded-xl bg-slate-800/70 ring-1 ring-inset ring-slate-700/60 text-slate-400 hover:text-slate-200 hover:ring-slate-500/50 transition-[color,box-shadow] duration-200"
                              >
                                {expandido ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              </button>
                            )}
                          </div>
                        </div>

                        {expandido && e.fixSuggestion && (
                          <div className="px-5 pb-4 -mt-1">
                            <div className="rounded-xl border border-slate-700/50 bg-slate-950/40 p-3.5 flex items-start gap-2.5">
                              <Target size={13} className="text-slate-500 mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                                  Sugestão de correção
                                </p>
                                <p className="text-[11px] text-slate-300 leading-relaxed break-words whitespace-pre-line">
                                  {e.fixSuggestion}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Painel>
          </section>

          {/* ─── Ranking de receita ─────────────────────────────────────── */}
          <section className="space-y-4">
            <Secao
              titulo="Receita por cliente"
              descricao="Estimativa: preço de tabela do plano × meses desde a assinatura. Não é o valor efetivamente cobrado."
            />

            <Painel
              titulo="Ranking de receita"
              descricao="Os 10 clientes com maior total estimado, independentemente do período."
              icone={<Crown size={15} />}
              semPadding
            >
              {primeiraCarga ? (
                <div className="p-5 space-y-3">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-11 w-full rounded-xl" />
                  ))}
                </div>
              ) : (dados?.rankingReceita.length ?? 0) === 0 ? (
                <EstadoVazio
                  icone={<Crown size={20} />}
                  titulo="Nenhum cliente na base"
                  descricao="Assim que houver conta cadastrada, o ranking estimado aparece aqui."
                />
              ) : (
                // O scroll horizontal é DESTE contêiner, nunca do body: a
                // página inteira rolando de lado no mobile é o sintoma clássico
                // de tabela larga sem moldura própria.
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[680px] border-separate border-spacing-0">
                    <thead>
                      <tr>
                        <th scope="col" className={cn(CELULA_TH, "w-12")}>
                          #
                        </th>
                        <th scope="col" className={CELULA_TH}>
                          Cliente
                        </th>
                        <th scope="col" className={CELULA_TH}>
                          Plano
                        </th>
                        <th scope="col" className={cn(CELULA_TH, "text-right")}>
                          Total pago (estimado)
                        </th>
                        <th scope="col" className={CELULA_TH}>
                          Entrou em
                        </th>
                      </tr>
                    </thead>
                    {/* `divide-y` não funciona com `border-separate`, então o
                        separador vai como border-top em cada célula. O
                        `:not(:first-child)` evita a linha dupla logo abaixo do
                        cabeçalho, que já tem a borda dele. */}
                    <tbody className="[&>tr:not(:first-child)>td]:border-t [&>tr>td]:border-slate-800/60">
                      {dados?.rankingReceita.map((u, i) => (
                        <tr key={u.userId} className="transition-[background-color] duration-200 hover:bg-slate-800/50">
                          <td className="px-5 py-3 text-[11px] font-black text-slate-500 tabular-nums">
                            {i + 1}
                          </td>
                          <td className="px-5 py-3 min-w-0">
                            <p className="text-[11px] font-bold text-slate-100 truncate max-w-[240px]">
                              {u.name ?? "Sem nome"}
                            </p>
                            <p className="text-[10px] text-slate-500 truncate max-w-[240px]">{u.email}</p>
                          </td>
                          <td className="px-5 py-3">
                            {/* Mesma anatomia do badge de plano da tela de
                                assinaturas: ponto colorido de PALETA_PLANO +
                                NOME por extenso. A cor nunca identifica o plano
                                sozinha — foi por isso que o roxo antigo saiu. */}
                            <span className="inline-flex items-center gap-1.5 text-[9px] font-bold px-2 py-[3px] rounded-full bg-slate-800/70 ring-1 ring-inset ring-slate-700/60 text-slate-300 uppercase tracking-wide whitespace-nowrap">
                              <span
                                aria-hidden
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: corDoPlano(u.plan) }}
                              />
                              {rotuloPlano(u.plan)}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right text-xs font-bold text-slate-100 tabular-nums whitespace-nowrap">
                            {formatarMoeda(u.totalPaid)}
                          </td>
                          <td className="px-5 py-3 text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                            {formatarData(u.joinedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Painel>
          </section>
        </>
      )}

      {/* Rodapé: o que o período controla de fato. Sem isso o operador troca
          para 7 dias, vê "ativos agora" igual e acha que a tela travou. */}
      <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-800/60 pt-5">
        O período selecionado ({dias} dias) define a janela de visualizações, páginas, países e erros
        listados. “Ativos agora”, “erros não resolvidos” e o ranking de receita são a foto do estado
        atual e não mudam com o filtro.
      </p>
    </div>
  );
}
