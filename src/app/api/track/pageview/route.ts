import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, getClientIp, gcRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    // Rate limit: 120 pageviews / min por IP — protege a tabela PageView contra flood.
    gcRateLimit();
    const rl = rateLimit(`pv:${ip}`, 120, 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ ok: true, throttled: true });
    }

    const body = await req.json();
    const path = typeof body?.path === "string" ? body.path.slice(0, 500) : null;
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.slice(0, 100) : null;
    const referrer = typeof body?.referrer === "string" ? body.referrer.slice(0, 500) : null;
    const userId = typeof body?.userId === "string" ? body.userId.slice(0, 50) : null;

    if (!path || !sessionId) return NextResponse.json({ ok: true });

    const country =
      req.headers.get("cf-ipcountry") ||
      req.headers.get("x-vercel-ip-country") ||
      "BR";
    const userAgent = req.headers.get("user-agent")?.slice(0, 500) || null;
    const ipForDb = ip === "unknown" ? null : ip;

    await db.activeSession.upsert({
      where: { sessionId },
      update: { lastSeen: new Date(), path, userId: userId ?? null },
      create: { sessionId, userId: userId ?? null, ip: ipForDb, country, path, userAgent, lastSeen: new Date() },
    });

    await db.pageView.create({
      data: { path, sessionId, userId: userId ?? null, ip: ipForDb, country, userAgent, referrer: referrer ?? null },
    });
  } catch {
    // analytics never breaks the app
  }
  return NextResponse.json({ ok: true });
}
