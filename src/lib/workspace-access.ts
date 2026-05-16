/**
 * workspace-access.ts
 * Helpers para controle de acesso a workspaces:
 *  - hash/verify de sharePassword (bcrypt, com fallback legado para senhas em texto puro)
 *  - emissão/verificação de cookie de unlock assinado (sem expor a senha)
 *  - função canAccessPublicWorkspace centraliza a checagem de publicAccess + sharePassword
 *    usada tanto na página /cliente/[slug] quanto nas rotas de métricas públicas.
 */

import bcrypt from "bcryptjs";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { getAndSyncSubscription, isPlanActive } from "@/lib/subscription";

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

function shareSecret(): string {
  return process.env.AUTH_SECRET ?? "fallback-secret";
}

export function shareCookieName(slug: string): string {
  return `ws_${slug}`;
}

export async function hashSharePassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifySharePassword(plain: string, stored: string): Promise<boolean> {
  if (!stored || !plain) return false;
  if (stored.startsWith("$2")) {
    return bcrypt.compare(plain, stored);
  }
  // Fallback compat com workspaces antigos que ainda têm senha em texto puro.
  // Comparação em tempo constante para evitar timing leak.
  if (stored.length !== plain.length) return false;
  return timingSafeEqual(Buffer.from(stored), Buffer.from(plain));
}

/**
 * Token de unlock: base64url("<slug>:<ts>") + "." + HMAC-SHA256.
 * Não contém a senha — assinado com AUTH_SECRET e o passwordHash do workspace
 * (assim, se a senha for trocada, tokens antigos param de valer).
 */
