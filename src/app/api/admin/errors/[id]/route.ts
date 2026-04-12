import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { db } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_COOKIE)?.value;
    if (!token || !verifyAdminToken(token)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const data: { resolved?: boolean; fixSuggestion?: string } = {};
    if (typeof body.resolved === "boolean") data.resolved = body.resolved;
    if (typeof body.fixSuggestion === "string") data.fixSuggestion = body.fixSuggestion;

    const updated = await db.errorLog.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("Error PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
