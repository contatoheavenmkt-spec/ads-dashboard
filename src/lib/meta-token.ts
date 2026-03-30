// Helper para salvar e buscar o token Meta OAuth no banco de dados

import { db } from "@/lib/db";

export async function getStoredMetaToken(): Promise<string | null> {
  // Pega a conexão Meta mais recente
  const conn = await db.metaConnection.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  if (!conn) return null;

  // Verifica se o token expirou
  if (conn.expiresAt && conn.expiresAt < new Date()) return null;

  return conn.accessToken;
}

export async function saveMetaToken({
  fbUserId,
  accessToken,
  name,
  expiresIn,
}: {
  fbUserId: string;
  accessToken: string;
  name?: string;
  expiresIn?: number; // segundos
}) {
  const expiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000)
    : null;

  await db.metaConnection.upsert({
    where: { fbUserId },
    create: { fbUserId, accessToken, name: name ?? null, expiresAt },
    update: { accessToken, name: name ?? undefined, expiresAt, updatedAt: new Date() },
  });
}

export async function getMetaConnections() {
  return db.metaConnection.findMany({ orderBy: { updatedAt: "desc" } });
}

export async function deleteMetaConnection(id: string) {
  await db.metaConnection.delete({ where: { id } });
}
