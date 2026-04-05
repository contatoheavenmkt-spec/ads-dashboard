import "dotenv/config";
import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const db = new PrismaClient({ adapter });

async function main() {
  console.log("🔧 Criando usuário gestor@gmail.com...");

  const hashedPassword = await bcrypt.hash("admin123", 10);

  await db.user.upsert({
    where: { email: "gestor@gmail.com" },
    update: {},
    create: {
      email: "gestor@gmail.com",
      password: hashedPassword,
      name: "Gestor",
      role: "AGENCY",
      onboardingCompleted: true,
    },
  });

  console.log("✅ Usuário gestor@gmail.com criado/atualizado com sucesso!");
  console.log("   Email: gestor@gmail.com");
  console.log("   Senha: admin123");
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
