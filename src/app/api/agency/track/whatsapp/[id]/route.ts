import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { bloqueioDeEscrita } from "@/lib/impersonation";
import { rateLimit } from "@/lib/rate-limit";
import { instanciaDaAgencia } from "@/lib/track/acesso";
import { avisarWorker } from "@/lib/track/worker-control";

/**
 * Ligar, desligar e remover um número.
 *
 * O painel só escreve `desiredState`; quem age é o worker. Isso mantém uma
 * fonte da verdade só e faz o sistema se recuperar sozinho de worker
 * reiniciado, comando perdido ou VPS que voltou de reboot.
 */

interface AcaoBody {
  acao?: "conectar" | "desconectar" | "deslogar";
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const bloqueio = bloqueioDeEscrita(session);
  if (bloqueio) return bloqueio;
  if (!session?.user?.id || session.user.role !== "AGENCY") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const instancia = await instanciaDaAgencia(id, session.user.id);
  if (!instancia) return NextResponse.json({ error: "Número não encontrado" }, { status: 404 });

  // Conectar e desconectar mexem numa sessão real de WhatsApp: um loop de
  // cliques viraria reconexão em rajada, que é justamente o comportamento que
  // chama atenção e leva a bloqueio do número.
  const rl = rateLimit(`track-wa-acao:${session.user.id}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Espere ${rl.retryAfter}s antes de tentar de novo.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: AcaoBody;
  try {
    body = (await req.json()) as AcaoBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (body.acao === "conectar") {
    await db.whatsappInstance.update({
      where: { id },
      data: {
        desiredState: "on",
        // Estado logged_out trava a subida no reconcile: limpar aqui é o que
        // permite parear de novo depois de o celular ter desconectado.
        state: "close",
        lastError: null,
        qr: null,
        pairingCode: null,
      },
    });
    const avisou = await avisarWorker();
    return NextResponse.json({
      ok: true,
      // Sem o aviso, o loop pega em até 20s. A tela informa isso em vez de
      // fingir que já está conectando.
      mensagem: avisou
        ? "Conectando. O QR aparece em alguns segundos."
        : "Pedido registrado. O QR aparece em até 20 segundos.",
    });
  }

  if (body.acao === "desconectar") {
    await db.whatsappInstance.update({
      where: { id },
      data: { desiredState: "off", qr: null, pairingCode: null },
    });
    await avisarWorker();
    return NextResponse.json({ ok: true, mensagem: "Número desligado. A credencial foi mantida, então religar não pede QR de novo." });
  }

  if (body.acao === "deslogar") {
    await db.whatsappInstance.update({
      where: { id },
      data: { desiredState: "off" },
    });
    const avisou = await avisarWorker(`/deslogar?id=${encodeURIComponent(id)}`);
    if (!avisou) {
      // Sem o worker, a sessão no aparelho continua ativa: prometer o
      // contrário faria a pessoa achar que desconectou e não desconectou.
      return NextResponse.json({
        ok: false,
        mensagem: "Não consegui falar com o worker agora. O número foi desligado, mas a sessão segue ativa no aparelho até o worker voltar.",
      });
    }
    return NextResponse.json({ ok: true, mensagem: "Sessão encerrada. Para usar de novo, será preciso escanear o QR." });
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const bloqueio = bloqueioDeEscrita(session);
  if (bloqueio) return bloqueio;
  if (!session?.user?.id || session.user.role !== "AGENCY") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const instancia = await instanciaDaAgencia(id, session.user.id);
  if (!instancia) return NextResponse.json({ error: "Número não encontrado" }, { status: 404 });

  // Apagar a instância leva junto as conversas em cascata, e conversa é o
  // histórico de atribuição que sustenta o relatório do cliente.
  const conversas = await db.trackConversation.count({ where: { instanceId: id } });
  if (conversas > 0) {
    return NextResponse.json(
      {
        error: `Este número tem ${conversas} conversa(s) rastreada(s). Apagar levaria junto o histórico de atribuição. Use "Encerrar sessão" para parar de usá-lo sem perder os dados.`,
      },
      { status: 409 },
    );
  }

  await db.whatsappInstance.update({ where: { id }, data: { desiredState: "off" } });
  await avisarWorker();
  await db.whatsappInstance.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
