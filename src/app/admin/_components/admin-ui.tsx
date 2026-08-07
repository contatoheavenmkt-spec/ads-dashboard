"use client";

import type { ReactNode } from "react";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Layers, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Peças visuais compartilhadas pelas telas do painel admin
 * (dashboard, contas, assinaturas).
 *
 * Regra de ouro deste arquivo: NADA aqui faz fetch nem toca em banco.
 * São só formatadores puros + componentes de apresentação. Assim as três
 * telas podem evoluir em paralelo sem brigar por estado compartilhado.
 */

/**
 * Formatadores e paleta agora moram em `admin-format.ts`, um módulo SEM
 * "use client".
 *
 * Motivo: /admin/finance é Server Component e precisa CHAMAR essas funções.
 * Chamar função de módulo cliente quebra em runtime — o bundler troca o export
 * por client reference. Reexportados aqui para que os imports já existentes
 * das telas cliente (`from "./admin-ui"`) continuem funcionando sem mudança.
 */
export {
  TRACO,
  numeroValido,
  formatarMoeda,
  formatarNumero,
  formatarPercentual,
  formatarData,
  formatarDataHora,
  tempoRelativo,
  COR_SUPERFICIE,
  COR_PLANO_PADRAO,
  PALETA_PLANO,
  corDoPlano,
  COR_STATUS,
} from "./admin-format";

// Import além do reexport: o corpo DESTE arquivo usa alguns desses símbolos
// internamente (Sparkline, BadgeStatus, Paginacao, CardKpi) e `export ... from`
// não os traz para o escopo do módulo.
import {
  COR_PLANO_PADRAO,
  COR_STATUS,
  COR_SUPERFICIE,
  PALETA_PLANO,
  TRACO,
  formatarMoeda,
  formatarNumero,
  formatarPercentual,
  numeroValido,
} from "./admin-format";


// ─── Skeleton ─────────────────────────────────────────────────────────────────

/**
 * Bloco animado que ocupa o lugar do conteúdo enquanto carrega.
 * O painel migrou de spinner central pra skeleton: o usuário já vê a *forma*
 * do layout e a tela não "pisca" quando os dados chegam.
 *
 * O brilho é um gradiente estático pulsando (`animate-pulse`, que já vem do
 * Tailwind) em vez de um shimmer que varre: uma varredura exigiria keyframe
 * próprio no CSS global, e não vale arriscar o build por uma animação.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded bg-gradient-to-r from-slate-800/70 via-slate-700/60 to-slate-800/70",
        className
      )}
      {...props}
    />
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

export interface SparklineProps {
  /** Série na ordem cronológica. Valores não-finitos são descartados. */
  dados: number[];
  /** Cor da linha e do gradiente. Padrão: azul da paleta. */
  cor?: string;
  /** Altura em px. Padrão: 40. */
  altura?: number;
  className?: string;
  /** Quando informado, o gráfico vira `role="img"` com esse rótulo.
   *  Sem ele o SVG é decorativo (o número do card já diz tudo). */
  rotulo?: string;
}

/** Largura em unidades do viewBox. O SVG estica na horizontal (o eixo X de um
 *  sparkline é só "tempo passando"), e a linha mantém 2px reais por causa do
 *  `vectorEffect="non-scaling-stroke"`. */
const SPARK_LARGURA = 100;
/** Margem vertical pra linha de 2px não ser cortada nas bordas. */
const SPARK_RESPIRO = 3;

/**
 * Mini-gráfico de tendência pra dentro de card — SVG puro, sem recharts.
 * Sem eixo, sem grid, sem rótulo: a forma da curva é toda a informação.
 *
 * Tolera array vazio (renderiza um vão da mesma altura, sem quebrar o layout)
 * e série constante (todos os valores iguais → linha no meio, sem dividir por
 * zero na escala).
 */
