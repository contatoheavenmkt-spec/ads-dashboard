"use client";

import {
  useCallback, useEffect, useMemo, useRef, useState,
  type ElementType, type ReactNode,
} from "react";
import NumberFlow from "@number-flow/react";
import {
  AlertTriangle, Clock, Globe, MapPin, Monitor, RefreshCw, Smartphone, Tablet, Users,
} from "lucide-react";
import { projetarEquiretangular } from "@/lib/country-coords";
// COR_SUPERFICIE vem de admin-ui, que é o dono único do valor: redeclarar a cor
// aqui criaria duas fontes para o mesmo #0F172A, livres para divergirem sem
// ninguém perceber. Ela é o VÃO de 2px entre preenchimentos vizinhos.
import { COR_SUPERFICIE } from "./admin-ui";
import { Globo } from "./globe";
import { CONTORNO_TERRA } from "./land-outline";
import { cn } from "@/lib/utils";

/**
 * WorldMap — mapa-múndi "quem está online agora" do painel admin (estilo Live View).
 *
 * Autossuficiente: faz o próprio polling em /api/admin/realtime a cada 10s.
 * Basta `<WorldMap />` dentro de qualquer página admin (client component).
 *
 * Decisões de desenho documentadas ao longo do arquivo — as principais:
 *  1. os continentes usam GEOMETRIA REAL (`land-outline.ts`, Natural Earth
 *     110m), a mesma do globo; a grade de pontos ficou como textura do oceano.
 *     Antes o fundo era só a grade, porque a geometria ainda não existia no
 *     projeto — o mapa virava um retângulo vazio com um marcador solto;
 *  2. a projeção dos pontos vem de `projetarEquiretangular` importada, e não de
 *     uma cópia da fórmula, para não haver como as duas divergirem — inclusive
 *     as linhas de equador/meridiano, que saem da MESMA chamada;
 *  3. o tamanho do marcador codifica o VALOR (sessões), nunca a posição no
 *     ranking: entrar ou sair um país não redimensiona os vizinhos.
 */

// ─── Contrato da API ──────────────────────────────────────────────────────────

type Dispositivo = "mobile" | "desktop" | "tablet";

interface PaisRealtime {
  code: string;
  nome: string;
  lat: number;
  lng: number;
  sessoes: number;
  sessoesLogadas: number;
}

interface SessaoRealtime {
  sessionId: string;
  pais: string | null;
  paisNome: string | null;
  path: string | null;
  segundosAtras: number;
  logado: boolean;
  dispositivo: Dispositivo;
}

interface RealtimeData {
  totalOnline: number;
  paises: PaisRealtime[];
  sessoes: SessaoRealtime[];
  semCoordenada: number;
  janelaMin: number;
  geradoEm: string | null;
}

// ─── Constantes de desenho ────────────────────────────────────────────────────

/**
 * 1000×500 = proporção 2:1, exigida pela projeção equiretangular: 360° de
 * longitude no eixo X e 180° de latitude no eixo Y. Qualquer outra proporção
 * distorce a posição dos pontos.
 */
const LARGURA = 1000;
const ALTURA = 500;

/**
 * Grade fina do fundo. Mais densa e com ponto menor que a versão anterior
 * (12 / r1.3): assim a textura lê como papel milimetrado — intencional — em vez
 * de pontilhado grosso, que competia com os marcadores.
 */
const PASSO_GRADE = 10;
const RAIO_GRADE = 1;

/**
 * Segunda grade, 5× mais esparsa e um tom acima. Dois ritmos sobrepostos são o
 * que faz a textura parecer desenhada; um só, por mais fino, vira ruído.
 */
const PASSO_MARCO = PASSO_GRADE * 5;
const RAIO_MARCO = 1.5;

const RAIO_MIN = 4;
const RAIO_MAX = 14;

/** Ciclo do anel pulsante, em segundos. Dois anéis defasados meio ciclo. */
const CICLO_PULSO = 2.6;

/** Intervalo do polling. Casado com o custo da rota (~2 queries por chamada). */
const INTERVALO_MS = 10_000;

/** Quanto tempo o pontinho de "acabou de chegar dado novo" fica aceso. */
const PISCA_MS = 1200;

/**
 * Ids fixos (e não `useId()`) para os `<defs>`: o conteúdo é idêntico em
 * qualquer instância, então mesmo com dois mapas na tela o `url(#...)`
 * duplicado resolve para uma definição equivalente — sem risco visual.
 * Evita depender do formato do id gerado pelo React, que já mudou entre versões
 * e contém caracteres problemáticos dentro de `url(#...)`.
 */
const ID_GRADE = "dashfy-world-map-grid";
const ID_MARCO = "dashfy-world-map-grid-marco";
const ID_PROFUNDIDADE = "dashfy-world-map-depth";
const ID_MASCARA = "dashfy-world-map-mask";
const ID_HALO = "dashfy-world-map-halo";
const ID_BRILHO = "dashfy-world-map-glow";

/** Cor da série do mapa. É a MESMA em todo marcador: um mapa de presença tem
 *  uma medida só, e variar a cor por volume inventaria uma segunda dimensão. */
const COR_PONTO = "#3b82f6";
const COR_PONTO_BORDA = "#93c5fd";
const COR_NUCLEO = "#eff6ff";
/** Grade e guias: recessivas por definição, nunca disputando com os dados. */
const COR_GRADE = "#1e293b";
const COR_MARCO = "#334155";

/** Terra e litoral — os mesmos tons do globo, para o alternador GLOBO/MAPA não
 *  parecer troca de tema. Ficam entre COR_GRADE e COR_MARCO na escala, então a
 *  malha continua legível por cima sem competir. */
