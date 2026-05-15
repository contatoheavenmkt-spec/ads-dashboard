import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

interface SubscribeBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let body: SubscribeBody;
  try {
    body = (await req.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "Subscription incompleta" }, { status: 400 });
  }

  // Busca role e workspaceId atuais do user — snapshot pra usar no roteamento
  // de notificações sem precisar fazer join toda vez.
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, workspaceId: true },
  });
  if (!user) return NextResponse.json({ error: "User não encontrado" }, { status: 404 });

  // Upsert por endpoint: se o mesmo device re-subscreve, atualiza as keys
  // (push services rotacionam o auth ocasionalmente).
  await db.pushSubscription.upsert({
    where: { endpoint: body.endpoint },
    create: {
      userId: session.user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      role: user.role,
      workspaceId: user.workspaceId,
      userAgent: body.userAgent,
    },
    update: {
      userId: session.user.id,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      role: user.role,
      workspaceId: user.workspaceId,
      userAgent: body.userAgent,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint obrigatório" }, { status: 400 });
  }

  // Só permite remover subscriptions do próprio user (defesa contra usuário
  // mal-intencionado apagando a subscription de outro).
  await db.pushSubscription.deleteMany({
    where: { endpoint, userId: session.user.id },
  });

  return NextResponse.json({ ok: true });
}