export function Sparkline({ dados, cor = "#3b82f6", altura = 40, className, rotulo }: SparklineProps) {
  const h = numeroValido(altura) && altura > 0 ? Math.round(altura) : 40;
  const traco = typeof cor === "string" && cor.trim() !== "" ? cor : "#3b82f6";
  const pontos = Array.isArray(dados) ? dados.filter(numeroValido) : [];

  // Nada pra desenhar: devolve o espaço reservado pra que o card não pule de
  // altura quando a série chegar.
  if (pontos.length === 0) {
    return <div aria-hidden className={cn("w-full", className)} style={{ height: h }} />;
  }

  // Respiro encolhe junto com alturas minúsculas — senão `h - respiro*2` fica
  // negativo e a curva sai invertida.
  const respiro = Math.min(SPARK_RESPIRO, Math.max(0, (h - 2) / 2));

  const min = pontos.reduce((a, v) => (v < a ? v : a), pontos[0]);
  const max = pontos.reduce((a, v) => (v > a ? v : a), pontos[0]);
  const amplitude = max - min;

  const paraY = (v: number) =>
    amplitude === 0 ? h / 2 : respiro + (1 - (v - min) / amplitude) * (h - respiro * 2);

  const coords: Array<[number, number]> =
    pontos.length === 1
      ? // Um ponto só não tem tendência: vira uma linha reta no meio, que lê
        // como "sem variação" em vez de um pixel solto no canto.
        [
          [0, paraY(pontos[0])],
          [SPARK_LARGURA, paraY(pontos[0])],
        ]
      : pontos.map((v, i): [number, number] => [(i / (pontos.length - 1)) * SPARK_LARGURA, paraY(v)]);

  const linha = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const area = `${linha} L${SPARK_LARGURA},${h} L0,${h} Z`;

  // Id derivado da cor (sanitizado) em vez de useId(): o conteúdo do gradiente
  // depende só da cor, então dois sparklines da mesma cor gerando o mesmo id
  // resolvem pro mesmo gradiente — idêntico ao que já se faz no world-map.
  const idGradiente = `dashfy-spark-${traco.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <svg
      className={cn("block w-full overflow-visible", className)}
      height={h}
      viewBox={`0 0 ${SPARK_LARGURA} ${h}`}
      preserveAspectRatio="none"
      role={rotulo ? "img" : undefined}
      aria-label={rotulo}
      aria-hidden={rotulo ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={idGradiente} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={traco} stopOpacity={0.28} />
          <stop offset="100%" stopColor={traco} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${idGradiente})`} stroke="none" />
      <path
        d={linha}
        fill="none"
        stroke={traco}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// ─── Secao ────────────────────────────────────────────────────────────────────

/**
 * Cabeçalho de seção padronizado — o que dá ritmo às telas longas.
 * Título curto em maiúsculas, acento vertical à esquerda, ação opcional
 * (botão, filtro, link) alinhada à direita.
 */
export function Secao({
  titulo,
  descricao,
  acao,
  className,
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-2", className)}>
      <div className="flex items-start gap-3 min-w-0">
        <span
          aria-hidden
          className="mt-0.5 h-8 w-[3px] rounded-full bg-gradient-to-b from-blue-400 via-blue-500/60 to-transparent shrink-0"
        />
        <div className="min-w-0">
          <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-300 leading-tight">{titulo}</h2>
          {descricao && <p className="mt-1 text-xs text-slate-500 leading-relaxed">{descricao}</p>}
        </div>
      </div>
      {acao && <div className="shrink-0">{acao}</div>}
    </div>
  );
}

// ─── CardKpi ──────────────────────────────────────────────────────────────────

/** Tom do card: acento visual (anel, ícone, brilho), NUNCA a cor do valor —
 *  texto usa cor de texto, a cor mora na marca ao lado. */
export type TomKpi = "neutro" | "bom" | "atencao" | "grave";

const TOM_CARD: Record<TomKpi, { anel: string; anelHover: string; icone: string; brilho: string; serie: string }> = {
  neutro: {
    anel: "ring-blue-500/40",
    anelHover: "hover:ring-blue-400/60",
    icone: "bg-blue-500/10 ring-blue-500/25 text-blue-400",
    brilho: "bg-blue-500/25",
    serie: "#3b82f6",
  },
  bom: {
    anel: "ring-emerald-500/40",
    anelHover: "hover:ring-emerald-400/60",
    icone: "bg-emerald-500/10 ring-emerald-500/25 text-emerald-400",
    brilho: "bg-emerald-500/25",
    serie: COR_STATUS.bom,
  },
  atencao: {
    anel: "ring-amber-500/40",
    anelHover: "hover:ring-amber-400/60",
    icone: "bg-amber-500/10 ring-amber-500/25 text-amber-400",
    brilho: "bg-amber-500/25",
    serie: COR_STATUS.atencao,
  },
  grave: {
    anel: "ring-rose-500/40",
    anelHover: "hover:ring-rose-400/60",
    icone: "bg-rose-500/10 ring-rose-500/25 text-rose-400",
    brilho: "bg-rose-500/25",
    serie: COR_STATUS.grave,
  },
};

