import { NextRequest, NextResponse } from "next/server";
import { getStoredMetaToken } from "@/lib/meta-token";
import { requireMetricsAccess, isAdAccountAuthorized } from "@/lib/workspace-access";

const GRAPH_API = "https://graph.facebook.com/v21.0";

/**
 * O anúncio DE VERDADE, como quem rolou o feed viu.
 *
 * A thumbnail resolve a lista, mas análise de criativo se faz olhando a peça
 * real: o vídeo, o texto completo, o botão. O Meta entrega isso pelo endpoint
 * de previews, que devolve um iframe renderizando o anúncio como ele foi ao
 * ar, inclusive para anúncio pausado.
 */

/** Formatos em ordem de preferência: feed mobile é como a maioria viu. */
const FORMATOS = ["MOBILE_FEED_STANDARD", "INSTAGRAM_STANDARD", "DESKTOP_FEED_STANDARD"];

export async function GET(req: NextRequest) {
  const adId = req.nextUrl.searchParams.get("adId");
  const adAccountId = req.nextUrl.searchParams.get("adAccountId");
  const workspaceIdParam = req.nextUrl.searchParams.get("workspaceId");

  if (!adId || !/^\d+$/.test(adId)) {
    return NextResponse.json({ error: "Anúncio inválido" }, { status: 400 });
  }
  if (!adAccountId) {
    return NextResponse.json({ error: "Informe a conta" }, { status: 400 });
  }

  const access = await requireMetricsAccess(req, workspaceIdParam);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status ?? 401 });
  }
  const userId = access.resolvedUserId;
  if (!userId) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });

  // A conta precisa pertencer a um workspace deste dono: sem isso, qualquer
  // id de anúncio alheio viraria preview com o token da agência.
  const ok = await isAdAccountAuthorized(adAccountId, userId, workspaceIdParam);
  if (!ok) {
    return NextResponse.json({ error: "Conta de anúncios não autorizada" }, { status: 403 });
  }

  const token = await getStoredMetaToken(userId);
  if (!token) return NextResponse.json({ error: "Conta Meta desconectada" }, { status: 400 });

  // Tenta os formatos em ordem: nem todo anúncio existe em todo canal.
  for (const formato of FORMATOS) {
    try {
      const res = await fetch(
        `${GRAPH_API}/${adId}/previews?ad_format=${formato}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const data = await res.json().catch(() => ({}));
      const body: string | undefined = data?.data?.[0]?.body;
      if (body) {
        // O body é um <iframe src="https://www.facebook.com/ads/api/preview_iframe.php...">
        const src = body.match(/src="([^"]+)"/)?.[1];
        if (src) {
          return NextResponse.json({
            // O HTML escapa & como &amp; dentro do atributo.
            iframeUrl: src.replace(/&amp;/g, "&"),
            formato,
          });
        }
      }
    } catch {
      // tenta o próximo formato
    }
  }

  return NextResponse.json(
    { error: "O Meta não devolveu preview para este anúncio." },
    { status: 404 },
  );
}
