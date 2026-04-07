import { NextRequest, NextResponse } from "next/server";
import { clearAdminCookie, validateAdminRequest } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  if (!validateAdminRequest(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  return clearAdminCookie(res);
}
