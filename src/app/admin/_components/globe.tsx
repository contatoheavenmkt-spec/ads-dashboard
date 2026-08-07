"use client";

/**
 * Globo de presença — projeção ortográfica em SVG puro, sem dependência.
 *
 * Por que globo e não o mapa chapado: o Dashfy tem 100% do tráfego num país só.
 * Num equiretangular de largura total isso vira ~95% de retângulo vazio com um
 * pontinho no canto — muito espaço gasto para pouca informação. A esfera ocupa
 * uma área quadrada compacta, e o fato de o Brasil preencher o campo de visão
 * é a leitura correta em vez de um vazio constrangedor.
 *
 * Três decisões que valem para o arquivo inteiro:
 *
 * 1. CONTINENTES COM GEOMETRIA REAL. O contorno vem de `land-outline.ts`,
 *    gerado por script a partir do Natural Earth 110m (domínio público) —
 *    baixado, simplificado com Douglas-Peucker e conferido por teste de
 *    ponto-em-polígono. Nada foi desenhado "de cabeça": um litoral inventado
 *    fica plausível de longe e errado de perto. A malha de pontos e a
 *    gratícula continuam, agora como textura do oceano.
 *
 * 2. NÃO GIRA SOZINHO. Auto-rotação exigiria re-render de ~600 círculos a
 *    60fps; com o painel aberto o dia todo isso é CPU queimada à toa. O globo
 *    fica parado até alguém arrastar — mesmo padrão do painel de referência.
 *
 * 3. A PROJEÇÃO É A FONTE DA VERDADE. Ortográfica pura, com teste de
 *    visibilidade por produto escalar: ponto no hemisfério oposto não é
 *    desenhado. Sem isso os marcadores do "outro lado" apareceriam espelhados
 *    sobre a face visível, que é o erro clássico deste tipo de globo.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONTORNO_TERRA } from "./land-outline";

// ─── Geometria ────────────────────────────────────────────────────────────────

const TAMANHO = 460; // viewBox quadrado
const CENTRO = TAMANHO / 2;
const RAIO_BASE = 190;

const ZOOM_MIN = 0.85;
const ZOOM_MAX = 3;
const ZOOM_PASSO = 0.35;

const GRAUS = Math.PI / 180;

export interface PaisGlobo {
  code: string;
  nome: string;
  lat: number;
  lng: number;
  sessoes: number;
  sessoesLogadas: number;
}

interface Rotacao {
  /** longitude do centro da face visível */
  lambda: number;
  /** latitude do centro da face visível */
  phi: number;
}

interface Projetado {
  x: number;
  y: number;
  /** cosseno da distância angular ao centro: > 0 = hemisfério visível */
  visivel: boolean;
  /** 0 na borda, 1 no centro — usado para esmaecer o que está de perfil */
  profundidade: number;
}

/**
 * Projeção ortográfica. Devolve a posição na tela e a visibilidade.
 *
 * cos(c) = sin(φ0)·sin(φ) + cos(φ0)·cos(φ)·cos(λ−λ0)
 * x = R·cos(φ)·sin(λ−λ0)
 * y = R·[cos(φ0)·sin(φ) − sin(φ0)·cos(φ)·cos(λ−λ0)]   (invertido: SVG cresce p/ baixo)
 */
function projetar(lat: number, lng: number, rot: Rotacao, raio: number): Projetado {
  const phi = lat * GRAUS;
  const lambda = lng * GRAUS;
  const phi0 = rot.phi * GRAUS;
  const lambda0 = rot.lambda * GRAUS;

  const dLambda = lambda - lambda0;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const cosPhi0 = Math.cos(phi0);
  const sinPhi0 = Math.sin(phi0);
  const cosD = Math.cos(dLambda);

  const cosC = sinPhi0 * sinPhi + cosPhi0 * cosPhi * cosD;

  return {
    x: CENTRO + raio * cosPhi * Math.sin(dLambda),
    y: CENTRO - raio * (cosPhi0 * sinPhi - sinPhi0 * cosPhi * cosD),
    visivel: cosC > 0,
    profundidade: Math.max(0, cosC),
  };
}

/**
 * Malha de pontos distribuída por anéis de latitude, com o número de pontos de
 * cada anel proporcional a cos(lat).
 *
 * Um grid ingênuo (mesma quantidade de longitudes em toda latitude) amontoa
 * pontos nos polos e rareia no equador — a esfera fica com "tampas" densas e
 * cintura vazia. Escalar por cos(lat) mantém a densidade visual uniforme.
 */