export function signShareToken(slug: string, passwordHash: string): string {
  const payload = `${slug}:${Date.now()}`;
  const secret = `${shareSecret()}:${passwordHash}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

export function verifyShareToken(slug: string, passwordHash: string, token: string): boolean {
  try {
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx === -1) return false;
    const encoded = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);
    const payload = Buffer.from(encoded, "base64url").toString("utf-8");

    const parts = payload.split(":");
    if (parts.length !== 2 || parts[0] !== slug) return false;
    const ts = parseInt(parts[1], 10);
    if (isNaN(ts) || Date.now() - ts > TOKEN_TTL_MS) return false;

    const secret = `${shareSecret()}:${passwordHash}`;
    const expectedSig = createHmac("sha256", secret).update(payload).digest("hex");
    if (sig.length !== expectedSig.length) return false;
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}

export interface WorkspaceAccessCheck {
  allowed: boolean;
  reason?: "not_found" | "private" | "locked";
  ownerId?: string | null;
}

/**
 * Valida se uma requisição não autenticada pode acessar o workspace público.
 * Regras:
 *  - workspace.publicAccess === true E
 *  - se sharePassword definido, cookie de unlock válido
 */
export async function canAccessPublicWorkspace(
  req: NextRequest,
  workspaceId: string,
): Promise<WorkspaceAccessCheck> {
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, slug: true, publicAccess: true, sharePassword: true, ownerId: true },
  });
  if (!ws) return { allowed: false, reason: "not_found" };
  if (!ws.publicAccess) return { allowed: false, reason: "private", ownerId: ws.ownerId };

  if (ws.sharePassword) {
    const token = req.cookies.get(shareCookieName(ws.slug))?.value ?? null;
    if (!token || !verifyShareToken(ws.slug, ws.sharePassword, token)) {
      return { allowed: false, reason: "locked", ownerId: ws.ownerId };
    }
  }

  return { allowed: true, ownerId: ws.ownerId };
}

/**
 * Verifica se um usuário logado pode acessar o workspace:
 *  - AGENCY: dono do workspace
 *  - CLIENT: workspaceId do usuário == id do workspace
 */
export async function canAccessWorkspaceAuthed(
  workspaceId: string,
  userId: string,
): Promise<WorkspaceAccessCheck> {
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, ownerId: true },
  });
  if (!ws) return { allowed: false, reason: "not_found" };
  if (ws.ownerId === userId) return { allowed: true, ownerId: ws.ownerId };

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { workspaceId: true, role: true },
  });
  if (user?.role === "CLIENT" && user.workspaceId === workspaceId) {
    return { allowed: true, ownerId: ws.ownerId };
  }
  return { allowed: false, reason: "private", ownerId: ws.ownerId };
}

/**
 * Garante que um `adAccountId` pertence a uma Integration vinculada a algum
 * workspace do `ownerUserId` (ou ao `workspaceId` específico, se passado).
 *
 * Defesa contra abuso de query param: as rotas `/api/metrics`,
 * `/api/google/metrics`, `/api/meta/*` aceitam `adAccountId` direto na URL
 * e passavam pro Graph/GAQL sem validar — atacante autenticado podia ver
 * insights de adAccountId de outro tenant usando o próprio token Meta/Google
 * (se houvesse qualquer sobreposição de permissão na conta de origem).
 */
export async function isAdAccountAuthorized(
  adAccountId: string,
  ownerUserId: string,
  workspaceId?: string | null,
): Promise<boolean> {
  if (workspaceId) {
    const found = await db.workspaceIntegration.findFirst({
      where: {
        workspaceId,
        workspace: { ownerId: ownerUserId },
        integration: { adAccountId },
      },
      select: { id: true },
    });
    return !!found;
  }
  // Sem workspaceId: aceita se o adAccount existe em qualquer workspace do owner.
  const found = await db.integration.findFirst({
    where: {
      adAccountId,
      workspaceIntegrations: {
        some: { workspace: { ownerId: ownerUserId } },
      },
    },
    select: { id: true },
  });
  return !!found;
}

export interface MetricsAccessResult {
  ok: boolean;
  status?: number;
  error?: string;
  resolvedUserId?: string | null;
  workspaceId?: string | null;
}

/**
 * Centraliza a checagem de acesso para rotas de métricas:
 *  - Se vier workspaceId: precisa de sessão OWNER/CLIENT do workspace OU publicAccess + sharePassword OK.
 *  - Sem workspaceId: exige sessão válida e usa o userId da sessão.
 *  - Em ambos os casos valida que o plano do dono dos dados ainda está ativo
 *    (trial expirado / canceled → 402).
 */
export async function requireMetricsAccess(
  req: NextRequest,
  workspaceIdParam: string | null,
): Promise<MetricsAccessResult> {
  const session = await auth();
  let resolvedUserId: string | null = null;
  const workspaceId: string | null = workspaceIdParam ?? null;

  if (workspaceIdParam) {
    // Tenta acesso autenticado primeiro
    let allowed = false;
    if (session?.user?.id) {
      const r = await canAccessWorkspaceAuthed(workspaceIdParam, session.user.id);
      if (r.allowed) {
        allowed = true;
        resolvedUserId = r.ownerId ?? session.user.id;
      }
    }
    // Senão, tenta acesso público
    if (!allowed) {
      const r = await canAccessPublicWorkspace(req, workspaceIdParam);
      if (r.allowed) {
        allowed = true;
        resolvedUserId = r.ownerId ?? null;
      } else if (r.reason === "not_found") {
        return { ok: false, status: 404, error: "Workspace não encontrado" };
      } else if (r.reason === "locked") {
        return { ok: false, status: 401, error: "Acesso restrito" };
      }
    }
    if (!allowed) {
      return { ok: false, status: 403, error: "Acesso negado" };
    }
  } else {
    // Sem workspaceId: precisa sessão válida.
    if (!session?.user?.id) {
      return { ok: false, status: 401, error: "Não autenticado" };
    }
    resolvedUserId = session.user.id;
  }

  // Valida plano ativo do dono dos dados
  if (resolvedUserId) {
    const sub = await getAndSyncSubscription(resolvedUserId);
    if (sub && !isPlanActive(sub)) {
      return { ok: false, status: 402, error: "Plano expirado" };
    }
  }

  return { ok: true, resolvedUserId, workspaceId };
}