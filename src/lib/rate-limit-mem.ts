/**
 * Rate limit em memória — alternativa simples ao redis/upstash pra rotinas
 * onde uma janela em RAM é suficiente. Como rodamos em PM2 com 1 processo
 * (fork mode), o Map vive enquanto o processo viver — em deploy ou crash o
 * limite reinicia, o que é aceitável pra este uso.
 *
 * **Não use** se a app rodar em cluster com múltiplos workers ou em serverless
 * com instâncias separadas — aí precisa de storage compartilhado.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Cleanup periódico pra não vazar memória com chaves antigas. Como o Map
// fica em memória durante a vida do processo, sem isso uma chave usada uma
// única vez nunca seria removida.
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
function ensureCleanup() {
  if (cleanupTimer || typeof window !== "undefined") return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets) {
      if (b.resetAt < now) buckets.delete(key);
    }
  }, 60_000);
  // Em Next dev, o módulo recarrega com HMR — o interval anterior fica órfão.
  // Aceitável: o módulo singleton vai criar um novo a cada reload, mas em
  // produção só roda uma vez.
}

export interface RateLimitResult {
  ok: boolean;
  /** Quantas requests ainda cabem na janela atual. */
  remaining: number;
  /** Quando a janela atual reseta (timestamp ms). */
  resetAt: number;
  /** Em quantos segundos a próxima request será aceita (se já estourou). */
  retryAfter: number;
}

/**
 * Verifica e contabiliza uma request. Limite é por `key` (use IP, userId,
 * userId+rota, etc).
 *
 * @param key      identificador único (ex.: "metrics:userId")
 * @param limit    máximo de requests
 * @param windowMs janela em milissegundos
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  ensureCleanup();
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs, retryAfter: 0 };
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return {
    ok: true,
    remaining: limit - existing.count,
    resetAt: existing.resetAt,
    retryAfter: 0,
  };
}
