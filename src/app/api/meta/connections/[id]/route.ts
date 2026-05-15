import { NextRequest, NextResponse } from "next/server";
import { deleteMetaConnection } from "@/lib/meta-token";
import { auth } from "@/auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;

  // Remove apenas a conexão OAuth do próprio usuário.
  // (deleteMetaConnection já filtra por userId.)
  await deleteMetaConnection(session.user.id, id);

  return NextResponse.json({ ok: true });
}
