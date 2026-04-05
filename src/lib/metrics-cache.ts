import { db } from "@/lib/db";

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos

export async function getCachedMetrics(
  workspaceId: string,
  platform: string,
  cacheKey: string
): Promise<any | null> {
  try {
    const entry = await db.metricsCache.findUnique({
      where: { workspaceId_platform_cacheKey: { workspaceId, platform, cacheKey } },
    });
    if (!entry) return null;
    if (new Date() > entry.expiresAt) {
      await db.metricsCache
        .delete({ where: { workspaceId_platform_cacheKey: { workspaceId, platform, cacheKey } } })
        .catch(() => {});
      return null;
    }
    return JSON.parse(entry.data);
  } catch {
    return null;
  }
}

export async function setCachedMetrics(
  workspaceId: string,
  platform: string,
  cacheKey: string,
  data: any
): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
    await db.metricsCache.upsert({
      where: { workspaceId_platform_cacheKey: { workspaceId, platform, cacheKey } },
      update: { data: JSON.stringify(data), expiresAt },
      create: { workspaceId, platform, cacheKey, data: JSON.stringify(data), expiresAt },
    });
  } catch (err: any) {
    console.error("[metrics-cache] set error:", err.message);
  }
}

export async function invalidateCache(workspaceId: string, platform?: string): Promise<void> {
  try {
    await db.metricsCache.deleteMany({
      where: { workspaceId, ...(platform ? { platform } : {}) },
    });
  } catch (err: any) {
    console.error("[metrics-cache] invalidate error:", err.message);
  }
}
