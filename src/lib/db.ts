import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

/**
 * A ORDEM AQUI IMPORTA — e estava invertida.
 *
 * DATABASE_URL aponta para a porta 6543 do pooler do Supabase (`?pgbouncer=true`),
 * que opera em modo TRANSACTION: a conexão volta ao pool no fim de cada query,
 * então muitos requests concorrentes compartilham poucas conexões reais.
 * É a URL destinada ao tráfego da aplicação.
 *
 * DIRECT_URL aponta para a 5432, modo SESSION, com teto rígido de 15 clientes.
 * Existe para migrations do Prisma (e é o que prisma.config.ts usa, corretamente).
 *
 * Com a ordem antiga (`DIRECT_URL ?? DATABASE_URL`) o app inteiro rodava pela
 * conexão de migration: qualquer pico acima de 15 operações simultâneas de banco
 * derrubava requisições com `(EMAXCONNSESSION) max clients reached in session
 * mode`, e não só a rota culpada — qualquer requisição concorrente, incluindo a
 * dashboard pública de cliente. O teto valia para o sistema todo, não só o admin.
 */
function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? process.env.DIRECT_URL,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