const COR_TERRA = "#243040";
const COR_TERRA_BORDA = "#33445c";

/**
 * Contorno dos continentes já projetado em equiretangular, pronto para o
 * atributo `points` de <polygon>.
 *
 * Calculado UMA vez no módulo, e não num useMemo: diferente do globo — onde a
 * ortográfica depende da rotação e do zoom, e por isso precisa reprojetar a
 * cada arrasto — aqui a projeção é fixa. Nada em tela altera essas coordenadas.
 *
 * Também não há teste de visibilidade nem quebra de caminho: no plate carrée
 * todos os 78 anéis estão sempre inteiramente visíveis. O único salto de 360°
 * do conjunto está no anel da Antártida ([180,-90] → [-180,-90]) e vira um
 * segmento rente à borda inferior do viewBox — é a costura polar correta, não
 * um traço atravessando o mapa. Chukotka já vem pré-cortada na antimeridiana
 * pelo Natural Earth, em duas metades que fecham cada uma na sua borda.
 */
const contornoTerra: string[] = CONTORNO_TERRA.map((anel) =>
  anel
    .map(([lng, lat]) => {
      const { x, y } = projetarEquiretangular(lat, lng, LARGURA, ALTURA);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" "),
);

/**
 * Equador e meridiano de Greenwich derivados da MESMA projeção dos marcadores.
 * Não são decoração: são as duas únicas afirmações geográficas honestas que a
 * grade pode fazer, e sair da função garante que acompanhem qualquer mudança
 * futura em `projetarEquiretangular` sem alguém precisar lembrar de ajustar.
 */
const ORIGEM = projetarEquiretangular(0, 0, LARGURA, ALTURA);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Bandeira via regional indicators. Mesma lógica de admin/analytics/page.tsx. */
function bandeiraDoPais(code: string | null): string {
  if (!code || code.length !== 2) return "🌍";
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((c) => 0x1f1e6 - 65 + c.charCodeAt(0)),
  );
}

/**
 * Converte para número ou devolve o fallback. Não usa `Number(valor)` direto de
 * propósito: `Number(null)` e `Number(true)` são 1 e 0 — finitos — e passariam
 * um `lat: null` como latitude 0, plantando o país no meio do Atlântico em vez
 * de ser descartado pelo filtro.
 */
