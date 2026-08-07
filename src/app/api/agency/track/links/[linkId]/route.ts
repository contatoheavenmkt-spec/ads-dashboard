import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { clampString } from "@/lib/utils";
import { bloqueioDeEscrita } from "@/lib/impersonation";
import { normalizePhone } from "@/lib/track/phone";

/**
 * Edição e remoção de um link de rastreio.
 *
 * A checagem de dono é feita sempre pelo caminho workspace.ownerId, nunca
 * confiando no id que veio da URL.
 */

async function linkDoDono(linkId: string, userId: string) {
  const link = await db.trackLink.findUnique({
    where: { id: linkId },
    select: { id: true, workspace: { select: { id: true, ownerId: true, deletedAt: true } } },
  });
  if (!link || link.workspace.deletedAt || link.workspace.ownerId !== userId) return null;
  return link;
}

interface EditarBody {
  name?: string;
  destinationPhone?: string;
  messageTemplate?: string;
  active?: boolean;
  fallbackUrl?: string | null;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ linkId: string }> }) {
  const session = await auth();
  const bloqueio = bloqueioDeEscrita(session);
  if (bloqueio) return bloqueio;
  if (!session?.user?.id || session.user.role !== "AGENCY") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { linkId } = await ctx.params;
  const link = await linkDoDono(linkId, session.user.id);
  if (!link) return NextResponse.json({ error: "Link não encontrado" }, { status: 404 });

  let body: EditarBody;
  try {
    body = (await req.json()) as EditarBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  if (typeof body.name === "string") {
    // clampString já faz trim e devolve null para vazio.
    const name = clampString(body.name, 80);
    if (!name) return NextResponse.json({ error: "Nome não pode ficar vazio" }, { status: 400 });
    data.name = name;
  }

  if (typeof body.destinationPhone === "string") {
    const phone = normalizePhone(body.destinationPhone);
    if (phone.length < 12 || phone.length > 15) {
      return NextResponse.json({ error: "Número de destino inválido" }, { status: 400 });
    }
    data.destinationPhone = phone;
  }

  if (typeof body.messageTemplate === "string") {
    const tpl = clampString(body.messageTemplate.trim(), 300);
    if (!tpl) return NextResponse.json({ error: "Mensagem não pode ficar vazia" }, { status: 400 });
    data.messageTemplate = tpl;
  }

  if (typeof body.active === "boolean") data.active = body.active;

  if (body.fallbackUrl !== undefined) {
    if (!body.fallbackUrl) {
      data.fallbackUrl = null;
    } else {
      try {
        const u = new URL(body.fallbackUrl);
        if (!["http:", "https:"].includes(u.protocol)) throw new Error("protocolo");
        data.fallbackUrl = clampString(u.toString(), 500);
      } catch {
        return NextResponse.json({ error: "URL de fallback inválida" }, { status: 400 });
      }
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
  }

  const atualizado = await db.trackLink.update({
    where: { id: linkId },
    data,
    select: {
      id: true, slug: true, name: true, destinationPhone: true,
      messageTemplate: true, platform: true, active: true,
      clickCount: true, fallbackUrl: true, createdAt: true,
      workspace: { select: { id: true, name: true, slug: true } },
    },
  });

  return NextResponse.json({ link: atualizado });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ linkId: string }> }) {
  const session = await auth();
  const bloqueio = bloqueioDeEscrita(session);
  if (bloqueio) return bloqueio;
  if (!session?.user?.id || session.user.role !== "AGENCY") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { linkId } = await ctx.params;
  const link = await linkDoDono(linkId, session.user.id);
  if (!link) return NextResponse.json({ error: "Link não encontrado" }, { status: 404 });

  // Apagar o link apaga os cliques (cascade), e clique é histórico de
  // atribuição. Se já houve clique, desativa em vez de apagar: link morto
  // não recebe mais tráfego, mas o funil histórico continua de pé.
  const cliques = await db.trackClick.count({ where: { linkId } });
  if (cliques > 0) {
    await db.trackLink.update({ where: { id: linkId }, data: { active: false } });
    return NextResponse.json({
      desativado: true,
      motivo: `O link já recebeu ${cliques} clique(s), então foi desativado em vez de apagado para preservar o histórico de atribuição.`,
    });
  }

  await db.trackLink.delete({ where: { id: linkId } });
  return NextResponse.json({ ok: true });
}
