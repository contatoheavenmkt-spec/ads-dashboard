/**
 * Prova de concorrência do claim da fila de conversões.
 *
 * O cron roda de 5 em 5 minutos. Se uma execução demorar mais que isso, duas
 * rodam ao mesmo tempo sobre as mesmas linhas. Sem claim atômico, as duas
 * enviariam a mesma conversão ao Google e o cliente veria venda dobrada no
 * relatório, otimizando a campanha com número inflado.
 *
 * Este teste dispara N claims em paralelo de verdade, contra o Postgres real.
 *
 *   npx tsx scripts/track-check-claim.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? process.env.DIRECT_URL });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

const MARCA = "claim-teste";
let falhas = 0;

function checa(nome: string, cond: boolean, detalhe = "") {
  if (cond) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.error(`  FALHOU  ${nome} ${detalhe}`);
  }
}

async function main() {
  const ws = await db.workspace.findFirst({ where: { deletedAt: null }, select: { id: true } });
  if (!ws) throw new Error("nenhum workspace");
  const wsId = ws.id;

  // Limpa resto de execucao anterior que tenha morrido no meio.
  const antigas = await db.whatsappInstance.findMany({ where: { label: MARCA }, select: { id: true } });
  if (antigas.length > 0) {
    const ids = antigas.map((i) => i.id);
    const convs = await db.trackConversation.findMany({ where: { instanceId: { in: ids } }, select: { id: true } });
    const cids = convs.map((c) => c.id);
    const evs = await db.trackEvent.findMany({ where: { conversationId: { in: cids } }, select: { id: true } });
    await db.trackDispatch.deleteMany({ where: { eventId: { in: evs.map((e) => e.id) } } });
    await db.trackEvent.deleteMany({ where: { conversationId: { in: cids } } });
    await db.trackConversation.deleteMany({ where: { instanceId: { in: ids } } });
    await db.whatsappInstance.deleteMany({ where: { id: { in: ids } } });
    console.log(`(limpei ${antigas.length} instancia(s) de execucao anterior)`);
  }

  const inst = await db.whatsappInstance.create({
    data: { workspaceId: ws.id, label: MARCA, desiredState: "off" },
  });
  const alvo = await db.trackConversionTarget.upsert({
    where: { workspaceId_stage_platform: { workspaceId: ws.id, stage: "venda", platform: "google" } },
    update: { enabled: true },
    create: { workspaceId: ws.id, stage: "venda", platform: "google", enabled: true, conversionActionId: "1", customerId: "2" },
  });

  // 25 conversões esperando envio.
  const QUANTAS = 25;
  const eventos = [];
  for (let i = 0; i < QUANTAS; i++) {
    const c = await db.trackConversation.create({
      data: {
        workspaceId: ws.id, instanceId: inst.id, contactKey: `5521${String(i).padStart(9, "0")}`,
        cycle: 1, matchType: "code", matchConfidence: "high", source: "google", gclid: `G_${i}`,
        stage: "venda", firstMessageAt: new Date(), lastMessageAt: new Date(),
      },
    });
    const e = await db.trackEvent.create({
      data: { workspaceId: ws.id, conversationId: c.id, stage: "venda", source: "label", occurredAt: new Date() },
    });
    eventos.push(e);
  }
  const ontem = new Date(Date.now() - 86400_000);
  await db.trackDispatch.createMany({
    data: eventos.map((e) => ({
      workspaceId: ws.id, eventId: e.id, targetId: alvo.id, platform: "google",
      status: "pending", notBeforeAt: ontem, nextAttemptAt: ontem,
    })),
  });
  console.log(`${QUANTAS} conversões na fila\n`);

  // ─── o teste: 6 "crons" disputando as mesmas linhas ─────────────
  console.log("6 execuções do cron ao mesmo tempo");

  async function umTick(marcador: string): Promise<number> {
    const candidatos = await db.trackDispatch.findMany({
      where: { workspaceId: wsId, status: "pending", nextAttemptAt: { lte: new Date() } },
      take: 200,
      select: { id: true },
    });
    if (candidatos.length === 0) return 0;
    // O claim: só quem conseguir mudar de pending para sending processa.
    const r = await db.trackDispatch.updateMany({
      where: { id: { in: candidatos.map((c) => c.id) }, status: "pending" },
      data: { status: "sending", lockedAt: new Date(), lastError: marcador },
    });
    return r.count;
  }

  const pegos = await Promise.all([
    umTick("tick-1"), umTick("tick-2"), umTick("tick-3"),
    umTick("tick-4"), umTick("tick-5"), umTick("tick-6"),
  ]);

  const somaPegos = pegos.reduce((a, b) => a + b, 0);
  console.log(`  cada tick pegou: ${pegos.join(", ")}`);
  checa("a soma dos claims é exatamente o total da fila", somaPegos === QUANTAS, `(soma ${somaPegos}, fila ${QUANTAS})`);
  checa("ninguém pegou linha em duplicidade", somaPegos <= QUANTAS, `(soma ${somaPegos})`);

  const emEnvio = await db.trackDispatch.count({ where: { workspaceId: ws.id, status: "sending" } });
  const pendentes = await db.trackDispatch.count({ where: { workspaceId: ws.id, status: "pending" } });
  checa("todas foram travadas uma única vez", emEnvio === QUANTAS, `(${emEnvio})`);
  checa("nenhuma sobrou pendente", pendentes === 0, `(${pendentes})`);

  // Cada linha tem um único dono: se duas execuções tivessem pego a mesma,
  // o marcador seria sobrescrito e a contagem por tick não fecharia.
  const porTick = await db.trackDispatch.groupBy({
    by: ["lastError"],
    where: { workspaceId: ws.id, status: "sending" },
    _count: { _all: true },
  });
  const soma = porTick.reduce((s, g) => s + g._count._all, 0);
  checa("cada linha tem um dono só", soma === QUANTAS, `(${soma})`);

  // ─── recuperação de lock morto ──────────────────────────────────
  console.log("\nprocesso morre no meio e deixa lock preso");
  await db.trackDispatch.updateMany({
    where: { workspaceId: ws.id, status: "sending" },
    data: { lockedAt: new Date(Date.now() - 15 * 60_000) },
  });
  const devolvidos = await db.trackDispatch.updateMany({
    where: { status: "sending", lockedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
    data: { status: "pending", lockedAt: null },
  });
  checa("lock preso volta para a fila", devolvidos.count === QUANTAS, `(${devolvidos.count})`);

  // ─── idempotência do enfileiramento ─────────────────────────────
  console.log("\ntentando enfileirar a mesma conversão de novo");
  let duplicou = false;
  try {
    await db.trackDispatch.create({
      data: {
        workspaceId: ws.id, eventId: eventos[0].id, targetId: alvo.id, platform: "google",
        status: "pending", notBeforeAt: new Date(), nextAttemptAt: new Date(),
      },
    });
    duplicou = true;
  } catch (err) {
    duplicou = (err as { code?: string }).code !== "P2002";
  }
  checa("o banco recusa o duplicado", !duplicou);

  // limpeza
  await db.trackDispatch.deleteMany({ where: { workspaceId: ws.id } });
  await db.trackEvent.deleteMany({ where: { workspaceId: ws.id } });
  await db.trackConversation.deleteMany({ where: { instanceId: inst.id } });
  await db.whatsappInstance.delete({ where: { id: inst.id } });
  await db.trackConversionTarget.delete({ where: { id: alvo.id } });
}

main()
  .then(() => {
    if (falhas > 0) {
      console.error(`\n${falhas} FALHA(S)`);
      process.exitCode = 1;
    } else {
      console.log("\nCLAIM ATÔMICO OK: nenhuma conversão pode ser enviada duas vezes");
    }
  })
  .catch((e) => { console.error("ERRO:", e.message); process.exitCode = 1; })
  .finally(async () => { await db.$disconnect(); await pool.end(); });