export interface CardKpiProps {
  titulo: string;
  /** Opcional de propósito: em `carregando`/`indisponivel` não existe valor
   *  pra passar, e forçar um `0` de placeholder é exatamente o bug que o
   *  estado "indisponível" existe pra evitar. */
  valor?: string | number | null;
  sufixo?: string;
  icone?: ReactNode;
  variacao?: { valor: number; rotulo: string };
  /** Marque quando a agregação correspondente veio em `degradado` na resposta
   *  da API. Sem isso, um zero-por-erro passa como número real. */
  indisponivel?: boolean;
  carregando?: boolean;
  destaque?: boolean;
  /** Acento de estado. Só pinta anel/ícone/brilho — o valor continua em
   *  slate-100 em qualquer tom. Padrão: "neutro". */
  tom?: TomKpi;
  /** Série opcional pra tendência no rodapé do card (SVG puro). Precisa de
   *  pelo menos 2 pontos válidos pra aparecer. */
  serie?: number[];
  /** Sobrescreve a cor da série. Padrão: a cor do `tom`. */
  corSerie?: string;
  className?: string;
}

export function CardKpi({
  titulo,
  valor,
  sufixo,
  icone,
  variacao,
  indisponivel = false,
  carregando = false,
  destaque = false,
  tom = "neutro",
  serie,
  corSerie,
  className,
}: CardKpiProps) {
  // Números crus são formatados aqui; strings já vêm prontas do chamador
  // (ex.: formatarMoeda(mrr)). Um número inválido nunca chega na tela.
  const valorTexto =
    typeof valor === "number"
      ? formatarNumero(valor)
      : typeof valor === "string" && valor.trim() !== ""
        ? valor
        : TRACO;

  // Variação só aparece se for um número utilizável — senão viraria "NaN%".
  // O typeof está inline (e não escondido atrás de um boolean nomeado) pra que
  // o estreitamento de tipo não dependa de análise de alias do compilador.
  const varBruto = variacao?.valor;
  const temVariacao = typeof varBruto === "number" && Number.isFinite(varBruto);
  const varValor = typeof varBruto === "number" && Number.isFinite(varBruto) ? varBruto : 0;
  const varCor =
    varValor > 0
      ? "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20"
      : varValor < 0
        ? "text-rose-400 bg-rose-500/10 ring-rose-500/20"
        : "text-slate-400 bg-slate-700/40 ring-slate-600/40";

  const cfg = TOM_CARD[tom] ?? TOM_CARD.neutro;
  // O acento aparece quando o card é o protagonista da faixa OU quando carrega
  // um estado — um card neutro comum continua discreto, que é o que faz o
  // destaque significar alguma coisa.
  const acentuado = destaque || tom !== "neutro";

  // Sufixo com dígito ganha tabular-nums junto com o valor, senão "+1.204 em
  // 7d" dança de largura a cada atualização do realtime.
  const sufixoNumerico = typeof sufixo === "string" && /\d/.test(sufixo);

  const pontosSerie = Array.isArray(serie) ? serie.filter(numeroValido) : [];
  const mostrarSerie = !carregando && !indisponivel && pontosSerie.length >= 2;

  return (
    <div
      className={cn(
        "group relative overflow-hidden glass-panel rounded-2xl p-5 flex flex-col justify-between gap-3.5 min-w-0",
        // ring em vez de border/bg: `.glass-panel` define os shorthands
        // `border` e `background`, então sobrescrever com utilitário de cor
        // dependeria da ordem no CSS gerado. `ring` não conflita com nada
        // (e o fundo extra vem das camadas absolutas abaixo, não de `bg-*`).
        "ring-1 ring-slate-100/[0.04] hover:ring-slate-400/25",
        // Só box-shadow e ring animam. `transition-all` num card que atualiza
        // de 10 em 10 segundos anima também o texto trocando de largura.
        "transition-[border-color,box-shadow] duration-300 ease-out",
        "hover:shadow-xl hover:shadow-slate-950/50",
        acentuado && cfg.anel,
        acentuado && cfg.anelHover,
        className
      )}
    >
      {/* Camadas decorativas: fora do fluxo, nunca capturam clique. */}
      {destaque && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-100/[0.07] via-transparent to-transparent"
        />
      )}
      {acentuado && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -top-12 -right-10 h-28 w-28 rounded-full blur-3xl opacity-70",
            cfg.brilho
          )}
        />
      )}

      <div className="relative flex items-start justify-between gap-3">
        <p
          className={cn(
            "text-[10px] font-black uppercase tracking-widest leading-tight",
            destaque ? "text-slate-400" : "text-slate-500"
          )}
        >
          {titulo}
        </p>
        {icone && (
          <div
            className={cn(
              "w-9 h-9 rounded-xl ring-1 ring-inset flex items-center justify-center shrink-0",
              acentuado ? cfg.icone : "bg-slate-800/70 ring-slate-700/60 text-slate-400"
            )}
          >
            {icone}
          </div>
        )}
      </div>

      {carregando ? (
        <div className="relative space-y-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-2.5 w-20" />
        </div>
      ) : indisponivel ? (
        // Nunca mostramos o valor aqui: quando a agregação falhou no backend
        // ela volta ZERADA, e um "R$ 0,00" seria lido como número real.
        <div
          className="relative flex items-center gap-2 text-amber-400 cursor-help"
          title="Falha ao carregar este indicador"
        >
          <AlertTriangle size={15} className="shrink-0" />
          <span className="text-sm font-bold leading-none">indisponível</span>
        </div>
      ) : (
        <div className="relative space-y-2 min-w-0">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span
              className={cn(
                // tabular-nums: o realtime reescreve esses números a cada 10s e
                // dígitos de largura variável fazem o card inteiro tremer.
                "font-black text-slate-100 leading-none tracking-tight tabular-nums truncate",
                destaque ? "text-3xl md:text-[2.125rem]" : "text-2xl md:text-[1.75rem]"
              )}
            >
              {valorTexto}
            </span>
            {sufixo && (
              <span
                className={cn(
                  "text-[11px] text-slate-500 font-medium shrink-0",
                  sufixoNumerico && "tabular-nums"
                )}
              >
                {sufixo}
              </span>
            )}
          </div>

          {temVariacao && (
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={cn(
                  "text-[10px] font-bold flex items-center gap-0.5 px-1.5 py-0.5 rounded-full ring-1 ring-inset tabular-nums shrink-0",
                  varCor
                )}
              >
                {varValor > 0 && <ArrowUp size={10} strokeWidth={3} />}
                {varValor < 0 && <ArrowDown size={10} strokeWidth={3} />}
                {formatarPercentual(Math.abs(varValor))}
              </span>
              <span className="text-[10px] text-slate-500 truncate">{variacao?.rotulo}</span>
            </div>
          )}
        </div>
      )}

      {mostrarSerie && (
        // Sangra até as bordas do card (o padding é 5 = 1.25rem) pra tendência
        // virar base do card, não um gráfico espremido dentro dele.
        <div className="relative -mx-5 -mb-5 -mt-1 opacity-90">
          <Sparkline dados={pontosSerie} cor={corSerie ?? cfg.serie} altura={destaque ? 44 : 34} />
        </div>
      )}
    </div>
  );
}

