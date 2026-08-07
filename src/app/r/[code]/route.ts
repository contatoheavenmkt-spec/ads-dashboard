import { NextRequest, NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { generateCode, renderMessage } from "@/lib/track/code";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Redirecionador do link rastreável: /r/<slug>
 *
 * Este é o caminho quente do produto. Quem passa por aqui é gente que acabou
 * de clicar num anúncio pago, então a única prioridade é chegar no WhatsApp
 * rápido e nunca falhar. Consequências disso no código abaixo:
 *
 * - O código curto é gerado em memória, sem ida ao banco.
 * - A gravação do clique vai para `after()`, depois da resposta.
 * - Erro de banco não vira erro para o visitante: perde-se a atribuição
 *   daquele clique, nunca a visita.
 *
 * ATENÇÃO: esta rota precisa estar liberada em src/proxy.ts. O matcher de lá
 * pega /r/* e, sem a exclusão, manda o clique do anúncio para /login.
 */

export const dynamic = "force-dynamic";

/** Cache do link em processo: o mesmo anúncio manda muita gente para o mesmo slug. */
type CachedLink = {
  id: string;
  workspaceId: string;
  destinationPhone: string;
  messageTemplate: string;
  active: boolean;
  fallbackUrl: string | null;
  workspace: { deletedAt: Date | null } | null;
} | null;

const linkCache = new Map<string, { value: CachedLink; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 500;

function cacheGet(slug: string): CachedLink | undefined {
  const hit = linkCache.get(slug);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    linkCache.delete(slug);
    return undefined;
  }
  return hit.value;
}

function cacheSet(slug: string, value: CachedLink): void {
  // Cap simples: sem LRU de verdade, só evita crescer sem limite num processo longo.
  if (linkCache.size >= CACHE_MAX) {
    const oldest = linkCache.keys().next().value;
    if (oldest) linkCache.delete(oldest);
  }
  linkCache.set(slug, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * O Google Ads revisa cada anúncio buscando a URL final, e o WhatsApp busca
 * preview de link. Sem este filtro, cada revisão viraria um "clique" e
 * estragaria o CPL que o cliente vê.
 */
const BOT_RE = /AdsBot|Googlebot|APIs-Google|bingbot|DuckDuckBot|YandexBot|facebookexternalhit|facebookcatalog|WhatsApp|Twitterbot|LinkedInBot|TelegramBot|Slackbot|Discordbot|curl|wget|python-requests|axios|node-fetch|HeadlessChrome|PhantomJS|Lighthouse|Chrome-Lighthouse/i;

function isBot(userAgent: string | null): boolean {
  return Boolean(userAgent && BOT_RE.test(userAgent));
}

function clientIp(req: NextRequest): string | null {
  // Última entrada do XFF é a que o nosso proxy escreveu; as anteriores o
  // cliente pode forjar.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return req.headers.get("x-real-ip");
}

function param(req: NextRequest, ...names: string[]): string | null {
  for (const n of names) {
    const v = req.nextUrl.searchParams.get(n);
    if (v) return v.slice(0, 512);
  }
  return null;
}

/** O crawler do Google Ads costuma validar a URL com HEAD. Não é clique. */
export async function HEAD() {
  return new NextResponse(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code: slug } = await ctx.params;

  let link = cacheGet(slug);
  if (link === undefined) {
    let falhouOBanco = false;
    link = await db.trackLink
      .findUnique({
        where: { slug },
        select: {
          id: true,
          workspaceId: true,
          destinationPhone: true,
          messageTemplate: true,
          active: true,
          fallbackUrl: true,
          // Workspace removido não pode continuar recebendo clique: seria
          // coleta de dado pessoal depois do fim da relação, em registro que
          // nenhuma tela lê e que a agência não consegue mais desligar.
          workspace: { select: { deletedAt: true } },
        },
      })
      .catch((err) => {
        falhouOBanco = true;
        console.error(`[track/r] banco indisponível ao resolver slug=${slug}:`, (err as Error).message);
        return null;
      });

    if (link?.workspace?.deletedAt) link = null;

    // Só cacheia ausência REAL. Cachear falha de banco transformaria um
    // soluço de dois segundos em 404 fixo por um minuto inteiro, e aí o
    // cliente perde a visita, não só a atribuição.
    if (!falhouOBanco) cacheSet(slug, link);
  }

  if (!link || !link.active) {
    return new NextResponse("Link não encontrado", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const code = generateCode();
  const texto = renderMessage(link.messageTemplate, code);
  const destino = `https://wa.me/${link.destinationPhone}?text=${encodeURIComponent(texto)}`;

  const userAgent = req.headers.get("user-agent");
  const bot = isBot(userAgent);

  /*
   * O redirect é público e o gclid vem da query, então qualquer um pode bater
   * aqui em loop e poluir os números do cliente. O limite é por IP e vale só
   * para a GRAVAÇÃO: o visitante nunca vê erro, no máximo aquele clique não é
   * contado. Gente de verdade não clica 30 vezes no mesmo anúncio em um
   * minuto; script sim.
   */
  const ip = clientIp(req);
  const podeGravar = !bot && rateLimit(`track-click:${ip ?? "sem-ip"}`, 30, 60_000).ok;

  if (podeGravar) {
    const dados = {
      workspaceId: link.workspaceId,
      linkId: link.id,
      code,
      gclid: param(req, "gclid"),
      wbraid: param(req, "wbraid"),
      gbraid: param(req, "gbraid"),
      fbclid: param(req, "fbclid"),
      ctwaClid: param(req, "ctwa_clid", "ctwaclid"),
      utmSource: param(req, "utm_source"),
      utmMedium: param(req, "utm_medium"),
      utmCampaign: param(req, "utm_campaign"),
      utmContent: param(req, "utm_content"),
      utmTerm: param(req, "utm_term"),
      campaignId: param(req, "campaignid", "campaign_id"),
      adGroupId: param(req, "adgroupid", "adgroup_id"),
      creativeId: param(req, "creative", "creative_id"),
      keyword: param(req, "keyword"),
      device: param(req, "device"),
      ip,
      userAgent: userAgent?.slice(0, 512) ?? null,
    };

    after(async () => {
      try {
        await db.trackClick.create({ data: dados });
        await db.trackLink.update({
          where: { id: link.id },
          data: { clickCount: { increment: 1 } },
        });
      } catch (err) {
        /*
         * P2002 é colisão do código curto com um clique que já existe. O
         * visitante já saiu com aquele código na mensagem, então NÃO dá para
         * simplesmente ignorar: a conversa dele casaria com o clique de outra
         * pessoa, atribuindo a venda à campanha errada. Regravar com outro
         * código também não resolve, porque o código que ele leva é o antigo.
         *
         * O caminho correto é queimar o código do clique antigo: os dois
         * ficam sem atribuição automática, o que é ruim, mas é muito melhor
         * do que atribuir venda a quem não gerou.
         */
        if ((err as { code?: string }).code === "P2002") {
          console.error(`[track/r] COLISÃO de código ${code} no slug=${slug}: invalidando o clique anterior`);
          await db.trackClick
            .updateMany({
              where: { workspaceId: link.workspaceId, code, matchedAt: null },
              data: { code: `colidido-${code}-${Date.now()}` },
            })
            .then(() => db.trackClick.create({ data: dados }))
            .catch((e) => console.error(`[track/r] não consegui resolver a colisão:`, (e as Error).message));
        } else {
          console.error(`[track/r] falha ao gravar clique do slug=${slug}:`, (err as Error).message);
        }
      }
    });
  }

  return NextResponse.redirect(destino, {
    status: 302,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
