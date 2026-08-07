import { NextRequest, NextResponse } from "next/server";
import { validateAdminRequest } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { coordDoPais } from "@/lib/country-coords";

/**
 * GET /api/admin/realtime — alimenta o mapa-múndi "quem está online agora".
 *
 * Contrato de custo: o painel chama esta rota a cada 10s. Cada ida ao Supabase
 * custa ~190ms, então a rota é limitada a DUAS consultas disparadas em paralelo
 * (uma agregação por país + a lista das últimas sessões). Nada de N+1 para
 * resolver usuário, nada de carregar a tabela inteira para contar em JS.
 *
 * Privacidade: `ip` nunca é lido do banco e o `userAgent` só existe dentro do
 * handler para derivar o tipo de dispositivo — nenhum dos dois sai na resposta.
 * O `sessionId` sai mascarado (6 primeiros chars), o suficiente para o operador
 * diferenciar duas linhas na tela sem virar identificador reutilizável.
 */

// Polling não pode pegar resposta cacheada pelo Next nem por proxy no caminho.
export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store" };

const JANELA_PADRAO_MIN = 5; // "online" = visto nos últimos 5 minutos
const JANELA_MIN = 1;
// Teto de 15 e não 60: /api/track/heartbeat apaga toda ActiveSession com
// lastSeen anterior a 5 minutos. Pedir uma janela maior que isso devolveria
// vazio e faria o operador achar que não há ninguém online, quando na verdade
// a linha já foi varrida. Os 15 são folga caso a varredura mude de intervalo.
const JANELA_MAX = 15;
const MAX_SESSOES = 50;
const TAMANHO_MASCARA = 6;

/**
 * Único parâmetro numérico da rota. `parseInt` cru devolve NaN para lixo
 * ("?janelaMin=abc") e NaN propagado até o `new Date(...)` gera Invalid Date,
 * o que derruba a query com 500 — bug que já existe em outras rotas do projeto.
 * Aqui qualquer entrada inválida cai no padrão e o valor é sempre clampado.
 */
function janelaEmMinutos(bruto: string | null): number {
  if (bruto === null || bruto.trim() === "") return JANELA_PADRAO_MIN;
  const n = Number.parseInt(bruto, 10);
  if (!Number.isFinite(n)) return JANELA_PADRAO_MIN;
  return Math.min(JANELA_MAX, Math.max(JANELA_MIN, n));
}

const RE_TABLET = /ipad|tablet|kindle|playbook|silk/;
const RE_MOBILE = /mobi|iphone|ipod|blackberry|opera mini|iemobile|windows phone/;

/**
 * Classificação grosseira e barata do dispositivo — o painel só precisa de um
 * ícone. Sessão sem userAgent (bot, curl, header removido) cai em "desktop"
 * porque é o balde neutro, não porque foi detectado como tal.
 */
function detectarDispositivo(userAgent: string | null): "mobile" | "desktop" | "tablet" {
  if (!userAgent) return "desktop";
  const ua = userAgent.toLowerCase();
  if (RE_TABLET.test(ua)) return "tablet";
  // Convenção do Chrome: Android COM "mobile" é celular, Android SEM "mobile" é tablet.
  if (ua.includes("android")) return ua.includes("mobile") ? "mobile" : "tablet";
  if (RE_MOBILE.test(ua)) return "mobile";
  return "desktop";
}

interface PaisRealtime {
  code: string;
  nome: string;
  lat: number;
  lng: number;
  sessoes: number;
  // Deliberadamente "sessõesLogadas" e não "usuáriosLogados": COUNT("userId")
  // conta LINHAS com userId não-nulo. Uma pessoa com duas abas abertas gera
  // duas ActiveSession e apareceria como dois usuários. Contar usuários
  // distintos por país exigiria groupBy([country, userId]) — custo que não se
  // justifica numa rota chamada a cada 10s só para um número de tooltip.
  sessoesLogadas: number;
}

interface SessaoRealtime {
  sessionId: string;
  pais: string | null;
  paisNome: string | null;
  path: string | null;
  segundosAtras: number;
  logado: boolean;
  dispositivo: "mobile" | "desktop" | "tablet";
}

