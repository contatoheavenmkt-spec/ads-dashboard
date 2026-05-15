import { db } from "@/lib/db";

export interface CrmAccess {
  allowed: boolean;
  role: "AGENCY" | "CLIENT" | null;
  /** Pode deletar leads e mudar configurações de fluxo. Só AGENCY. */
  canDelete: boolean;
}

/**
 * Resolve permissões do user sobre o CRM de um workspace.
 *
 * - AGENCY = dono do workspace → CRUD completo, inclusive delete.
 * - CLIENT = member do workspace → cria/edita/marca venda, **não pode deletar**.
 * - Outros → negado.
 *
 * Decisão: cliente final é quem opera o CRM no dia a dia (registra leads que
 * chegam, marca vendas). Agência supervisiona métricas e limpa lixo — por
 * isso só agência pode deletar (evita perda acidental de histórico).
 */
export async function resolveCrmAccess(
  workspaceId: string,
  userId: string,
): Promise<CrmAccess> {
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, ownerId: true },
  });
  if (!ws) return { allowed: false, role: null, canDelete: false };

  if (ws.ownerId === userId) {
    return { allowed: true, role: "AGENCY", canDelete: true };
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { workspaceId: true, role: true },
  });
  if (user?.role === "CLIENT" && user.workspaceId === workspaceId) {
    return { allowed: true, role: "CLIENT", canDelete: false };
  }

  return { allowed: false, role: null, canDelete: false };
}

export const LEAD_STATUSES = ["novo", "contato", "negociando", "vendido", "perdido"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export function isValidStatus(s: string): s is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(s);
}
