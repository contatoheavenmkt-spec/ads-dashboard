import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { clampString } from "@/lib/utils";
import { bloqueioDeEscrita } from "@/lib/impersonation";
import { rateLimit } from "@/lib/rate-limit";
import { workspaceDaAgencia, workspacesDaAgencia } from "@/lib/track/acesso";

/**
 * Números de WhatsApp conectados ao Track.
 *
 * O painel nunca fala direto com o WhatsApp: ele só escreve `desiredState` no
 * banco, e o worker converge. O aviso ao worker por HTTP é otimização, e a
 * ausência dele só faz a mudança demorar até a próxima passada do worker.
 */

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "AGENCY") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const workspaces = await workspacesDaAgencia(session.user.id);
  const ids = workspaces.map((w) => w.id);
  if (ids.length === 0) return NextResponse.json({ instancias: [], workspaces: [] });

  const filtro = req.nextUrl.searchParams.get("workspaceId");
  const instancias = await db.whatsappInstance.findMany({
    where: { workspaceId: filtro && ids.includes(filtro) ? filtro : { in: ids } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, label: true, phone: true, state: true, desiredState: true,
      qr: true, pairingCode: true, qrExpiresAt: true, isBusiness: true,
      lastConnectedAt: true, lastSeenAt: true, lastError: true,
      workspace: { select: { id: true, name: true } },
      labels: {
        where: { deleted: false },
        select: { waLabelId: true, name: true, color: true },
        orderBy: { name: "asc" },
      },
      _count: { select: { conversations: true } },
    },
  });

  const agora = Date.now();
  return NextResponse.json({
    workspaces,
    instancias: instancias.map((i) => ({
      ...i,
      // QR vencido não deve piscar na tela como se fosse válido.
      qr: i.qrExpiresAt && i.qrExpiresAt.getTime() < agora ? null : i.qr,
      // O worker bate o heartbeat a cada 30s. Silêncio de mais de 2 minutos
      // com a instância "aberta" significa worker morto, não sessão viva.
      workerVivo: i.lastSeenAt ? agora - i.lastSeenAt.getTime() < 120_000 : false,
    })),
  });
}

interface CriarBody {
  workspaceId?: string;
  label?: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const bloqueio = bloqueioDeEscrita(session);
  if (bloqueio) return bloqueio;
  if (!session?.user?.id || session.user.role !== "AGENCY") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const rl = rateLimit(`track-wa-create:${session.user.id}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Muitas requisições. Tente de novo em ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: CriarBody;
  try {
    body = (await req.json()) as CriarBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.workspaceId) return NextResponse.json({ error: "Informe o cliente" }, { status: 400 });
  const ws = await workspaceDaAgencia(body.workspaceId, session.user.id);
  if (!ws) return NextResponse.json({ error: "Workspace inválido" }, { status: 403 });

  // Um número por workspace no piloto: cada sessão a mais é um chip a mais
  // exposto a bloqueio, e ninguém deve criar dez sem perceber.
  const jaTem = await db.whatsappInstance.count({ where: { workspaceId: ws.id } });
  if (jaTem >= 3) {
    return NextResponse.json(
      { error: "Este cliente já tem 3 números. Remova um antes de adicionar outro." },
      { status: 400 },
    );
  }

  const instancia = await db.whatsappInstance.create({
    data: {
      workspaceId: ws.id,
      label: clampString(body.label, 40) ?? "Principal",
      // Nasce desligada: quem liga é a pessoa, clicando em conectar, com o
      // celular na mão para ler o QR.
      desiredState: "off",
    },
    select: { id: true, label: true, state: true, desiredState: true },
  });

  return NextResponse.json({ instancia }, { status: 201 });
}
