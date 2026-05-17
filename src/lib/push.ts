import webpush from "web-push";
import { db } from "@/lib/db";

// VAPID identifica o "remetente" das notificações. Public key vai pro client
// na hora de subscribe; private fica no server pra assinar. Se mudarmos as
// keys, todas as subscriptions já feitas viram inválidas — gera 401/403 e
// limpamos no handler de erro.
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:contato@dashfy.com.br";

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.warn("[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY ausentes — push desativado");
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  configured = true;
  return true;
}

export function getVapidPublicKey(): string | null {
  return VAPID_PUBLIC ?? null;
}

export interface NotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

interface SendOptions {
  userId?: string;
  workspaceId?: string;
  type: string;
  /**
   * Chave de deduplicação. Se já existe NotificationLog com esse dedupeKey,
   * o envio é pulado. Use pra evitar enviar a mesma notificação várias vezes
   * a cada tick do cron (ex.: "balance_low:act_123:2026-05-15" só dispara
   * uma vez por dia, mesmo se o cron rodar a cada hora).
   */
  dedupeKey?: string;
}

/**
 * Envia notificação para os endpoints fornecidos. Limpa subscriptions que
 * voltarem 410 Gone (cliente desinstalou ou revogou permissão).
 */
async function sendToSubscriptions(
  subs: { id: string; endpoint: string; p256dh: string; auth: string }[],
  payload: NotificationPayload,
): Promise<{ sent: number; failed: number }> {
  if (!ensureConfigured()) return { sent: 0, failed: subs.length };

  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const expiredIds: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent++;
      } catch (err: unknown) {
        failed++;
        const statusCode = (err as { statusCode?: number })?.statusCode;
        // 404/410 = endpoint não existe mais (push service descartou). Limpa.
        // 401/403 = assinatura inválida (raro; VAPID errada). Não limpa pra
        // não perder subscriptions se for problema temporário de config.
        if (statusCode === 404 || statusCode === 410) {
          expiredIds.push(s.id);
        }
      }
    }),
  );

  if (expiredIds.length > 0) {
    await db.pushSubscription
      .deleteMany({ where: { id: { in: expiredIds } } })
      .catch(() => {});
  }

  return { sent, failed };
}

/**
 * Notificação para um user específico (todos os devices dele).
 */
export async function sendToUser(
  userId: string,
  payload: NotificationPayload,
  opts: SendOptions,
): Promise<void> {
  if (opts.dedupeKey) {
    const existing = await db.notificationLog.findFirst({
      where: { dedupeKey: opts.dedupeKey },
      select: { id: true },
    });
    if (existing) return;
  }

  const subs = await db.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  if (subs.length === 0) {
    // Sem subscriptions, ainda assim grava log pra contabilizar a tentativa.
    await db.notificationLog
      .create({
        data: {
          userId,
          workspaceId: opts.workspaceId,
          type: opts.type,
          title: payload.title,
          body: payload.body,
          url: payload.url,
          dedupeKey: opts.dedupeKey,
        },
      })
      .catch(() => {});
    return;
  }

  await sendToSubscriptions(subs, payload);

  await db.notificationLog
    .create({
      data: {
        userId,
        workspaceId: opts.workspaceId,
        type: opts.type,
        title: payload.title,
        body: payload.body,
        url: payload.url,
        dedupeKey: opts.dedupeKey,
      },
    })
    .catch(() => {});
}

/**
 * Notificação para todos os users de um workspace (AGENCY owner + CLIENT
 * members). Use pra eventos do workspace que ambos devem saber (ex.: "nova
 * campanha ativa"). Se quer só clientes, use sendToWorkspaceClients.
 */
export async function sendToWorkspace(
  workspaceId: string,
  payload: NotificationPayload,
  opts: Omit<SendOptions, "workspaceId">,
): Promise<void> {
  if (opts.dedupeKey) {
    const existing = await db.notificationLog.findFirst({
      where: { dedupeKey: opts.dedupeKey },
      select: { id: true },
    });
    if (existing) return;
  }

  // Resolve users: owner do workspace + members (clientes finais).
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      ownerId: true,
      deletedAt: true,
      clients: { select: { id: true } },
    },
  });
  // Workspace soft-deleted não recebe mais notificações.
  if (!workspace || workspace.deletedAt) return;

  const userIds = [
    ...(workspace.ownerId ? [workspace.ownerId] : []),
    ...workspace.clients.map((c) => c.id),
  ];

  if (userIds.length === 0) return;

  const subs = await db.pushSubscription.findMany({
    where: { userId: { in: userIds } },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  if (subs.length > 0) {
    await sendToSubscriptions(subs, payload);
  }

  await db.notificationLog
    .create({
      data: {
        workspaceId,
        type: opts.type,
        title: payload.title,
        body: payload.body,
        url: payload.url,
        dedupeKey: opts.dedupeKey,
      },
    })
    .catch(() => {});
}

/**
 * Só clientes finais (role=CLIENT) do workspace. Use pra avisos que não
 * fazem sentido pra agência (ex.: resumo do dia operacional).
 */
export async function sendToWorkspaceClients(
  workspaceId: string,
  payload: NotificationPayload,
  opts: Omit<SendOptions, "workspaceId">,
): Promise<void> {
  const subs = await db.pushSubscription.findMany({
    where: { workspaceId, role: "CLIENT" },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  if (subs.length > 0) {
    await sendToSubscriptions(subs, payload);
  }

  await db.notificationLog
    .create({
      data: {
        workspaceId,
        type: opts.type,
        title: payload.title,
        body: payload.body,
        url: payload.url,
        dedupeKey: opts.dedupeKey,
      },
    })
    .catch(() => {});
}
