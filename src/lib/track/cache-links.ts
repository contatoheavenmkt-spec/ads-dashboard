/**
 * Cache do link de rastreio, compartilhado entre o redirecionador e as rotas
 * que editam link.
 *
 * Fica num módulo próprio para que a edição possa invalidar a entrada. Sem
 * isso, desativar um link ou trocar o número de destino só valia até 60
 * segundos depois, e nesse intervalo conversa de lead (dado pessoal) seguiria
 * indo para o WhatsApp antigo.
 *
 * LIMITE: o cache é por processo. Hoje a Dashfys roda numa instância PM2 em
 * modo fork, então invalidar aqui basta. Se um dia virar cluster, isto precisa
 * virar cache compartilhado ou o TTL precisa cair.
 */

export type LinkCacheado = {
  id: string;
  workspaceId: string;
  destinationPhone: string;
  messageTemplate: string;
  active: boolean;
  fallbackUrl: string | null;
  workspace: { deletedAt: Date | null } | null;
} | null;

const cache = new Map<string, { value: LinkCacheado; expiresAt: number }>();
const TTL_MS = 60_000;
const MAX = 500;

export function lerCache(slug: string): LinkCacheado | undefined {
  const hit = cache.get(slug);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    cache.delete(slug);
    return undefined;
  }
  return hit.value;
}

export function gravarCache(slug: string, value: LinkCacheado): void {
  // Cap simples: evita crescer sem limite num processo de dias.
  if (cache.size >= MAX) {
    const maisAntigo = cache.keys().next().value;
    if (maisAntigo) cache.delete(maisAntigo);
  }
  cache.set(slug, { value, expiresAt: Date.now() + TTL_MS });
}

/** Chamado ao editar, desativar ou apagar um link. */
export function invalidarCache(slug: string): void {
  cache.delete(slug);
}