export async function GET(req: NextRequest) {
  if (!validateAdminRequest(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const janelaMin = janelaEmMinutos(searchParams.get("janelaMin"));

  // `agora` é fixado uma vez: os "segundosAtras" de todas as sessões precisam
  // ser medidos contra o mesmo instante, senão o topo e o fim da lista ficam
  // com bases de tempo diferentes.
  const agora = new Date();
  const desde = new Date(agora.getTime() - janelaMin * 60 * 1000);

  try {
    const [porPais, sessoesRecentes] = await Promise.all([
      db.activeSession.groupBy({
        by: ["country"],
        where: { lastSeen: { gte: desde } },
        // `_all` conta todas as linhas do país; `userId` usa a semântica de
        // COUNT(coluna) do SQL (ignora NULL), então dá os usuários logados de
        // graça na mesma ida ao banco — sem segunda query nem filtro em JS.
        _count: { _all: true, userId: true },
      }),
      db.activeSession.findMany({
        where: { lastSeen: { gte: desde } },
        orderBy: { lastSeen: "desc" },
        take: MAX_SESSOES,
        // select explícito: `ip` fica de fora do resultado por completo e o
        // `userAgent` é consumido e descartado ainda dentro deste handler.
        select: {
          sessionId: true,
          country: true,
          path: true,
          userId: true,
          userAgent: true,
          lastSeen: true,
        },
      }),
    ]);

    let totalOnline = 0;
    let semCoordenada = 0;
    const mapaPaises = new Map<string, PaisRealtime>();

    for (const grupo of porPais) {
      const sessoes = grupo._count._all;
      // Total conta TUDO que está na janela, inclusive país desconhecido —
      // o número do topo do painel não pode encolher por falta de coordenada.
      totalOnline += sessoes;

      const coord = coordDoPais(grupo.country);
      if (!coord) {
        semCoordenada += sessoes;
        continue;
      }

      const existente = mapaPaises.get(coord.code);
      if (existente) {
        // O banco trata "BR", "br" e " BR " como grupos distintos (o valor vem
        // de header de CDN, sem normalização na escrita); o mapa tem um ponto só.
        existente.sessoes += sessoes;
        existente.sessoesLogadas += grupo._count.userId;
      } else {
        mapaPaises.set(coord.code, {
          code: coord.code,
          nome: coord.nome,
          lat: coord.lat,
          lng: coord.lng,
          sessoes,
          sessoesLogadas: grupo._count.userId,
        });
      }
    }

    const paises = Array.from(mapaPaises.values()).sort(
      (a, b) => b.sessoes - a.sessoes || a.nome.localeCompare(b.nome, "pt-BR"),
    );

    const sessoes: SessaoRealtime[] = sessoesRecentes.map((s) => {
      const coord = coordDoPais(s.country);
      return {
        sessionId: s.sessionId.slice(0, TAMANHO_MASCARA),
        pais: coord ? coord.code : null,
        paisNome: coord ? coord.nome : null,
        path: s.path,
        // Clamp em 0: o relógio do Postgres pode estar alguns segundos à frente
        // do Node e "há -3s" na tela parece bug.
        segundosAtras: Math.max(0, Math.round((agora.getTime() - s.lastSeen.getTime()) / 1000)),
        logado: s.userId !== null,
        dispositivo: detectarDispositivo(s.userAgent),
      };
    });

    return NextResponse.json(
      {
        totalOnline,
        paises,
        sessoes,
        // Sessões online cujo país não tem coordenada conhecida (código "XX"
        // da Cloudflare, Tor, país fora da tabela). Ficam fora do mapa mas
        // continuam somadas em totalOnline — este campo explica a diferença
        // entre o número do topo e a soma dos pontos.
        semCoordenada,
        janelaMin,
        geradoEm: agora.toISOString(),
      },
      { headers: SEM_CACHE },
    );
  } catch (err: any) {
    console.error("[admin/realtime/GET] Erro:", err?.message ?? err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: SEM_CACHE });
  }
}