function malhaDaEsfera(passoLat: number): Array<{ lat: number; lng: number }> {
  const pontos: Array<{ lat: number; lng: number }> = [];
  for (let lat = -80; lat <= 80; lat += passoLat) {
    const circunferencia = Math.cos(lat * GRAUS);
    const quantos = Math.max(6, Math.round((360 / passoLat) * circunferencia));
    const passoLng = 360 / quantos;
    for (let i = 0; i < quantos; i++) {
      pontos.push({ lat, lng: -180 + i * passoLng });
    }
  }
  return pontos;
}

/** Meridianos e paralelos, como listas de coordenadas a projetar. */
function graticula(): Array<Array<{ lat: number; lng: number }>> {
  const linhas: Array<Array<{ lat: number; lng: number }>> = [];
  for (let lng = -180; lng < 180; lng += 30) {
    const meridiano = [];
    for (let lat = -90; lat <= 90; lat += 4) meridiano.push({ lat, lng });
    linhas.push(meridiano);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const paralelo = [];
    for (let lng = -180; lng <= 180; lng += 4) paralelo.push({ lat, lng });
    linhas.push(paralelo);
  }
  return linhas;
}

/**
 * Raio do marcador por ÁREA, não por diâmetro: dobrar as sessões deve dobrar a
 * área do disco, senão o olho superestima os grandes. Escala absoluta (não
 * relativa ao maior) para o disco de um país não mudar de tamanho quando outro
 * entra ou sai da lista — tamanho tem que codificar valor, nunca ranking.
 */
function raioMarcador(sessoes: number): number {
  return Math.min(15, Math.max(4.5, 4.5 * Math.sqrt(Math.max(1, sessoes))));
}

// ─── Componente ───────────────────────────────────────────────────────────────

export interface GloboProps {
  paises: PaisGlobo[];
  /** Cor da série. Uma medida só = uma cor. */
  cor?: string;
  className?: string;
}

