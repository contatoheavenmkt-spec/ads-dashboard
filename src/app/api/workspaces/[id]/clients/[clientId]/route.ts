import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; clientId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "AGENCY") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id, clientId } = await params;

  // Verifica ownership: a agência só pode desvincular clientes do PRÓPRIO workspace.
  const workspace = await db.workspace.findUnique({
    where: { id },
    select: { ownerId: true },
  });
  if (!workspace || workspace.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  // Desvincula apenas se o user atualmente pertence a este workspace E tem role CLIENT.
  // Evita rebaixar AGENCYs ou remover usuários de outros workspaces.
  await db.user.updateMany({
    where: { id: clientId, workspaceId: id, role: "CLIENT" },
    data: { workspaceId: null },
  });

  return NextResponse.json({ ok: true });
}
