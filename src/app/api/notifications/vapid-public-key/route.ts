import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/push";

export async function GET() {
  const key = getVapidPublicKey();
  if (!key) {
    return NextResponse.json({ error: "Push notifications não configuradas" }, { status: 503 });
  }
  return NextResponse.json({ publicKey: key });
}