export function Globo({ paises, cor = "#3b82f6", className }: GloboProps) {
  // Começa centrado na América do Sul: é onde está 100% do tráfego hoje, e
  // abrir o painel mostrando o Pacífico vazio seria uma boa-vinda ruim.
  const [rot, setRot] = useState<Rotacao>({ lambda: -55, phi: -10 });
  const [zoom, setZoom] = useState(1);
  const [ativo, setAtivo] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);

  const arrasteRef = useRef<{ x: number; y: number; lambda: number; phi: number } | null>(null);

  const raio = RAIO_BASE * zoom;

  // Passo maior no zoom baixo: manter 3° com o globo pequeno gastaria milhares
  // de círculos que nem seriam distinguíveis.
  const pontos = useMemo(() => malhaDaEsfera(zoom > 1.6 ? 4 : 6), [zoom]);
  const linhas = useMemo(() => graticula(), []);

  /**
   * Continentes projetados.
   *
   * Cada anel vira um ou mais caminhos: os pontos do hemisfério oculto são
   * descartados e a sequência é quebrada ali, senão o traço saltaria de um lado
   * a outro do disco cruzando a esfera. Um continente parcialmente do outro
   * lado fecha o preenchimento por uma corda reta no limbo — imperceptível na
   * escala em que é desenhado, e o alternativo (recorte esférico de verdade)
   * não se paga aqui.
   */
  const terra = useMemo(() => {
    const caminhos: string[] = [];
    for (const anel of CONTORNO_TERRA) {
      let atual: string[] = [];
      for (const [lng, lat] of anel) {
        const pos = projetar(lat, lng, rot, raio);
        if (pos.visivel) {
          atual.push(`${pos.x.toFixed(1)},${pos.y.toFixed(1)}`);
        } else {
          if (atual.length > 2) caminhos.push(atual.join(" "));
          atual = [];
        }
      }
      if (atual.length > 2) caminhos.push(atual.join(" "));
    }
    return caminhos;
  }, [rot, raio]);

  const aoPressionar = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
      arrasteRef.current = { x: e.clientX, y: e.clientY, lambda: rot.lambda, phi: rot.phi };
      setArrastando(true);
    },
    [rot],
  );

  const aoMover = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const ini = arrasteRef.current;
    if (!ini) return;
    // 0.35°/px dá uma volta completa em ~1000px de arrasto — rápido o bastante
    // para explorar, lento o bastante para posicionar um país sob o cursor.
    const dx = (e.clientX - ini.x) * 0.35;
    const dy = (e.clientY - ini.y) * 0.35;
    setRot({
      lambda: ini.lambda - dx,
      // Trava em ±85: passar do polo inverte a orientação e o usuário se perde.
      phi: Math.max(-85, Math.min(85, ini.phi + dy)),
    });
  }, []);

  const aoSoltar = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    arrasteRef.current = null;
    setArrastando(false);
    try {
      (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
    } catch {
      // O ponteiro pode já ter sido liberado (ex.: saiu da janela). Sem efeito.
    }
  }, []);

  const marcadores = paises
    .map((p) => ({ pais: p, pos: projetar(p.lat, p.lng, rot, raio) }))
    .filter((m) => m.pos.visivel)
    // Desenha os do fundo primeiro: quem está mais ao centro fica por cima.
    .sort((a, b) => a.pos.profundidade - b.pos.profundidade);

  const destacado = marcadores.find((m) => m.pais.code === ativo);

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${TAMANHO} ${TAMANHO}`}
        className={cn(
          "w-full h-auto touch-none select-none",
          arrastando ? "cursor-grabbing" : "cursor-grab",
        )}
        onPointerDown={aoPressionar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        role="img"
        aria-label={`Globo de presença. ${paises.length} país(es) com sessões ativas.`}
      >
        <defs>
          {/* Iluminação: claro em cima à esquerda, escuro na borda oposta —
              é o que dá volume e impede que a esfera leia como disco chapado. */}
          <radialGradient id="globo-superficie" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="55%" stopColor="#131c2f" />
            <stop offset="100%" stopColor="#0a1020" />
          </radialGradient>
          {/* Halo externo: separa a esfera do fundo do card sem precisar de borda. */}
          <radialGradient id="globo-halo" cx="50%" cy="50%" r="50%">
            <stop offset="82%" stopColor={cor} stopOpacity="0" />
            <stop offset="94%" stopColor={cor} stopOpacity="0.16" />
            <stop offset="100%" stopColor={cor} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="globo-marcador" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={cor} stopOpacity="0.55" />
            <stop offset="100%" stopColor={cor} stopOpacity="0" />
          </radialGradient>
          {/* Recorta tudo à esfera: sem isso a gratícula vaza para fora do disco
              nos zooms altos. */}
          <clipPath id="globo-recorte">
            <circle cx={CENTRO} cy={CENTRO} r={raio} />
          </clipPath>
        </defs>

        <circle cx={CENTRO} cy={CENTRO} r={raio * 1.14} fill="url(#globo-halo)" />
        <circle cx={CENTRO} cy={CENTRO} r={raio} fill="url(#globo-superficie)" />

        <g clipPath="url(#globo-recorte)">
          {/* Continentes primeiro: a malha de pontos e a gratícula por cima
              dão a leitura de esfera sobre a massa de terra. */}
          {terra.map((d, i) => (
            <polygon
              key={`t${i}`}
              points={d}
              fill="#243040"
              stroke="#33445c"
              strokeWidth={0.6}
              strokeLinejoin="round"
            />
          ))}

          {/* Malha de pontos — a textura que faz ler como globo */}
          {pontos.map((p, i) => {
            const pos = projetar(p.lat, p.lng, rot, raio);
            if (!pos.visivel) return null;
            return (
              <circle
                key={i}
                cx={pos.x}
                cy={pos.y}
                r={0.75}
                fill="#334155"
                // Bem mais discreta desde que os continentes entraram: a malha
                // virou textura de oceano, e no peso anterior (até 0,73) ela
                // salpicava por cima da terra e competia com o contorno.
                // Some progressivamente na borda — sem isso o limbo vira um
                // anel denso de pontos comprimidos e a esfera parece ter casca.
                opacity={0.08 + pos.profundidade * 0.2}
              />
            );
          })}

          {/* Gratícula */}
          {linhas.map((linha, i) => {
            const segmentos: string[] = [];
            let atual: string[] = [];
            for (const p of linha) {
              const pos = projetar(p.lat, p.lng, rot, raio);
              if (pos.visivel) {
                atual.push(`${pos.x.toFixed(1)},${pos.y.toFixed(1)}`);
              } else if (atual.length > 1) {
                segmentos.push(atual.join(" "));
                atual = [];
              } else {
                atual = [];
              }
            }
            if (atual.length > 1) segmentos.push(atual.join(" "));
            return segmentos.map((s, j) => (
              <polyline
                key={`${i}-${j}`}
                points={s}
                fill="none"
                stroke="#1e293b"
                strokeWidth={0.7}
                opacity={0.75}
              />
            ));
          })}

          {/* Marcadores */}
          {marcadores.map(({ pais, pos }) => {
            const r = raioMarcador(pais.sessoes);
            const foco = pais.code === ativo;
            return (
              <g
                key={pais.code}
                onPointerEnter={() => setAtivo(pais.code)}
                onPointerLeave={() => setAtivo((a) => (a === pais.code ? null : a))}
                style={{ cursor: "pointer" }}
                opacity={0.45 + pos.profundidade * 0.55}
              >
                <circle cx={pos.x} cy={pos.y} r={r * 3.4} fill="url(#globo-marcador)" />
                {/* Anel pulsante em SMIL: animação declarativa, sem JS por frame. */}
                <circle cx={pos.x} cy={pos.y} r={r} fill="none" stroke={cor} strokeWidth={1.5}>
                  <animate
                    attributeName="r"
                    values={`${r};${r * 2.9}`}
                    dur="2.6s"
                    repeatCount="indefinite"
                    calcMode="spline"
                    keyTimes="0;1"
                    keySplines="0.2 0.6 0.4 1"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.65;0"
                    dur="2.6s"
                    repeatCount="indefinite"
                  />
                </circle>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={r}
                  fill={cor}
                  stroke="#0F172A"
                  strokeWidth={foco ? 2.5 : 1.5}
                />
                {/* Alvo de toque generoso: o disco de 4.5px é pequeno demais
                    para o dedo, e o hover precisa pegar antes do pixel exato. */}
                <circle cx={pos.x} cy={pos.y} r={Math.max(18, r * 2)} fill="transparent" />
              </g>
            );
          })}
        </g>

        {/* Aro sutil por cima de tudo, fechando a silhueta */}
        <circle
          cx={CENTRO}
          cy={CENTRO}
          r={raio}
          fill="none"
          stroke={cor}
          strokeOpacity={0.22}
          strokeWidth={1}
        />
      </svg>

      {/* Zoom */}
      <div className="absolute top-3 left-3 flex flex-col gap-1.5">
        <BotaoGlobo
          rotulo="Aproximar"
          onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_PASSO))}
          desabilitado={zoom >= ZOOM_MAX}
        >
          <Plus size={13} />
        </BotaoGlobo>
        <BotaoGlobo
          rotulo="Afastar"
          onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_PASSO))}
          desabilitado={zoom <= ZOOM_MIN}
        >
          <Minus size={13} />
        </BotaoGlobo>
        <BotaoGlobo
          rotulo="Recentralizar"
          onClick={() => {
            setRot({ lambda: -55, phi: -10 });
            setZoom(1);
          }}
        >
          <RotateCcw size={12} />
        </BotaoGlobo>
      </div>

      {/* Tooltip do país em foco */}
      {destacado && (
        <div
          className="pointer-events-none absolute z-10 rounded-xl border border-slate-700/70 bg-slate-950/95 px-3 py-2 shadow-xl"
          style={{
            // Percentual porque o SVG escala com o contêiner; posição em px do
            // viewBox não corresponderia à posição na tela.
            left: `${(destacado.pos.x / TAMANHO) * 100}%`,
            top: `${(destacado.pos.y / TAMANHO) * 100}%`,
            transform: "translate(-50%, -140%)",
          }}
        >
          <p className="text-[11px] font-black text-slate-100 whitespace-nowrap">
            {destacado.pais.nome}
          </p>
          <p className="text-[10px] text-slate-400 whitespace-nowrap tabular-nums">
            {destacado.pais.sessoes} {destacado.pais.sessoes === 1 ? "sessão" : "sessões"}
            {destacado.pais.sessoesLogadas > 0 && ` · ${destacado.pais.sessoesLogadas} logada(s)`}
          </p>
        </div>
      )}

      <p className="mt-2 text-center text-[10px] text-slate-500">
        Arraste para girar · use + / − para aproximar
      </p>
    </div>
  );
}

function BotaoGlobo({
  children,
  rotulo,
  onClick,
  desabilitado,
}: {
  children: React.ReactNode;
  rotulo: string;
  onClick: () => void;
  desabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      aria-label={rotulo}
      title={rotulo}
      className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700/60 bg-slate-900/80 text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
