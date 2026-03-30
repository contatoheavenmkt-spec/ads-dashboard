import { NextRequest, NextResponse } from "next/server";
import { deleteMetaConnection } from "@/lib/meta-token";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deleteMetaConnection(id);
  return NextResponse.json({ ok: true });
}
