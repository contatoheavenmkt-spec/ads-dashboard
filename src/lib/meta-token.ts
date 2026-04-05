import { db } from "@/lib/db";

export async function getStoredMetaToken(userId: string): Promise<string | null> {
  const conn = await db.metaConnection.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  if (!conn) return null;
  if (conn.expiresAt && conn.expiresAt < new Date()) return null;
  return conn.accessToken;
}

export async function saveMetaToken(userId: string, {
  fbUserId,
  accessToken,
  name,
  expiresIn,
}: {
  fbUserId: string;
  accessToken: string;
  name?: string;
  expiresIn?: number;
}) {
  const expiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000)
    : null;

  await db.metaConnection.upsert({
    where: { userId_fbUserId: { userId, fbUserId } },
    create: { userId, fbUserId, accessToken, name: name ?? null, expiresAt },
    update: { accessToken, name: name ?? undefined, expiresAt, updatedAt: new Date() },
  });
}

export async function getMetaConnections(userId: string) {
  return db.metaConnection.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
}

export async function deleteMetaConnection(userId: string, id: string) {
  // Garante que só deleta conexão do próprio usuário
  await db.metaConnection.deleteMany({ where: { id, userId } });
}
