import { db } from "@/lib/db";

/**
 * Autorização das rotas do Track.
 *
 * Segue o mesmo desenho do resto do painel da agência: o escopo é sempre a
 * lista de workspaces que a pessoa possui, resolvida no servidor. Nenhum
 * workspaceId vindo do cliente é aceito sem estar nessa lista, o que é a
 * defesa contra uma agência ler conversa de cliente de outra.
 */

export interface WorkspaceRef {
  id: string;
  name: string;
  slug: string;
}

/** Workspaces do dono, já sem os removidos por soft delete. */
export async function workspacesDaAgencia(userId: string): Promise<WorkspaceRef[]> {
  return db.workspace.findMany({
    where: { ownerId: userId, deletedAt: null },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Confirma que o workspace pedido pertence mesmo a esta agência.
 * Devolve null quando não pertence, e a rota responde 403.
 */
export async function workspaceDaAgencia(
  workspaceId: string,
  userId: string,
): Promise<WorkspaceRef | null> {
  const ws = await db.workspace.findFirst({
    where: { id: workspaceId, ownerId: userId, deletedAt: null },
    select: { id: true, name: true, slug: true },
  });
  return ws;
}

/**
 * Instância de WhatsApp que pertence a esta agência.
 * A checagem vai pelo caminho workspace.ownerId, nunca confiando no id da URL.
 */
export async function instanciaDaAgencia(
  instanceId: string,
  userId: string,
): Promise<{ id: string; workspaceId: string } | null> {
  const inst = await db.whatsappInstance.findFirst({
    where: { id: instanceId, workspace: { ownerId: userId, deletedAt: null } },
    select: { id: true, workspaceId: true },
  });
  return inst;
}
