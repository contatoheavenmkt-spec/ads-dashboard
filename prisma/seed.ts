import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
const db = new PrismaClient({ adapter } as never);

async function main() {
  console.log("🌱 Iniciando seed...");

  // Hash das senhas
  const demoPassword = await bcrypt.hash("123456", 10);
  const gestorPassword = await bcrypt.hash("admin123", 10);

  // Usuário 1: agencia@demo.com (SEM dados de exemplo - começa zerado)
  await db.user.upsert({
    where: { email: "agencia@demo.com" },
    update: {},
    create: {
      email: "agencia@demo.com",
      password: demoPassword,
      name: "Agência Demo",
      role: "AGENCY",
      onboardingCompleted: false,
    },
  });

  // Usuário 2: gestor@gmail.com (TOTAL ZERADO - sem nada)
  await db.user.upsert({
    where: { email: "gestor@gmail.com" },
    update: {},
    create: {
      email: "gestor@gmail.com",
      password: gestorPassword,
      name: "Gestor",
      role: "AGENCY",
      onboardingCompleted: false,
    },
  });

  console.log("✅ Usuários criados:");
  console.log("   → agencia@demo.com / 123456 (ZERADO - comece do zero)");
  console.log("   → gestor@gmail.com / admin123 (ZERADO)");

  console.log("\n🚀 Seed concluído!");
  console.log("\n📌 Nenhum dado de exemplo foi criado.");
  console.log("💡 Conecte suas contas reais em /integracoes para começar!");
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
