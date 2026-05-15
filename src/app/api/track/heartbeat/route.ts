import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, getClientIp, gcRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);

    // Rate limit: 12 heartbeats / min por IP (≈ 1 a cada 5s) — protege flood.
    gcRateLimit();
    const rl = rateLimit(`hb:${ip}`, 12, 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ ok: true, throttled: true });
    }

    const body = await req.json();
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.slice(0, 100) : null;
    const path = typeof body?.path === "string" ? body.path.slice(0, 500) : null;
    const userId = typeof body?.userId === "string" ? body.userId.slice(0, 50) : null;

    if (!sessionId) return NextResponse.json({ ok: true });

    await db.activeSession.upsert({
      where: { sessionId },
      update: { lastSeen: new Date(), path, userId: userId ?? null },
      create: { sessionId, userId: userId ?? null, path, lastSeen: new Date() },
    });

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    await db.activeSession.deleteMany({ where: { lastSeen: { lt: fiveMinutesAgo } } });
  } catch {
    // analytics never breaks the app
  }
  return NextResponse.json({ ok: true });
}