// ─── BadgeStatus ──────────────────────────────────────────────────────────────

/**
 * Rótulo + cor por status. A chave é comparada em minúsculas porque a API
 * mistura status de assinatura ("active", "trialing") com flags derivadas
 * ("vencido", "erro") vindas de lugares diferentes.
 *
 * `ponto` é quem carrega a identidade (a marca colorida); `caixa` é só um véu
 * do mesmo matiz. O texto fica sempre em cor de texto — colorir a palavra
 * inteira derruba o contraste e some pra quem tem daltonismo.
 */
const STATUS_MAP: Record<string, { rotulo: string; ponto: string; caixa: string }> = {
  active: { rotulo: "Ativo", ponto: "bg-emerald-400", caixa: "bg-emerald-500/10 ring-emerald-500/20" },
  ativo: { rotulo: "Ativo", ponto: "bg-emerald-400", caixa: "bg-emerald-500/10 ring-emerald-500/20" },
  online: { rotulo: "Online", ponto: "bg-emerald-400", caixa: "bg-emerald-500/10 ring-emerald-500/20" },
  // Cortesia tem o MESMO acesso de "Ativo", mas não é receita — por isso não
  // usa o verde do pagante: o operador leria faturamento onde não há. Violeta
  // a separa dos dois vizinhos (verde = paga, azul = em teste), e como sempre
  // nesta tabela quem carrega a identidade de fato é o rótulo escrito.
  cortesia: { rotulo: "Cortesia", ponto: "bg-violet-400", caixa: "bg-violet-500/10 ring-violet-500/20" },
  trialing: { rotulo: "Em teste", ponto: "bg-blue-400", caixa: "bg-blue-500/10 ring-blue-500/20" },
  trial: { rotulo: "Trial", ponto: "bg-blue-400", caixa: "bg-blue-500/10 ring-blue-500/20" },
  expired: { rotulo: "Expirado", ponto: "bg-slate-500", caixa: "bg-slate-700/40 ring-slate-600/40" },
  expirado: { rotulo: "Expirado", ponto: "bg-slate-500", caixa: "bg-slate-700/40 ring-slate-600/40" },
  canceled: { rotulo: "Cancelado", ponto: "bg-slate-500", caixa: "bg-slate-700/40 ring-slate-600/40" },
  cancelado: { rotulo: "Cancelado", ponto: "bg-slate-500", caixa: "bg-slate-700/40 ring-slate-600/40" },
  inativo: { rotulo: "Inativo", ponto: "bg-slate-500", caixa: "bg-slate-700/40 ring-slate-600/40" },
  offline: { rotulo: "Offline", ponto: "bg-slate-500", caixa: "bg-slate-700/40 ring-slate-600/40" },
  error: { rotulo: "Erro", ponto: "bg-rose-400", caixa: "bg-rose-500/10 ring-rose-500/20" },
  erro: { rotulo: "Erro", ponto: "bg-rose-400", caixa: "bg-rose-500/10 ring-rose-500/20" },
  vencido: { rotulo: "Vencido", ponto: "bg-amber-400", caixa: "bg-amber-500/10 ring-amber-500/20" },
  inadimplente: { rotulo: "Inadimplente", ponto: "bg-amber-400", caixa: "bg-amber-500/10 ring-amber-500/20" },
  pendente: { rotulo: "Pendente", ponto: "bg-amber-400", caixa: "bg-amber-500/10 ring-amber-500/20" },
};

