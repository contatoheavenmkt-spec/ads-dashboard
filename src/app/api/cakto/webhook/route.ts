import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { planFromWebhookOrder } from "@/lib/cakto";
import { PLANS, type PlanKey } from "@/lib/plans";
import { normalizeEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

function safeEqual(a: string | null | undefined, b: string): boolean {
  if (!a) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nextPeriodEnd(): Date {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

/** Identifica o userId a partir dos dados do pedido.
 *  Estratégia 1: utm_content (passado na URL de checkout)
 *  Estratégia 2: email do cliente (normalizado)
 */
async function findUserId(order: any): Promise<string | null> {
  const utmUserId = order.utm_content as string | undefined;
  if (utmUserId) {
    const user = await db.user.findUnique({
      where: { id: utmUserId },
      select: { id: true },
    });
    if (user) return user.id;
  }

  const email = normalizeEmail(order.customer?.email);
  if (email) {
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (user) return user.id;
  }

  return null;
}

/** Ativa ou atualiza a subscription no banco. */
async function activateSubscription(
  userId: string,
  plan: PlanKey,
  caktoOrderId: string,
) {
  const planDef = PLANS[plan];
  await db.subscription.upsert({
    where: { userId },
    update: {
      plan,
      status: "active",
      stripeSubscriptionId: caktoOrderId, // campo reutilizado para ID externo
      currentPeriodEnd: nextPeriodEnd(),
      accountsLimit: planDef.accountsLimit,
    },
    create: {
      userId,
      plan,
      status: "active",
      stripeSubscriptionId: caktoOrderId,
      currentPeriodEnd: nextPeriodEnd(),
      accountsLimit: planDef.accountsLimit,
    },
  });
}

// ─── Webhook handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Falha fechada em produção: sem secret configurado, recusa.
  const webhookSecret = process.env.CAKTO_WEBHOOK_SECRET;
  if (!webhookSecret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[cakto/webhook] CAKTO_WEBHOOK_SECRET não configurado em produção — recusando");
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
    }
    console.warn("[cakto/webhook] CAKTO_WEBHOOK_SECRET ausente em dev — aceitando sem verificação");
  } else {
    const receivedSecret =
      req.headers.get("x-cakto-secret") ??
      req.headers.get("x-webhook-secret") ??
      req.headers.get("authorization")?.replace("Bearer ", "");

    if (!safeEqual(receivedSecret, webhookSecret)) {
      console.warn("[cakto/webhook] Secret inválido — requisição rejeitada");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const event = (body.event ?? body.type ?? "") as string;
  const order = body.data ?? body;
  const orderId = (order.id ?? order.refId ?? "") as string;

  console.log(`[cakto/webhook] event=${event} orderId=${orderId}`);

  try {
    switch (event) {
      // ── Compra aprovada (one-time ou primeira cobrança de subscription) ─────
      case "purchase_approved":
      case "subscription_created": {
        const plan = planFromWebhookOrder(order);
        if (!plan) {
          console.warn(`[cakto/webhook] ${event}: plano não identificado. product=${order.product?.name} offer=${order.offer?.name}`);
          break;
        }

        // Idempotência: se já existe subscription ativa com esse orderId externo, ignora.
        if (orderId) {
          const existing = await db.subscription.findFirst({
            where: { stripeSubscriptionId: orderId },
          });
          if (existing && existing.status === "active") {
            console.log(`[cakto/webhook] ⏩ Ignorado (já processado): orderId=${orderId}`);
            break;
          }
        }

        const userId = await findUserId(order);
        if (!userId) {
          const email = normalizeEmail(order.customer?.email);
          if (email) {
            await db.pendingSubscription.upsert({
              where: { email },
              update: { plan, orderId },
              create: { email, plan, orderId },
            });
            console.log(`[cakto/webhook] ⏳ Pending salvo: email=${email} plan=${plan}`);
          } else {
            console.warn(`[cakto/webhook] ${event}: usuário não encontrado e sem email. utm_content=${order.utm_content}`);
          }
          break;
        }

        await activateSubscription(userId, plan, orderId);
        console.log(`[cakto/webhook] ✓ Ativado: userId=${userId} plan=${plan}`);
        break;
      }

      // ── Renovação de assinatura bem-sucedida ──────────────────────────────
      case "subscription_renewed": {
        let sub = orderId
          ? await db.subscription.findFirst({ where: { stripeSubscriptionId: orderId } })
          : null;

        if (!sub) {
          const userId = await findUserId(order);
          if (userId) sub = await db.subscription.findUnique({ where: { userId } });
        }

        if (!sub) {
          console.warn(`[cakto/webhook] subscription_renewed: assinatura não encontrada para orderId=${orderId}`);
          break;
        }

        // Idempotência: se já está ativa com período no futuro, ignora.
        if (sub.status === "active" && sub.currentPeriodEnd && sub.currentPeriodEnd > new Date(Date.now() + 25 * 24 * 60 * 60 * 1000)) {
          console.log(`[cakto/webhook] ⏩ Renovação já aplicada recentemente para userId=${sub.userId}`);
          break;
        }

        await db.subscription.update({
          where: { id: sub.id },
          data: { status: "active", currentPeriodEnd: nextPeriodEnd() },
        });
        console.log(`[cakto/webhook] ✓ Renovado: userId=${sub.userId}`);
        break;
      }

      // ── Renovação recusada (pagamento falhou) ─────────────────────────────
      case "subscription_renewal_refused": {
        const userId = await findUserId(order);
        if (!userId) break;

        const sub = await db.subscription.findUnique({ where: { userId } });
        if (!sub) break;

        await db.subscription.update({
          where: { id: sub.id },
          data: { status: "expired" },
        });
        console.warn(`[cakto/webhook] ⚠ Renovação recusada: userId=${userId}`);
        break;
      }

      // ── Assinatura cancelada ──────────────────────────────────────────────
      case "subscription_canceled": {
        let sub = orderId
          ? await db.subscription.findFirst({ where: { stripeSubscriptionId: orderId } })
          : null;

        if (!sub) {
          const userId = await findUserId(order);
          if (userId) sub = await db.subscription.findUnique({ where: { userId } });
        }

        if (!sub) break;

        await db.subscription.update({
          where: { id: sub.id },
          data: { status: "canceled", stripeSubscriptionId: null },
        });
        console.log(`[cakto/webhook] ✓ Cancelado: userId=${sub.userId}`);
        break;
      }

      default:
        console.log(`[cakto/webhook] Evento ignorado: ${event}`);
        break;
    }
  } catch (err: any) {
    console.error("[cakto/webhook] Erro no handler:", err.message);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
