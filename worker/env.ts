import "dotenv/config";

/**
 * Env do worker, validada na subida. Falha rápido e com mensagem clara:
 * worker que sobe pela metade fica "online" no PM2 sem estar conectado a
 * nada, e ninguém percebe até o cliente reclamar que não chegou lead.
 */

function obrigatorio(nome: string): string {
  const v = process.env[nome];
  if (!v) {
    console.error(`[worker] falta a variável ${nome} no .env. Sem ela o worker não sobe.`);
    process.exit(1);
  }
  return v;
}

function inteiro(nome: string, padrao: number): number {
  const bruto = process.env[nome];
  if (!bruto) return padrao;
  const n = Number.parseInt(bruto, 10);
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

export const env = {
  /**
   * Pooler da Supabase (6543, modo transaction). NÃO usar DIRECT_URL aqui: a
   * 5432 é modo session, teto rígido de 15 conexões, e existe para migration.
   * O worker competindo por ela derrubaria requisição do app.
   */
  databaseUrl: obrigatorio("DATABASE_URL"),

  /** Segredo do canal de controle painel → worker. */
  workerSecret: obrigatorio("WORKER_SECRET"),

  /** Só escuta em loopback: o control plane nunca vai para a internet. */
  controlHost: "127.0.0.1",
  controlPort: inteiro("WORKER_PORT", 3101),

  /** Onde ficam as credenciais das sessões do WhatsApp. */
  authDir: process.env.WORKER_AUTH_DIR ?? "worker/.wa-auth",

  /** Teto de sessões simultâneas neste processo. */
  maxInstances: inteiro("TRACK_MAX_INSTANCES", 20),

  /** Frequência com que o worker converge estado real para o desejado. */
  reconcileIntervalMs: inteiro("WORKER_RECONCILE_MS", 20_000),

  /** Heartbeat: o cron de saúde usa isso para saber se o worker está vivo. */
  heartbeatIntervalMs: inteiro("WORKER_HEARTBEAT_MS", 30_000),

  /** Pool pequeno de propósito: dois processos dividem o mesmo Postgres. */
  poolMax: inteiro("WORKER_POOL_MAX", 4),

  nodeEnv: process.env.NODE_ENV ?? "development",
} as const;
