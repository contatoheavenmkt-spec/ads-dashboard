import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
const db = new PrismaClient({ adapter } as never);

async function main() {
  console.log("🌱 Iniciando seed...");

  // Usuário agência admin
  const hashedPassword = await bcrypt.hash("123456", 10);

  await db.user.upsert({
    where: { email: "agencia@demo.com" },
    update: {},
    create: {
      email: "agencia@demo.com",
      password: hashedPassword,
      name: "Agência Demo",
      role: "AGENCY",
    },
  });

  console.log("✅ Usuário criado: agencia@demo.com / 123456");

  // Cria algumas integrações de exemplo
  const integracoes = [
    { platform: "meta", adAccountId: "act_1001", name: "E-commerce Moda Brasil", bmId: "bm_001", bmName: "Agência Rocket Digital" },
    { platform: "meta", adAccountId: "act_1002", name: "Loja de Eletrônicos Premium", bmId: "bm_001", bmName: "Agência Rocket Digital" },
    { platform: "meta", adAccountId: "act_2001", name: "SaaS Financeiro B2B", bmId: "bm_002", bmName: "Performance Hub Agency" },
    { platform: "meta", adAccountId: "act_3001", name: "Imobiliária Alto Padrão", bmId: "bm_003", bmName: "Growth Masters" },
    { platform: "meta", adAccountId: "act_4001", name: "Clínica Odontológica Sorrir", bmId: "bm_004", bmName: "ConverteAI Marketing" },
  ];

  const createdIntegrations: Array<{ id: string; adAccountId: string }> = [];

  for (const int of integracoes) {
    const existing = await db.integration.findFirst({ where: { adAccountId: int.adAccountId } });
    if (!existing) {
      const created = await db.integration.create({ data: int });
      createdIntegrations.push(created);
    } else {
      createdIntegrations.push(existing);
    }
  }

  console.log(`✅ ${createdIntegrations.length} integrações criadas`);

  // Cria workspaces de exemplo
  const ws1 = await db.workspace.upsert({
    where: { slug: "fashion-brasil" },
    update: {},
    create: {
      name: "Fashion Brasil",
      slug: "fashion-brasil",
      publicAccess: true,
      integrations: {
        create: [
          { integrationId: createdIntegrations[0].id },
          { integrationId: createdIntegrations[1].id },
        ],
      },
    },
  });

  const ws2 = await db.workspace.upsert({
    where: { slug: "saas-financeiro" },
    update: {},
    create: {
      name: "SaaS Financeiro",
      slug: "saas-financeiro",
      publicAccess: true,
      integrations: {
        create: [{ integrationId: createdIntegrations[2].id }],
      },
    },
  });

  const ws3 = await db.workspace.upsert({
    where: { slug: "clinica-sorrir" },
    update: {},
    create: {
      name: "Clínica Sorrir",
      slug: "clinica-sorrir",
      publicAccess: true,
      integrations: {
        create: [{ integrationId: createdIntegrations[4].id }],
      },
    },
  });

  console.log("✅ 3 workspaces criados: fashion-brasil, saas-financeiro, clinica-sorrir");
  console.log("\n🚀 Seed concluído! Acesse:");
  console.log("   → http://localhost:3000/login");
  console.log("   → Email: agencia@demo.com");
  console.log("   → Senha: 123456");
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
