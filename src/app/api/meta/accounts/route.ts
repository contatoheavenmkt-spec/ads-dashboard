import { NextResponse } from "next/server";
import { getMetaBMs, type MetaBM } from "@/lib/meta-api";
import { getMetaConnections } from "@/lib/meta-token";

export async function GET() {
  const connections = await getMetaConnections();

  if (connections.length === 0) {
    return NextResponse.json({ error: "NO_TOKEN", connections: [], bms: [] });
  }

  // Busca BMs de todas as contas Meta conectadas
  const results = await Promise.allSettled(
    connections.map((conn) => getMetaBMs(conn.accessToken))
  );

  // Mescla todas as BMs, evitando duplicatas por id
  const bmMap = new Map<string, MetaBM>();
  let lastError = null;

  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const bm of result.value) {
        if (!bmMap.has(bm.id)) bmMap.set(bm.id, bm);
      }
    } else {
      console.error("Erro ao buscar contas Meta:", result.reason);
      lastError = result.reason?.message || "Erro desconhecido na Meta API";
    }
  }

  if (bmMap.size === 0 && lastError) {
    return NextResponse.json({ error: lastError, connections, bms: [] });
  }

  return NextResponse.json({
    connections: connections.map((c) => ({ id: c.id, name: c.name, fbUserId: c.fbUserId })),
    bms: Array.from(bmMap.values()),
  });
}
