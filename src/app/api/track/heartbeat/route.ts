import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, path, userId } = body;

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
