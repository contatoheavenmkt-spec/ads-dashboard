import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { planFromWebhookOrder } from "@/lib/cakto";
import { PLANS, type PlanKey } from "@/lib/plans";

export const dynamic = "force-dynamic";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nextPeriodEnd(): Date {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

/** Identifica o userId a partir dos dados do pedido.
 *  Estratégia 1: utm_content (passado na URL de checkout)
 *  Estratégia 2: email do cliente
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

  const email = order.customer?.email as string | undefined;
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
  // Verificação do secret (configure CAKTO_WEBHOOK_SECRET no .env)
  const webhookSecret = process.env.CAKTO_WEBHOOK_SECRET;
  if (webhookSecret) {
    // Cakto envia o secret no header X-Cakto-Secret (confirme no dashboard deles)
    const receivedSecret =
      req.headers.get("x-cakto-secret") ??
      req.headers.get("x-webhook-secret") ??
      req.headers.get("authorization")?.replace("Bearer ", "");

    if (receivedSecret !== webhookSecret) {
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

  // A Cakto pode mandar o evento em body.event ou body.type
  const event = (body.event ?? body.type ?? "") as string;
  // Dados do pedido podem estar aninhados em body.data ou diretamente no body
  const order = body.data ?? body;
  const orderId = (order.id ?? order.refId ?? "") as string;

  console.log(`[cakto/webhook] event=${event} orderId=${orderId}`);

  try {
    switch (event) {
      // ── Compra aprovada (one-time ou primeira cobrança de subscription) ─────
      case "purchase_approved":
      case "subscription_created": {
        const userId = await findUserId(order);
        if (!userId) {
          console.warn(`[cakto/webhook] ${event}: usuário não encontrado. utm_content=${order.utm_content} email=${order.customer?.email}`);
          break;
        }

        const plan = planFromWebhookOrder(order);
        if (!plan) {
          console.warn(`[cakto/webhook] ${event}: plano não identificado. product=${order.product?.name} offer=${order.offer?.name}`);
          break;
        }

        await activateSubscription(userId, plan, orderId);
        console.log(`[cakto/webhook] ✓ Ativado: userId=${userId} plan=${plan}`);
        break;
      }

      // ── Renovação de assinatura bem-sucedida ──────────────────────────────
      case "subscription_renewed": {
        // Tenta encontrar pelo ID externo armazenado
        let sub = orderId
          ? await db.subscription.findFirst({ where: { stripeSubscriptionId: orderId } })
          : null;

        // Fallback: encontra pelo usuário
        if (!sub) {
          const userId = await findUserId(order);
          if (userId) sub = await db.subscription.findUnique({ where: { userId } });
        }

        if (!sub) {
          console.warn(`[cakto/webhook] subscription_renewed: assinatura não encontrada para orderId=${orderId}`);
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
        // Ignora eventos informativos (pix_gerado, boleto_gerado, etc.)
        console.log(`[cakto/webhook] Evento ignorado: ${event}`);
        break;
    }
  } catch (err: any) {
    console.error("[cakto/webhook] Erro no handler:", err.message);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }

  // Cakto espera 200 em até 5 segundos — sempre retornar rápido
  return NextResponse.json({ received: true });
}
