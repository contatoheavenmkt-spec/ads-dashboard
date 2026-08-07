import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { env } from "./env";

/**
 * Client próprio do worker, separado do `src/lib/db.ts`.
 *
 * O de lá é um singleton pensado para o ciclo de vida do Next e usa o pool
 * padrão do `pg` (10 conexões). Aqui o pool é explicitamente pequeno porque
 * são dois processos disputando o mesmo Postgres: sem o teto, um restart-loop
 * do worker consumiria as conexões e derrubaria requisição do app.
 */
const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.poolMax,
  idleTimeoutMillis: 30_000,
});

export const db = new PrismaClient({ adapter: new PrismaPg(pool) });

export async function fecharBanco(): Promise<void> {
  await db.$disconnect().catch(() => {});
  await pool.end().catch(() => {});
}
