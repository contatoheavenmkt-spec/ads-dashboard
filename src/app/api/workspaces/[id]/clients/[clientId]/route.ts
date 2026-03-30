import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; clientId: string }> }
) {
  const { clientId } = await params;

  await db.user.update({
    where: { id: clientId },
    data: { workspaceId: null },
  });

  return NextResponse.json({ ok: true });
}
