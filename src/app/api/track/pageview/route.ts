import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { path, sessionId, referrer, userId } = body;

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null;
    const country =
      req.headers.get("cf-ipcountry") ||
      req.headers.get("x-vercel-ip-country") ||
      "BR";
    const userAgent = req.headers.get("user-agent") || null;

    await db.activeSession.upsert({
      where: { sessionId },
      update: { lastSeen: new Date(), path, userId: userId ?? null },
      create: { sessionId, userId: userId ?? null, ip, country, path, userAgent, lastSeen: new Date() },
    });

    await db.pageView.create({
      data: { path, sessionId, userId: userId ?? null, ip, country, userAgent, referrer: referrer ?? null },
    });
  } catch {
    // analytics never breaks the app
  }
  return NextResponse.json({ ok: true });
}
