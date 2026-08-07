import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { clampString } from "@/lib/utils";
import { bloqueioDeEscrita } from "@/lib/impersonation";
import { rateLimit } from "@/lib/rate-limit";
import { generateSlug } from "@/lib/track/code";
import { normalizePhone } from "@/lib/track/phone";

/**
 * Links de rastreio do Track, consolidados por agência.
 *
 * Segue o mesmo desenho de /api/agency/leads: só AGENCY, e o escopo é sempre
 * a lista de workspaces que a pessoa possui, resolvida no servidor. Nenhum
 * workspaceId vindo do cliente é aceito sem estar nessa lista.
 */

async function workspacesDoDono(userId: string) {
  return db.workspace.findMany({
    where: { ownerId: userId, deletedAt: null },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "AGENCY") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId");

  const workspaces = await workspacesDoDono(session.user.id);
  const ids = workspaces.map((w) => w.id);
  if (ids.length === 0) return NextResponse.json({ links: [], workspaces: [] });

  const links = await db.trackLink.findMany({
    where: {
      workspaceId: workspaceId && ids.includes(workspaceId) ? workspaceId : { in: ids },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, slug: true, name: true, destinationPhone: true,
      messageTemplate: true, platform: true, active: true,
      clickCount: true, fallbackUrl: true, createdAt: true,
      workspace: { select: { id: true, name: true, slug: true } },
    },
  });

  // Quantos cliques já viraram conversa: é o número que diz se o rastreio
  // está de pé. Link com muito clique e nenhum casamento significa que a
  // mensagem está chegando sem o código.
  const casados = await db.trackClick.groupBy({
    by: ["linkId"],
    where: { linkId: { in: links.map((l) => l.id) }, matchedAt: { not: null } },
    _count: { _all: true },
  });
  const mapaCasados = new Map(casados.map((c) => [c.linkId, c._count._all]));

  return NextResponse.json({
    links: links.map((l) => ({ ...l, matchedCount: mapaCasados.get(l.id) ?? 0 })),
    workspaces,
    baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
  });
}

interface CriarLinkBody {
  workspaceId?: string;
  name?: string;
  destinationPhone?: string;
  messageTemplate?: string;
  platform?: string;
  fallbackUrl?: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const bloqueio = bloqueioDeEscrita(session);
  if (bloqueio) return bloqueio;
  if (!session?.user?.id || session.user.role !== "AGENCY") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const rl = rateLimit(`track-links-create:${session.user.id}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Muitas requisições. Tente de novo em ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: CriarLinkBody;
  try {
    body = (await req.json()) as CriarLinkBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const workspaces = await workspacesDoDono(session.user.id);
  const ids = workspaces.map((w) => w.id);
  if (!body.workspaceId || !ids.includes(body.workspaceId)) {
    return NextResponse.json({ error: "Workspace inválido" }, { status: 400 });
  }

  // clampString devolve null para vazio ou não-string, e já faz o trim.
  const name = clampString(body.name, 80);
  if (!name) return NextResponse.json({ error: "Dê um nome ao link" }, { status: 400 });

  // O destino é o WhatsApp que vai atender. Sem número válido o link não serve.
  const destinationPhone = normalizePhone(body.destinationPhone ?? "");
  if (destinationPhone.length < 12 || destinationPhone.length > 15) {
    return NextResponse.json(
      { error: "Número de destino inválido. Use DDD e número, ex: 11 98765-4321." },
      { status: 400 },
    );
  }

  const PADRAO = "Olá! Vim pelo anúncio. Código {code}";
  const messageTemplate = clampString(body.messageTemplate, 300) ?? PADRAO;

  let fallbackUrl: string | null = null;
  if (body.fallbackUrl?.trim()) {
    try {
      const u = new URL(body.fallbackUrl.trim());
      if (!["http:", "https:"].includes(u.protocol)) throw new Error("protocolo");
      fallbackUrl = clampString(u.toString(), 500);
    } catch {
      return NextResponse.json({ error: "URL de fallback inválida" }, { status: 400 });
    }
  }

  const platform = ["google", "meta", "outro"].includes(body.platform ?? "")
    ? body.platform!
    : "google";

  // Slug curto entra na URL final do anúncio, que o Google exibe. Colisão é
  // rara mas possível: tenta de novo com um slug maior antes de desistir.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const slug = generateSlug(tentativa < 3 ? 6 : 8);
    try {
      const link = await db.trackLink.create({
        data: {
          workspaceId: body.workspaceId,
          slug,
          name,
          destinationPhone,
          messageTemplate,
          platform,
          fallbackUrl,
          createdByUserId: session.user.id,
        },
        select: {
          id: true, slug: true, name: true, destinationPhone: true,
          messageTemplate: true, platform: true, active: true,
          clickCount: true, fallbackUrl: true, createdAt: true,
          workspace: { select: { id: true, name: true, slug: true } },
        },
      });
      return NextResponse.json({ link: { ...link, matchedCount: 0 } }, { status: 201 });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "P2002") {
        console.error("[track/links] falha ao criar:", (err as Error).message);
        return NextResponse.json({ error: "Não foi possível criar o link" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ error: "Não foi possível gerar um slug livre" }, { status: 500 });
}