function numeroSeguro(valor: unknown, fallback = 0): number {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : fallback;
  if (typeof valor === "string" && valor.trim() !== "") {
    const n = Number(valor);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function tempoRelativo(segundos: number): string {
  const s = Math.max(0, Math.round(numeroSeguro(segundos)));
  if (s < 5) return "agora";
  if (s < 60) return `há ${s}s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h} h`;
}

/** `toLocaleTimeString` em data inválida devolve "Invalid Date" — daí o guard. */
function formatarHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// `ElementType` (mesmo tipo usado no StatCard de admin/page.tsx) em vez de
// deixar o TS inferir a união dos três componentes lucide.
function iconeDispositivo(d: Dispositivo): ElementType {
  if (d === "mobile") return Smartphone;
  if (d === "tablet") return Tablet;
  return Monitor;
}

function rotuloDispositivo(d: Dispositivo): string {
  if (d === "mobile") return "Celular";
  if (d === "tablet") return "Tablet";
  return "Computador";
}

/**
 * Raio do marcador a partir do número de sessões.
 *
 * Escala de ÁREA e ABSOLUTA: `RAIO_MIN * √sessões` faz a área do disco — e não
 * o raio — crescer com o volume, senão um país com 4 sessões pareceria 4× maior
 * que um com 1 (na verdade seria 16× em tinta). Sendo absoluta, o disco do
 * Brasil não muda de tamanho porque Portugal entrou ou saiu da lista: o tamanho
 * codifica o valor, nunca a posição no ranking.
 *
 * `fator` só entra quando o maior país estouraria RAIO_MAX. Aí ele comprime o
 * conjunto INTEIRO de uma vez, preservando as proporções entre os discos, em
 * vez de achatar todos os grandes no teto e perder a diferença entre eles.
 */
function raioPorSessoes(sessoes: number, fator: number): number {
  const bruto = RAIO_MIN * Math.sqrt(Math.max(1, sessoes)) * fator;
  return Math.min(RAIO_MAX, Math.max(RAIO_MIN, bruto));
}

/**
 * Defasagem do anel pulsante, derivada do CÓDIGO do país e não do índice.
 * Com o índice, um país que muda de posição na resposta seguinte reiniciaria a
 * animação do zero a cada 10 segundos — o mapa inteiro "engasgaria" junto.
 */
function atrasoDoPulso(code: string): number {
  let h = 7;
  for (let i = 0; i < code.length; i += 1) {
    h = (h * 31 + code.charCodeAt(i)) % 1009;
  }
  return (h / 1009) * CICLO_PULSO;
}

/**
 * Posição de um marcador em % do viewBox — a mesma conta para o tooltip e para
 * o rótulo direto, para os dois nunca discordarem de onde o ponto está.
 * O container tem `overflow-hidden`, então em latitude alta (Rússia, Canadá) um
 * balão acima do ponto seria cortado: nesses casos ele vira para baixo.
 */
function posicaoNoMapa(x: number, y: number) {
  const topo = (y / ALTURA) * 100;
  return {
    esquerda: Math.min(92, Math.max(8, (x / LARGURA) * 100)),
    topo,
    abaixo: topo < 22,
  };
}

type Registro = Record<string, unknown>;

function comoObjeto(v: unknown): Registro {
  return typeof v === "object" && v !== null ? (v as Registro) : {};
}

function comoLista(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** String não-vazia, ou o fallback. Evita renderizar "" e `undefined`. */
function comoTexto(v: unknown, fallback: string | null = null): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : fallback;
}

/** "desktop" é o balde neutro, igual ao da rota — qualquer outro valor cai nele. */
function comoDispositivo(v: unknown): Dispositivo {
  if (v === "mobile") return "mobile";
  if (v === "tablet") return "tablet";
  return "desktop";
}

/**
 * Normaliza a resposta bruta da API antes de ela encostar no render.
 *
 * A rota é confiável hoje, mas o mapa quebraria feio com um campo faltando
 * (raio NaN vira `<circle r="NaN">` e o ponto some sem erro no console).
 * Toda a defesa fica concentrada aqui: depois deste ponto o componente pode
 * tratar os tipos como garantidos, sem `?.` espalhado pelo JSX.
 */
function normalizar(bruto: unknown): RealtimeData {
  const raiz = comoObjeto(bruto);

  const paises: PaisRealtime[] = comoLista(raiz.paises)
    .map(comoObjeto)
    .map((p) => ({
      code: comoTexto(p.code, "") as string,
      nome: comoTexto(p.nome, "Desconhecido") as string,
      lat: numeroSeguro(p.lat, NaN),
      lng: numeroSeguro(p.lng, NaN),
      sessoes: Math.max(0, numeroSeguro(p.sessoes)),
      sessoesLogadas: Math.max(0, numeroSeguro(p.sessoesLogadas)),
    }))
    // Sem coordenada não há onde desenhar: descarta em vez de plotar em (0,0),
    // que cairia no golfo da Guiné e mentiria para o operador.
    .filter((p) => p.code !== "" && Number.isFinite(p.lat) && Number.isFinite(p.lng));

  const sessoes: SessaoRealtime[] = comoLista(raiz.sessoes)
    .map(comoObjeto)
    .map((s) => ({
      sessionId: comoTexto(s.sessionId, "") as string,
      pais: comoTexto(s.pais),
      paisNome: comoTexto(s.paisNome),
      path: comoTexto(s.path),
      segundosAtras: Math.max(0, numeroSeguro(s.segundosAtras)),
      logado: s.logado === true,
      dispositivo: comoDispositivo(s.dispositivo),
    }));

  return {
    totalOnline: Math.max(0, numeroSeguro(raiz.totalOnline)),
    paises,
    sessoes,
    semCoordenada: Math.max(0, numeroSeguro(raiz.semCoordenada)),
    janelaMin: Math.max(1, numeroSeguro(raiz.janelaMin, 5)),
    geradoEm: comoTexto(raiz.geradoEm),
  };
}

// ─── Peças de apresentação ────────────────────────────────────────────────────

/**
 * Moldura da seção: barra de controles (horário da última resposta + atualizar)
 * e nota de rodapé. Envolve TODOS os estados (carregando, erro, dados) para que
 * os controles e a nota nunca sumam quando o conteúdo troca — é o que impede o
 * painel de "pular" enquanto os dados chegam.
 *
 * Sem título próprio de propósito: quem monta `<WorldMap />` já renderiza o
 * cabeçalho com `Secao` (admin-ui) logo acima. Ter os dois deixava duas
 * barrinhas de acento, dois `<h2>` idênticos e duas descrições dizendo a mesma
 * coisa empilhadas — e dois títulos iguais também para o leitor de tela.
 */
function Moldura({
  hora,
  piscando = false,
  reconectando = false,
  onAtualizar,
  nota,
  children,
}: {
  hora?: string;
  piscando?: boolean;
  reconectando?: boolean;
  onAtualizar: () => void;
  nota?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-3">
        <div className="flex items-center gap-2 shrink-0">
          {/* Aditivo, e não um ternário: durante uma queda de rede o número
              antigo continua na tela (proposital) e o horário é a única coisa
              que diz de quando ele é. Trocar um chip pelo outro escondia
              justamente a informação que fica importante na queda. */}
          {reconectando && (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-400 bg-amber-500/10 ring-1 ring-inset ring-amber-500/25 px-2.5 py-1 rounded-full uppercase tracking-wide">
              <RefreshCw size={10} className="animate-spin motion-reduce:animate-none" />
              Reconectando
            </span>
          )}

          <span
            title="Horário da última resposta recebida da API"
            className="inline-flex items-center gap-2 text-[10px] font-bold text-slate-400 bg-slate-800/70 ring-1 ring-inset ring-slate-700/60 px-2.5 py-1 rounded-full tabular-nums"
          >
            {/* Pisca por ~1,2s a cada resposta nova: é o sinal de que o
                polling está vivo mesmo quando o número não muda. */}
            <span aria-hidden className="relative flex h-1.5 w-1.5">
              {piscando && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping motion-reduce:animate-none" />
              )}
              <span
                className={cn(
                  "relative inline-flex h-1.5 w-1.5 rounded-full",
                  piscando ? "bg-emerald-400" : "bg-slate-600",
                )}
              />
            </span>
            {hora ?? "—"}
          </span>

          <button
            type="button"
            onClick={onAtualizar}
            title="Atualizar agora"
            aria-label="Atualizar agora"
            className="p-2 rounded-xl bg-slate-800/70 ring-1 ring-inset ring-slate-700/60 text-slate-400 hover:text-slate-200 hover:ring-slate-500/50 transition-[color,box-shadow] duration-200"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {children}

      {nota && (
        <p className="flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed">
          <MapPin size={12} className="mt-[2px] shrink-0 text-slate-600" />
          <span>{nota}</span>
        </p>
      )}
    </div>
  );
}

/** Métrica de apoio do cabeçalho: marca (ícone) + número + rótulo em cor de
 *  texto. O valor nunca é colorido — a cor mora na marca ao lado. */
function Metrica({
  icone: Icone,
  valor,
  rotulo,
}: {
  icone: ElementType;
  valor: string;
  rotulo: string;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-7 h-7 rounded-lg bg-slate-800/70 ring-1 ring-inset ring-slate-700/60 flex items-center justify-center shrink-0 text-slate-400">
        <Icone size={13} />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-bold text-slate-200 leading-none tabular-nums truncate">{valor}</p>
        <p className="text-[10px] text-slate-500 leading-none mt-1 truncate">{rotulo}</p>
      </div>
    </div>
  );
}

/** Placeholders com o mesmo esqueleto do conteúdo real, para a tela não pular
 *  quando os dados chegam. `motion-reduce:animate-none` em todos: sem o pulso
 *  eles continuam legíveis como espaços reservados. */
function Esqueleto() {
  return (
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
  );
}

function EstadoErro({ mensagem, onTentar }: { mensagem: string; onTentar: () => void }) {
  return (
    <div className="relative overflow-hidden bg-slate-900/60 ring-1 ring-inset ring-rose-500/20 rounded-2xl px-6 py-14 flex flex-col items-center text-center gap-4">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 h-40 w-40 rounded-full bg-rose-500/10 blur-3xl"
      />
      <div className="relative w-14 h-14 rounded-full bg-rose-500/10 ring-1 ring-inset ring-rose-500/25 flex items-center justify-center text-rose-400">
        <AlertTriangle size={22} />
      </div>
      <div className="relative space-y-1.5">
        <p className="text-base font-black text-slate-200 tracking-tight">
          Não foi possível carregar o tempo real
        </p>
        <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">{mensagem}</p>
      </div>
      <button
        type="button"
        onClick={onTentar}
        className="relative mt-1 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-950/40 transition-colors"
      >
        <RefreshCw size={13} />
        Tentar novamente
      </button>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function WorldMap() {
  // Globo por padrão: com 100% do tráfego num país só, o equiretangular de
  // largura total fica ~95% vazio. A esfera ocupa menos espaço e o mesmo dado
  // preenche o campo de visão. O mapa chapado continua a um clique para quem
  // precisa comparar hemisférios de relance.
  const [visao, setVisao] = useState<"globo" | "mapa">("globo");
  const [dados, setDados] = useState<RealtimeData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [reconectando, setReconectando] = useState(false);
  const [paisAtivo, setPaisAtivo] = useState<string | null>(null);
  const [piscando, setPiscando] = useState(false);

  /**
   * Espelho de `dados` em ref: dentro do `catch` do fetch precisamos saber se
   * JÁ existe dado em tela para decidir entre "estado de erro" e "reconectando",
   * e ler o state ali capturaria o valor do closure de quando `buscar` foi criada.
   */
  const dadosRef = useRef<RealtimeData | null>(null);
  /** Controlador da requisição em voo, para cancelá-la quando outra começa. */
  const abortRef = useRef<AbortController | null>(null);

  const buscar = useCallback(async () => {
    // Cancela a chamada anterior ainda em voo. Com polling de 10s numa rede
    // ruim, duas respostas podem voltar fora de ordem e a mais VELHA sobrescrever
    // a mais nova — o contador andaria para trás. Aqui a última chamada sempre vence.
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      // `no-store`: resposta de polling não pode ser servida do cache do Next
      // nem de proxy no caminho, senão o número congela.
      const res = await fetch("/api/admin/realtime", { cache: "no-store", signal: ctrl.signal });
      if (!res.ok) throw new Error(`A API respondeu ${res.status}.`);
      const normalizado = normalizar(await res.json());
      dadosRef.current = normalizado;
      setDados(normalizado);
      setErro(null);
      setReconectando(false);
    } catch (err) {
      // Abort é desmontagem ou chamada substituída — nunca falha de rede.
      if (ctrl.signal.aborted) return;
      if (dadosRef.current === null) {
        setErro(err instanceof Error ? err.message : "Falha de rede.");
      } else {
        // Já existe dado na tela: mantém o que está e só sinaliza a queda.
        // Piscar para vazio a cada blip de rede é pior que mostrar o número
        // de 10 segundos atrás com um aviso claro de "reconectando".
        setReconectando(true);
      }
    } finally {
      if (!ctrl.signal.aborted) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void buscar();
    const id = setInterval(() => void buscar(), INTERVALO_MS);
    // Sem este cleanup o intervalo continuaria batendo na API depois de sair
    // da página, e o fetch pendente resolveria num componente desmontado.
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [buscar]);

  /**
   * Pisca do indicador de atualização. Observa `dados` em vez de mexer no
   * `buscar`: cada resposta bem-sucedida cria um objeto novo em `normalizar`,
   * então a identidade mudar já É o evento "chegou dado novo" — sem tocar no
   * caminho do fetch e sem um contador de versão só para isso.
   */
  useEffect(() => {
    if (!dados) return;
    setPiscando(true);
    const t = setTimeout(() => setPiscando(false), PISCA_MS);
    return () => clearTimeout(t);
  }, [dados]);

  /** Pontos já projetados, com raio e defasagem do pulso resolvidos. */
  const pontos = useMemo(() => {
    const paises = dados?.paises ?? [];
    const maxSessoes = paises.reduce((m, p) => Math.max(m, p.sessoes), 0) || 1;
    // Só comprime quando o maior disco passaria do teto — ver `raioPorSessoes`.
    const teto = RAIO_MIN * Math.sqrt(maxSessoes);
    const fator = teto > RAIO_MAX ? RAIO_MAX / teto : 1;

    return paises.map((p) => {
      const { x, y } = projetarEquiretangular(p.lat, p.lng, LARGURA, ALTURA);
      return { ...p, x, y, raio: raioPorSessoes(p.sessoes, fator), atraso: atrasoDoPulso(p.code) };
    });
  }, [dados]);

  const pontoDestacado = pontos.find((p) => p.code === paisAtivo) ?? null;

  /** País com mais sessões: é o único que ganha rótulo direto no mapa. Rotular
   *  todo ponto viraria uma sopa de texto sobre a grade. */
  const pontoLider =
    pontos.length > 0 ? pontos.reduce((maior, p) => (p.sessoes > maior.sessoes ? p : maior)) : null;

  const tooltipPos = pontoDestacado ? posicaoNoMapa(pontoDestacado.x, pontoDestacado.y) : null;
  const liderPos = pontoLider ? posicaoNoMapa(pontoLider.x, pontoLider.y) : null;

  const hora = dados ? formatarHora(dados.geradoEm) : undefined;
  const atualizar = () => void buscar();

  if (carregando && !dados) {
    return (
      <Moldura onAtualizar={atualizar}>
        <Esqueleto />
      </Moldura>
    );
  }

  if (erro && !dados) {
    return (
      <Moldura onAtualizar={atualizar}>
        <EstadoErro mensagem={erro} onTentar={atualizar} />
      </Moldura>
    );
  }

  if (!dados) {
    return (
      <Moldura onAtualizar={atualizar}>
        <Esqueleto />
      </Moldura>
    );
  }

  const total = dados.totalOnline;
  const logadosTotal = dados.paises.reduce((s, p) => s + p.sessoesLogadas, 0);

  const nota =
    dados.semCoordenada > 0
      ? `${dados.semCoordenada} ${
          dados.semCoordenada === 1 ? "sessão está" : "sessões estão"
        } sem localização (rede corporativa, VPN ou Tor): ${
          dados.semCoordenada === 1 ? "ela conta" : "elas contam"
        } no total de visitantes, mas não ${
          dados.semCoordenada === 1 ? "aparece" : "aparecem"
        } no mapa.`
      : null;

  return (
    <Moldura
      hora={hora}
      piscando={piscando}
      reconectando={reconectando}
      onAtualizar={atualizar}
      nota={nota}
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* ─── Painel do mapa ───────────────────────────────────────────── */}
        <div className="xl:col-span-2 relative overflow-hidden bg-slate-900/60 ring-1 ring-inset ring-slate-800/60 rounded-2xl p-5">
          {/* Brilho de canto: puro enfeite, fora do fluxo e sem captar clique. */}
          <span
            aria-hidden
            className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl"
          />

          {/* Contador principal + métricas de apoio */}
          <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-4 mb-4">
            <div className="min-w-0">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                Visitantes online agora
              </p>
              <div className="flex items-end gap-3 mt-2">
                <NumberFlow
                  value={total}
                  // tabular-nums: este número é reescrito a cada 10 segundos e
                  // dígitos de largura variável fazem o painel inteiro tremer.
                  className="text-5xl font-black text-slate-100 leading-none tracking-tight tabular-nums"
                />
                <span className="inline-flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <span aria-hidden className="relative flex h-2 w-2">
                    {!reconectando && (
                      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70 animate-ping motion-reduce:animate-none" />
                    )}
                    <span
                      className={cn(
                        "relative inline-flex h-2 w-2 rounded-full",
                        reconectando ? "bg-amber-400" : "bg-emerald-400",
                      )}
                    />
                  </span>
                  ao vivo
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 sm:gap-6 min-w-0">
              <Metrica
                icone={Globe}
                valor={String(dados.paises.length)}
                rotulo={dados.paises.length === 1 ? "país" : "países"}
              />
              <span aria-hidden className="hidden sm:block h-8 w-px bg-slate-800/80" />
              <Metrica
                icone={Users}
                valor={String(logadosTotal)}
                rotulo={logadosTotal === 1 ? "sessão logada" : "sessões logadas"}
              />
              <span aria-hidden className="hidden sm:block h-8 w-px bg-slate-800/80" />
              <Metrica icone={Clock} valor={`${dados.janelaMin} min`} rotulo="janela" />

              {/* Alternador de visão. `aria-pressed` porque a diferença entre
                  ativo e inativo é só cor — sem ele o leitor de tela anuncia
                  dois botões idênticos. */}
              <div
                role="group"
                aria-label="Forma de exibir a presença"
                className="flex items-center gap-1 rounded-xl border border-slate-800/80 bg-slate-950/50 p-1"
              >
                {(["globo", "mapa"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={visao === v}
                    onClick={() => setVisao(v)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors",
                      visao === v
                        ? "bg-blue-500/20 text-blue-300 ring-1 ring-inset ring-blue-500/30"
                        : "text-slate-500 hover:text-slate-300",
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {visao === "globo" ? (
            <div className="relative rounded-2xl overflow-hidden ring-1 ring-inset ring-slate-700/50 bg-[#0F172A] px-4 py-3">
              <Globo paises={dados.paises} cor={COR_PONTO} className="mx-auto max-w-[420px]" />
            </div>
          ) : (
          /* Superfície do mapa. Fundo na COR_SUPERFICIE literal (e não num
              slate translúcido): é o que faz o vão de 2px entre marcadores
              sobrepostos ser um vão de verdade — invisível contra a placa — em
              vez de um anel mais claro desenhado por cima dela. */
          <div className="relative rounded-2xl overflow-hidden ring-1 ring-inset ring-slate-700/50 bg-[#0F172A]">
            <svg
              viewBox={`0 0 ${LARGURA} ${ALTURA}`}
              className="w-full h-auto block"
              role="img"
              aria-label={`Mapa de visitantes online. ${total} ${
                total === 1 ? "sessão" : "sessões"
              } em ${dados.paises.length} ${dados.paises.length === 1 ? "país" : "países"}.`}
            >
              <defs>
                {/*
                  GRADE DE PONTOS — hoje é a textura do OCEANO, sobreposta aos
                  continentes desenhados logo abaixo.
                  O comentário original dizia que ela substituía os contornos
                  "porque não havia GeoJSON aqui dentro". Isso deixou de valer
                  quando `land-outline.ts` foi gerado a partir do Natural Earth
                  110m — a geografia agora é real, e a grade voltou ao papel de
                  textura, que é o que ela sempre fez bem.
                  Feita com <pattern> e não com ~5.000 <circle>, que pesariam no
                  DOM a cada repaint das animações.
                */}
                <pattern
                  id={ID_GRADE}
                  x="0"
                  y="0"
                  width={PASSO_GRADE}
                  height={PASSO_GRADE}
                  patternUnits="userSpaceOnUse"
                >
                  <circle cx={PASSO_GRADE / 2} cy={PASSO_GRADE / 2} r={RAIO_GRADE} fill={COR_GRADE} />
                </pattern>

                {/* Segundo ritmo, 5× mais esparso. */}
                <pattern
                  id={ID_MARCO}
                  x="0"
                  y="0"
                  width={PASSO_MARCO}
                  height={PASSO_MARCO}
                  patternUnits="userSpaceOnUse"
                >
                  <circle cx={PASSO_GRADE / 2} cy={PASSO_GRADE / 2} r={RAIO_MARCO} fill={COR_MARCO} />
                </pattern>

                {/*
                  Profundidade: a grade não tem opacidade uniforme. Uma máscara
                  radial acende os pontos do centro e apaga os das bordas, o que
                  dá volume ao fundo sem precisar variar cor ponto a ponto (o que
                  exigiria abrir mão do <pattern> e voltar aos 5.000 círculos).
                */}
                <radialGradient id={ID_PROFUNDIDADE} cx="50%" cy="50%" r="72%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                  <stop offset="45%" stopColor="#ffffff" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0.22" />
                </radialGradient>

                <mask
                  id={ID_MASCARA}
                  maskUnits="userSpaceOnUse"
                  x="0"
                  y="0"
                  width={LARGURA}
                  height={ALTURA}
                >
                  <rect
                    x="0"
                    y="0"
                    width={LARGURA}
                    height={ALTURA}
                    fill={`url(#${ID_PROFUNDIDADE})`}
                  />
                </mask>

                {/* Clareamento neutro do centro. Slate e não azul de propósito:
                    um véu azul atrás de marcadores azuis comeria o contraste
                    justamente do que importa. */}
                <radialGradient id={ID_BRILHO} cx="50%" cy="45%" r="70%">
                  <stop offset="0%" stopColor="#475569" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#475569" stopOpacity="0" />
                </radialGradient>

                {/* Halo do marcador: gradiente radial em unidades da própria
                    caixa do círculo, então UM def serve para qualquer raio. */}
                <radialGradient id={ID_HALO}>
                  <stop offset="0%" stopColor={COR_PONTO} stopOpacity="0.45" />
                  <stop offset="45%" stopColor={COR_PONTO} stopOpacity="0.2" />
                  <stop offset="100%" stopColor={COR_PONTO} stopOpacity="0" />
                </radialGradient>
              </defs>

              <rect x="0" y="0" width={LARGURA} height={ALTURA} fill={`url(#${ID_BRILHO})`} />

              {/* Continentes — geometria real, a mesma que o globo usa.
                  Ficam FORA do <g mask> logo abaixo de propósito: a máscara
                  esmaece as bordas do retângulo, e passar a terra por ela
                  apagaria justamente Alasca, Escandinávia e Nova Zelândia.
                  A grade entra por cima, como no globo. */}
              {contornoTerra.map((pontosDoAnel, i) => (
                <polygon
                  key={`terra-${i}`}
                  points={pontosDoAnel}
                  fill={COR_TERRA}
                  stroke={COR_TERRA_BORDA}
                  strokeWidth={0.6}
                  strokeLinejoin="round"
                />
              ))}

              <g mask={`url(#${ID_MASCARA})`}>
                <rect x="0" y="0" width={LARGURA} height={ALTURA} fill={`url(#${ID_GRADE})`} />
                <rect x="0" y="0" width={LARGURA} height={ALTURA} fill={`url(#${ID_MARCO})`} />

                {/* Equador e meridiano — as coordenadas saem da projeção, nunca
                    de um número escrito à mão. Tracejado e em cor de grade para
                    ficarem abaixo dos dados na hierarquia visual. */}
                <line
                  x1="0"
                  y1={ORIGEM.y}
                  x2={LARGURA}
                  y2={ORIGEM.y}
                  stroke={COR_MARCO}
                  strokeWidth="1"
                  strokeDasharray="3 7"
                  opacity="0.8"
                />
                <line
                  x1={ORIGEM.x}
                  y1="0"
                  x2={ORIGEM.x}
                  y2={ALTURA}
                  stroke={COR_MARCO}
                  strokeWidth="1"
                  strokeDasharray="3 7"
                  opacity="0.8"
                />
              </g>

              {pontos.map((p) => {
                const ativo = paisAtivo === p.code;
                return (
                  <g
                    key={p.code}
                    className="cursor-pointer"
                    onMouseEnter={() => setPaisAtivo(p.code)}
                    onMouseLeave={() => setPaisAtivo(null)}
                    // Toque: no mobile não existe hover, então o toque alterna.
                    onClick={() => setPaisAtivo((atual) => (atual === p.code ? null : p.code))}
                  >
                    {/* Dois anéis defasados meio ciclo dão pulso CONTÍNUO em vez
                        de um "bip" com pausa. SMIL puro: zero JS por frame.
                        opacity base 0 para o anel ficar invisível antes do
                        `begin`, e a expansão usa easing de saída (rápido no
                        início, desacelerando) — o crescimento linear parecia
                        mecânico. */}
                    {[0, CICLO_PULSO / 2].map((offset) => {
                      const inicio = (p.atraso + offset).toFixed(2);
                      return (
                        <circle
                          key={offset}
                          cx={p.x}
                          cy={p.y}
                          r={p.raio}
                          fill="none"
                          stroke={COR_PONTO}
                          strokeWidth="1.5"
                          opacity="0"
                        >
                          <animate
                            attributeName="r"
                            values={`${p.raio};${(p.raio * 3.1).toFixed(2)}`}
                            keyTimes="0;1"
                            calcMode="spline"
                            keySplines="0.16 0.8 0.3 1"
                            dur={`${CICLO_PULSO}s`}
                            begin={`${inicio}s`}
                            repeatCount="indefinite"
                          />
                          <animate
                            attributeName="opacity"
                            values="0.6;0.42;0"
                            keyTimes="0;0.35;1"
                            calcMode="spline"
                            keySplines="0.4 0 0.6 1;0.33 0 0.67 1"
                            dur={`${CICLO_PULSO}s`}
                            begin={`${inicio}s`}
                            repeatCount="indefinite"
                          />
                        </circle>
                      );
                    })}

                    {/* Halo com gradiente radial — dá peso ao ponto sem depender
                        da animação (e sobrevive a `prefers-reduced-motion`). */}
                    <circle cx={p.x} cy={p.y} r={p.raio * 2.6} fill={`url(#${ID_HALO})`} />

                    {/* Vão de 2px na cor da superfície: é o que separa dois
                        marcadores que se sobrepõem (Bélgica × Países Baixos) e
                        o que descola o disco do próprio halo. OPACO de
                        propósito — translúcido ele misturaria com o disco de
                        trás e o "vão" viraria um anel azulado. */}
                    <circle cx={p.x} cy={p.y} r={p.raio + 2} fill={COR_SUPERFICIE} />

                    {/* Disco sólido */}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={p.raio}
                      fill={COR_PONTO}
                      stroke={COR_PONTO_BORDA}
                      strokeWidth={ativo ? 2 : 1}
                      opacity={ativo ? 1 : 0.95}
                    />

                    {/* Núcleo claro: o brilho que faz o marcador parecer uma
                        fonte de luz em vez de um adesivo. */}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={Math.max(1.2, p.raio * 0.32)}
                      fill={COR_NUCLEO}
                      opacity="0.9"
                    />

                    {/* Anel de seleção, sem animação: estado precisa ser estável
                        para o olho confirmar o que está sob o cursor. */}
                    {ativo && (
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={p.raio + 7}
                        fill="none"
                        stroke={COR_PONTO_BORDA}
                        strokeWidth="1.5"
                        opacity="0.65"
                      />
                    )}

                    {/* Área de toque generosa: o disco pode ter só 4px de raio
                        no viewBox, o que é quase impossível de acertar. */}
                    <circle cx={p.x} cy={p.y} r={Math.max(p.raio + 10, 16)} fill="transparent" />
                  </g>
                );
              })}
            </svg>

            {/* Rótulo direto do país líder, em HTML e não em <text>: texto SVG
                escala junto com o viewBox e mudaria de corpo conforme a largura
                da tela. Some enquanto há tooltip aberto para os dois nunca se
                sobreporem. */}
            {pontoLider && liderPos && !pontoDestacado && total > 0 && (
              <div
                aria-hidden
                className={cn(
                  "absolute z-[5] pointer-events-none -translate-x-1/2",
                  !liderPos.abaixo && "-translate-y-full",
                )}
                style={{
                  left: `${liderPos.esquerda}%`,
                  top: `${
                    liderPos.abaixo ? liderPos.topo + 4 : Math.max(0, liderPos.topo - 4)
                  }%`,
                }}
              >
                <div className="flex items-center gap-1.5 rounded-full bg-slate-950/70 px-2.5 py-1 ring-1 ring-inset ring-slate-700/50 whitespace-nowrap">
                  {/* A cor mora na marca; o texto fica em cor de texto. */}
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
                  <span className="text-[10px] font-bold text-slate-300">{pontoLider.nome}</span>
                  <span className="text-[10px] text-slate-500 tabular-nums">
                    {pontoLider.sessoes} {pontoLider.sessoes === 1 ? "sessão" : "sessões"}
                  </span>
                </div>
              </div>
            )}

            {/* Tooltip em HTML sobreposto ao SVG: mais legível e estilizável que
                <title>, e não depende do delay do tooltip nativo do browser. */}
            {pontoDestacado && tooltipPos && (
              <div
                className={cn(
                  "absolute z-10 pointer-events-none -translate-x-1/2",
                  !tooltipPos.abaixo && "-translate-y-full",
                )}
                style={{
                  left: `${tooltipPos.esquerda}%`,
                  top: `${
                    tooltipPos.abaixo ? tooltipPos.topo + 3 : Math.max(0, tooltipPos.topo - 3)
                  }%`,
                }}
              >
                <div className="bg-slate-900/95 backdrop-blur-sm ring-1 ring-inset ring-slate-700/60 rounded-xl px-3 py-2 shadow-2xl shadow-slate-950/60 whitespace-nowrap">
                  <p className="text-[11px] font-bold text-slate-100 flex items-center gap-1.5">
                    <span aria-hidden>{bandeiraDoPais(pontoDestacado.code)}</span>
                    {pontoDestacado.nome}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1.5 tabular-nums">
                    {/* A marca colorida fica ao lado do rótulo; o texto continua
                        em cor de texto. Colorir a palavra derruba o contraste. */}
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
                    {pontoDestacado.sessoes === 1
                      ? "1 sessão"
                      : `${pontoDestacado.sessoes} sessões`}
                    <span className="text-slate-600">·</span>
                    {pontoDestacado.sessoesLogadas}{" "}
                    {pontoDestacado.sessoesLogadas === 1 ? "logada" : "logadas"}
                  </p>
                </div>
              </div>
            )}

            {/* Zero é o caso NORMAL deste sistema: mensagem neutra sobre o mapa
                que continua desenhado, nunca um estado de erro. */}
            {total === 0 && (
              <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
                <div className="flex flex-col items-center text-center gap-3 rounded-2xl bg-slate-950/55 backdrop-blur-[2px] px-6 py-5 ring-1 ring-inset ring-slate-800/70">
                  <span className="relative flex items-center justify-center">
                    <span
                      aria-hidden
                      className="pointer-events-none absolute h-14 w-14 rounded-full bg-blue-500/10 blur-xl"
                    />
                    <span className="relative w-10 h-10 rounded-full bg-slate-900/80 ring-1 ring-inset ring-slate-700/60 flex items-center justify-center text-slate-500">
                      <Globe size={18} />
                    </span>
                  </span>
                  <div>
                    <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest">
                      Ninguém online agora
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1.5">
                      O mapa acende sozinho assim que alguém abrir o site.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}

          {/* Legenda do tamanho: com uma medida codificada por área, a chave é
              obrigatória — sem ela o disco grande é só "um disco grande". */}
          <div className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mt-3">
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <span aria-hidden className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500/70" />
                <span className="h-3 w-3 rounded-full bg-blue-500/70" />
              </span>
              Área do ponto = sessões ativas no país
            </div>
            {/* slate-500 é o piso para texto que ainda precisa ser lido; o
                slate-600 fica reservado para separadores e marcas. */}
            <p className="text-[10px] text-slate-500">
              Passe o mouse — ou toque — num ponto para ver o país
            </p>
          </div>
        </div>

        {/* ─── Lista das últimas sessões ────────────────────────────────── */}
        <div className="bg-slate-900/60 ring-1 ring-inset ring-slate-800/60 rounded-2xl overflow-hidden flex flex-col">
          {/* px-5 igual ao card do mapa (p-5): lado a lado no grid, gutters
              diferentes deixam as duas colunas desalinhadas na borda interna.
              Sem ponto pulsante nem "ao vivo" aqui: o cabeçalho da seção e o
              rótulo ao lado do contador já dizem isso duas vezes — este título
              rende mais explicando O QUE a lista é. */}
          <div className="px-5 py-3.5 border-b border-slate-800/60 flex items-center gap-2">
            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
              Últimas sessões
            </h3>
            <span className="ml-auto text-[10px] font-bold text-slate-300 bg-slate-800/70 ring-1 ring-inset ring-slate-700/60 px-2 py-0.5 rounded-full tabular-nums">
              {dados.sessoes.length}
            </span>
          </div>

          {dados.sessoes.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-xs font-bold text-slate-300">Nenhuma sessão ativa</p>
              <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                Aparece aqui quem estiver navegando nos últimos {dados.janelaMin} minutos.
              </p>
            </div>
          ) : (
            <div className="relative">
              <div className="max-h-[520px] overflow-y-auto divide-y divide-slate-800/50">
                {dados.sessoes.map((s, i) => {
                  const Icone = iconeDispositivo(s.dispositivo);
                  return (
                    <div
                      // sessionId vem mascarado em 6 chars pela API e pode colidir:
                      // o índice entra na chave para garantir unicidade.
                      key={`${s.sessionId}-${i}`}
                      className="flex items-center gap-3 px-5 py-2.5 transition-colors duration-150 hover:bg-slate-800/40"
                    >
                      <span className="w-8 h-8 rounded-lg bg-slate-800/70 ring-1 ring-inset ring-slate-700/60 flex items-center justify-center shrink-0 text-slate-400">
                        <Icone size={14} />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span aria-hidden className="text-xs leading-none shrink-0">
                            {bandeiraDoPais(s.pais)}
                          </span>
                          <span className="text-[11px] font-bold text-slate-200 truncate">
                            {s.paisNome ?? "Local desconhecido"}
                          </span>
                          {s.logado && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-[2px] rounded-full uppercase tracking-wide text-slate-300 bg-blue-500/10 ring-1 ring-inset ring-blue-500/25 shrink-0">
                              <span aria-hidden className="h-1 w-1 rounded-full bg-blue-400" />
                              Logado
                            </span>
                          )}
                        </div>
                        {/* `title` porque o path é o dado mais truncado da lista
                            e o caminho completo costuma ser o que interessa. */}
                        <p
                          className="text-[10px] text-slate-500 font-mono truncate mt-1"
                          title={s.path ?? undefined}
                        >
                          {s.path ?? "—"}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-bold text-slate-400 tabular-nums whitespace-nowrap">
                          {tempoRelativo(s.segundosAtras)}
                        </p>
                        <p className="text-[9px] text-slate-400 mt-0.5">
                          {rotuloDispositivo(s.dispositivo)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Esmaecido no pé da rolagem: sinaliza "tem mais abaixo" sem
                  ocupar linha. Só quando a lista de fato transborda — num
                  punhado de linhas viraria uma mancha escura sem motivo.
                  O corte é 10 porque cada linha mede ~53px e o contêiner tem
                  520px: com 10 ou menos não há rolagem nenhuma, e o esmaecido
                  estaria apagando a última linha à toa. */}
              {dados.sessoes.length > 10 && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-slate-950/80 via-slate-950/35 to-transparent"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </Moldura>
  );
}

export default WorldMap;