export function BadgeStatus({ status, className }: { status: string; className?: string }) {
  const chave = typeof status === "string" ? status.trim().toLowerCase() : "";
  const conhecido = STATUS_MAP[chave];

  // Status desconhecido ainda precisa aparecer (é sinal de dado novo na API),
  // mas em cinza neutro e com o texto cru — nunca "undefined".
  const rotulo = conhecido?.rotulo ?? (chave === "" ? TRACO : status);
  const ponto = conhecido?.ponto ?? "bg-slate-500";
  const caixa = conhecido?.caixa ?? "bg-slate-800/70 ring-slate-700/60";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[9px] font-bold px-2 py-[3px] rounded-full ring-1 ring-inset uppercase tracking-wide whitespace-nowrap text-slate-300",
        caixa,
        className
      )}
    >
      <span aria-hidden className={cn("w-1.5 h-1.5 rounded-full shrink-0", ponto)} />
      {rotulo}
    </span>
  );
}

// ─── EstadoVazio ──────────────────────────────────────────────────────────────

export function EstadoVazio({
  icone,
  titulo,
  descricao,
  acao,
}: {
  icone?: ReactNode;
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-16 gap-4">
      <div className="relative flex items-center justify-center">
        <span
          aria-hidden
          className="pointer-events-none absolute h-20 w-20 rounded-full bg-blue-500/10 blur-2xl"
        />
        <div className="relative w-14 h-14 rounded-full bg-slate-800/70 ring-1 ring-inset ring-slate-700/60 flex items-center justify-center text-slate-500">
          {icone ?? <Layers size={22} />}
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-base font-black text-slate-200 tracking-tight">{titulo}</p>
        {descricao && <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">{descricao}</p>}
      </div>
      {acao && <div className="mt-1">{acao}</div>}
    </div>
  );
}

// ─── EstadoErro ───────────────────────────────────────────────────────────────

/**
 * Estado terminal de falha de rede/API. Existe pra que nenhuma tela fique
 * eternamente em "carregando" quando o fetch rejeita — sempre há um caminho
 * de volta pelo botão.
 */
export function EstadoErro({
  mensagem,
  onTentarNovamente,
}: {
  mensagem?: string;
  onTentarNovamente: () => void;
}) {
  return (
    // Não usa `.glass-panel` aqui: precisamos da borda avermelhada, e o
    // glass-panel define o shorthand `border` (a cor do Tailwind poderia
    // perder por ordem de declaração). Classes explícitas = resultado certo.
    <div className="relative overflow-hidden bg-slate-900/60 border border-rose-500/20 rounded-2xl flex flex-col items-center justify-center text-center px-6 py-16 gap-4">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 h-40 w-40 rounded-full bg-rose-500/10 blur-3xl"
      />
      <div className="relative w-14 h-14 rounded-full bg-rose-500/10 ring-1 ring-inset ring-rose-500/25 flex items-center justify-center text-rose-400">
        <AlertTriangle size={22} />
      </div>
      <div className="relative space-y-1.5">
        <p className="text-base font-black text-slate-200 tracking-tight">Não foi possível carregar</p>
        <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
          {mensagem ?? "Houve uma falha ao buscar os dados. Verifique a conexão e tente novamente."}
        </p>
      </div>
      <button
        type="button"
        onClick={onTentarNovamente}
        className="relative mt-1 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-950/40 transition-colors"
      >
        <RefreshCw size={13} />
        Tentar novamente
      </button>
    </div>
  );
}

// ─── Paginacao ────────────────────────────────────────────────────────────────

export function Paginacao({
  pagina,
  totalPaginas,
  total,
  porPagina,
  onMudar,
}: {
  pagina: number;
  totalPaginas: number;
  total: number;
  /** Opcional: quando o chamador tem o valor exato da API, o intervalo
   *  "X–Y de Z" fica exato. Sem ele, derivamos de total/totalPaginas. */
  porPagina?: number;
  onMudar: (p: number) => void;
}) {
  const totalSeguro = numeroValido(total) ? Math.max(0, Math.trunc(total)) : 0;
  const paginasSeguro = numeroValido(totalPaginas) ? Math.max(1, Math.trunc(totalPaginas)) : 1;
  const paginaSegura = numeroValido(pagina) ? Math.min(Math.max(1, Math.trunc(pagina)), paginasSeguro) : 1;

  // Sem resultados a paginação não tem o que dizer — quem cobre a tela é o
  // EstadoVazio. Renderizar aqui geraria um "1–0 de 0" sem sentido.
  if (totalSeguro === 0) return null;

  const tamanho =
    numeroValido(porPagina) && porPagina > 0 ? Math.trunc(porPagina) : Math.max(1, Math.ceil(totalSeguro / paginasSeguro));

  const inicio = (paginaSegura - 1) * tamanho + 1;
  const fim = Math.min(paginaSegura * tamanho, totalSeguro);

  const temAnterior = paginaSegura > 1;
  const temProxima = paginaSegura < paginasSeguro;

  // min-h-[38px] + px-3.5: área de toque confortável no mobile, onde a tabela
  // já rola na horizontal e um alvo pequeno erra fácil.
  const botao =
    "inline-flex items-center gap-1.5 min-h-[38px] px-3.5 rounded-xl bg-slate-800/70 ring-1 ring-inset ring-slate-700/60 text-slate-300 text-xs font-bold hover:bg-slate-700/70 hover:ring-slate-500/50 transition-[background-color,box-shadow] duration-200 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-slate-800/70 disabled:hover:ring-slate-700/60";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-[11px] text-slate-500 tabular-nums">
        <span className="text-slate-300 font-bold">
          {formatarNumero(inicio)}–{formatarNumero(fim)}
        </span>{" "}
        de {formatarNumero(totalSeguro)}
      </p>

      <div className="flex items-center gap-2">
        <button type="button" className={botao} disabled={!temAnterior} onClick={() => onMudar(paginaSegura - 1)}>
          <ArrowLeft size={13} />
          Anterior
        </button>
        <span className="text-[11px] text-slate-500 px-1 whitespace-nowrap tabular-nums">
          Página <span className="text-slate-300 font-bold">{paginaSegura}</span> de {paginasSeguro}
        </span>
        <button type="button" className={botao} disabled={!temProxima} onClick={() => onMudar(paginaSegura + 1)}>
          Próxima
          <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}
