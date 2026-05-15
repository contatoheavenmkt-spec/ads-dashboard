/**
 * rate-limit.ts
 * Rate limit simples in-memory por chave. Em produção com múltiplas instâncias,
 * substituir por Redis/Upstash — por ora vale para mitigar brute force / floods
 * em endpoints sensíveis (login admin, webhooks, tracking).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, resetMs: windowMs };
  }

  if (bucket.count >= max) {
    return { allowed: false, remaining: 0, resetMs: bucket.resetAt - now };
  }

  bucket.count++;
  return { allowed: true, remaining: max - bucket.count, resetMs: bucket.resetAt - now };
}

// GC ocasional para não vazar memória — roda no acesso a cada ~1000 keys
let gcCounter = 0;
export function gcRateLimit() {
  if (++gcCounter < 1000) return;
  gcCounter = 0;
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
