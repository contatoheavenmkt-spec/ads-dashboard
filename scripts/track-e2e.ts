/**
 * Ensaio do ciclo completo do Track, sem WhatsApp e sem Google.
 *
 * Simula: clique no anúncio (com gclid) → mensagem com o código → conversa
 * casada → atendente responde → etiqueta "Pago" → evento de venda → conversão
 * na fila de envio.
 *
 * Usa dados reais no banco e apaga tudo no fim. Vale rodar antes de qualquer
 * deploy do Track: é a única forma de provar o caminho inteiro sem depender
 * de um celular na mão.
 *
 *   npx tsx scripts/track-e2e.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { generateCode, renderMessage } from "../src/lib/track/code";
import { extractCode } from "../src/lib/track/code";
import { registrarStage } from "../src/lib/track/events";
import { avaliarConversa } from "../src/lib/track/rules";
import { parseTrackSettings, serializeTrackSettings } from "../src/lib/track/settings";
import { processarEtiqueta } from "../worker/pipeline/etiqueta";
import { fecharBanco } from "../worker/prisma";

const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? process.env.DIRECT_URL });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

const MARCA = "e2e-track-teste";
let falhas = 0;

function checa(nome: string, cond: boolean, detalhe = "") {
  if (cond) {
    console.log(`  ok  ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHOU  ${nome} ${detalhe}`);
  }
}

async function main() {
  const ws = await db.workspace.findFirst({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (!ws) throw new Error("nenhum workspace para testar");
  console.log(`workspace de teste: ${ws.name}\n`);

  // ─── preparo ────────────────────────────────────────────────────
  const ETIQUETA_PAGO = "999";

  await db.trackSettings.upsert({
    where: { workspaceId: ws.id },
    update: serializeTrackSettings({
      saleLabelIds: [ETIQUETA_PAGO],
      salePhrases: [{ text: "parabéns pela sua compra", direction: "out" }],
      respondedMinInbound: 2,
      respondedRequiresOutbound: true,
      defaultSaleValue: 500,
      uploadLagHours: 0, // no teste, não queremos esperar 3h
      createLeadInCrm: false, // o CRM é testado à parte
    }),
    create: {
      workspaceId: ws.id,
      ...serializeTrackSettings({
        saleLabelIds: [ETIQUETA_PAGO],
        salePhrases: [{ text: "parabéns pela sua compra", direction: "out" }],
        defaultSaleValue: 500,
        uploadLagHours: 0,
        createLeadInCrm: false,
      }),
    },
  });

  const alvo = await db.trackConversionTarget.upsert({
    where: { workspaceId_stage_platform: { workspaceId: ws.id, stage: "venda", platform: "google" } },
    update: { enabled: true, conversionActionId: "111", customerId: "222" },
    create: {
      workspaceId: ws.id, stage: "venda", platform: "google", enabled: true,
      conversionActionId: "111", customerId: "222", conversionActionName: MARCA,
    },
  });

  const instancia = await db.whatsappInstance.create({
    data: { workspaceId: ws.id, label: MARCA, state: "open", desiredState: "off" },
  });

  const link = await db.trackLink.create({
    data: {
      workspaceId: ws.id, slug: `e2e${Date.now().toString(36).slice(-4)}`,
      name: MARCA, destinationPhone: "5511999999999",
      messageTemplate: "Olá! Vim pelo anúncio. Código {code}",
    },
  });

  // ─── 1. clique no anúncio ───────────────────────────────────────
  console.log("1. clique no anúncio");
  const codigo = generateCode();
  const clique = await db.trackClick.create({
    data: {
      workspaceId: ws.id, linkId: link.id, code: codigo,
      gclid: "TESTE_GCLID_E2E", campaignId: "555", utmSource: "google", utmMedium: "cpc",
    },
  });
  const mensagemPronta = renderMessage(link.messageTemplate, codigo);
  checa("mensagem carrega o código", extractCode(mensagemPronta) === codigo, `(${mensagemPronta})`);

  // ─── 2. primeira mensagem: casa a conversa com o clique ─────────
  console.log("\n2. lead manda a mensagem");
  const codigoLido = extractCode(mensagemPronta)!;
  const achado = await db.trackClick.findUnique({
    where: { workspaceId_code: { workspaceId: ws.id, code: codigoLido } },
  });
  checa("código encontra o clique", achado?.id === clique.id);

  const conversa = await db.trackConversation.create({
    data: {
      workspaceId: ws.id, instanceId: instancia.id, contactKey: "5511988887777",
      cycle: 1, contactName: "Lead de Teste",
      clickId: achado!.id, matchType: "code", matchConfidence: "high", source: "google",
      gclid: achado!.gclid, campaignId: achado!.campaignId,
      stage: "lead", firstMessageAt: new Date(), lastMessageAt: new Date(), inboundCount: 1,
    },
  });
  await db.trackClick.update({ where: { id: clique.id }, data: { matchedAt: new Date() } });
  checa("conversa nasce com o gclid do clique", conversa.gclid === "TESTE_GCLID_E2E");

  const cfg = parseTrackSettings(await db.trackSettings.findUnique({ where: { workspaceId: ws.id } }));

  // ─── 3. troca de mensagens vira "respondeu" ─────────────────────
  console.log("\n3. atendente responde e o lead volta");
  const t0 = Date.now();
  await db.trackMessage.createMany({
    data: [
      { conversationId: conversa.id, waMessageId: "m1", direction: "in", type: "text", text: mensagemPronta, sentAt: new Date(t0) },
      { conversationId: conversa.id, waMessageId: "m2", direction: "out", type: "text", text: "Oi! Como posso ajudar?", sentAt: new Date(t0 + 1000) },
      { conversationId: conversa.id, waMessageId: "m3", direction: "in", type: "text", text: "quero saber o preço", sentAt: new Date(t0 + 2000) },
    ],
  });
  await db.trackConversation.update({
    where: { id: conversa.id },
    data: { inboundCount: 2, outboundCount: 1 },
  });

  const detRespondeu = avaliarConversa(cfg, {
    stage: "lead", inboundCount: 2, outboundCount: 1, trocasCompletas: 1, labelIds: [],
    houveOutboundAntesDoUltimoInbound: true,
  });
  checa("duas entradas com resposta no meio = respondeu", detRespondeu?.stage === "respondeu");

  // Sem resposta do atendente no meio, não conta como engajamento.
  const semTroca = avaliarConversa(cfg, {
    stage: "lead", inboundCount: 3, outboundCount: 0, trocasCompletas: 0, labelIds: [],
    houveOutboundAntesDoUltimoInbound: false,
  });
  checa("lead falando sozinho NÃO é respondeu", semTroca === null);

  await registrarStage({
    db, workspaceId: ws.id, conversationId: conversa.id,
    stage: "respondeu", origem: "messages", cfg,
  });

  // ─── 4. a etiqueta "Pago" ───────────────────────────────────────
  //
  // Passa pelo handler DE VERDADE, com o payload no formato que o Baileys
  // emite. A versão anterior deste ensaio escrevia labelsJson direto no banco
  // e por isso ficava verde enquanto o caminho real estava quebrado: em conta
  // Business o chatId chega como @lid e a busca não achava a conversa.
  console.log("\n4. atendente coloca a etiqueta Pago (pelo handler real)");

  // A conversa foi gravada com o telefone real e o lid guardado à parte,
  // exatamente como o handler de mensagem faz numa conta Business.
  const LID_DO_CONTATO = "185432109876543@lid";
  await db.trackConversation.update({
    where: { id: conversa.id },
    data: { lidKey: LID_DO_CONTATO },
  });

  await processarEtiqueta({
    instanceId: instancia.id,
    workspaceId: ws.id,
    evento: "association",
    payload: {
      // O `type` de fora é add/remove; o de dentro é o tipo da associação.
      type: "add",
      association: { type: "label_jid", chatId: LID_DO_CONTATO, labelId: ETIQUETA_PAGO },
    },
  });

  const depoisDaEtiqueta = await db.trackConversation.findUnique({
    where: { id: conversa.id },
    select: { labelsJson: true, stage: true },
  });
  checa(
    "o handler achou a conversa pelo @lid",
    JSON.parse(depoisDaEtiqueta?.labelsJson ?? "[]").includes(ETIQUETA_PAGO),
    `(labelsJson: ${depoisDaEtiqueta?.labelsJson})`,
  );
  checa(
    "e a etiqueta virou venda sozinha",
    depoisDaEtiqueta?.stage === "venda",
    `(stage: ${depoisDaEtiqueta?.stage})`,
  );

  const detVenda = avaliarConversa(cfg, {
    stage: "respondeu", inboundCount: 2, outboundCount: 1, trocasCompletas: 1,
    labelIds: [ETIQUETA_PAGO], houveOutboundAntesDoUltimoInbound: true,
  });
  checa("etiqueta Pago vira venda", detVenda?.stage === "venda" && detVenda.origem === "label");

  // O handler ja registrou tudo. Repetir aqui prova a idempotencia e devolve
  // o estado para conferencia.
  const res = await registrarStage({
    db, workspaceId: ws.id, conversationId: conversa.id,
    stage: "venda", origem: "label", cfg, valor: 500,
  });
  checa("repetir nao cria evento novo", res.criados.length === 0, `(criados: ${res.criados.join(", ")})`);

  // ─── 5. o funil fecha a conta ───────────────────────────────────
  console.log("\n5. conferindo o funil e a fila");
  const eventos = await db.trackEvent.findMany({
    where: { conversationId: conversa.id }, orderBy: { createdAt: "asc" },
    select: { stage: true, value: true, source: true },
  });
  const stages = eventos.map((e) => e.stage).sort();
  checa("os 4 estágios existem", JSON.stringify(stages) === JSON.stringify(["lead", "qualificado", "respondeu", "venda"]), `(${stages.join(", ")})`);
  checa("só a venda tem valor", eventos.filter((e) => e.value !== null).length === 1);

  const fila = await db.trackDispatch.findMany({
    where: { workspaceId: ws.id, targetId: alvo.id },
    select: { status: true, platform: true, attempts: true, event: { select: { stage: true } } },
  });
  checa("fila tem exatamente 1 envio", fila.length === 1, `(${fila.length})`);
  checa("é do estágio venda, pro google, pendente", fila[0]?.event.stage === "venda" && fila[0]?.platform === "google" && fila[0]?.status === "pending");

  // ─── 6. idempotência: repetir não duplica ───────────────────────
  console.log("\n6. repetindo tudo (o atendente tirou e pôs a etiqueta de novo)");
  const rep = await registrarStage({
    db, workspaceId: ws.id, conversationId: conversa.id,
    stage: "venda", origem: "label", cfg, valor: 500,
  });
  checa("nenhum evento novo", rep.criados.length === 0);
  const filaDepois = await db.trackDispatch.count({ where: { workspaceId: ws.id, targetId: alvo.id } });
  checa("a fila continua com 1 envio", filaDepois === 1, `(${filaDepois})`);
  const eventosDepois = await db.trackEvent.count({ where: { conversationId: conversa.id } });
  checa("continuam 4 eventos", eventosDepois === 4, `(${eventosDepois})`);

  // ─── 7. baixa confiança não sobe sozinha ────────────────────────
  console.log("\n7. conversa atribuída por proximidade");
  const duvidosa = await db.trackConversation.create({
    data: {
      workspaceId: ws.id, instanceId: instancia.id, contactKey: "5511977776666",
      cycle: 1, clickId: clique.id, matchType: "proximity", matchConfidence: "low",
      source: "google", gclid: "TESTE_GCLID_E2E", stage: "respondeu",
      firstMessageAt: new Date(), lastMessageAt: new Date(),
      labelsJson: JSON.stringify([ETIQUETA_PAGO]),
    },
  });
  const resDuvidosa = await registrarStage({
    db, workspaceId: ws.id, conversationId: duvidosa.id,
    stage: "venda", origem: "label", cfg, valor: 500,
  });
  checa("a venda é registrada no painel", resDuvidosa.criados.includes("venda"));
  checa("mas NÃO sobe pro Google sozinha", resDuvidosa.despachos === 0, `(${resDuvidosa.despachos})`);
  checa("e o motivo fica explícito", Boolean(resDuvidosa.motivoSemDespacho?.includes("confiança")), `(${resDuvidosa.motivoSemDespacho})`);

  // ─── limpeza ────────────────────────────────────────────────────
  console.log("\nlimpando...");
  await db.trackDispatch.deleteMany({ where: { workspaceId: ws.id } });
  await db.trackEvent.deleteMany({ where: { workspaceId: ws.id } });
  await db.trackMessage.deleteMany({ where: { conversationId: { in: [conversa.id, duvidosa.id] } } });
  await db.trackConversation.deleteMany({ where: { instanceId: instancia.id } });
  await db.trackClick.deleteMany({ where: { linkId: link.id } });
  await db.trackLink.delete({ where: { id: link.id } });
  await db.whatsappInstance.delete({ where: { id: instancia.id } });
  await db.trackConversionTarget.delete({ where: { id: alvo.id } });
  await db.trackSettings.deleteMany({ where: { workspaceId: ws.id } });

  const sobrou =
    (await db.trackClick.count()) + (await db.trackConversation.count()) +
    (await db.trackEvent.count()) + (await db.trackDispatch.count());
  checa("banco limpo no fim", sobrou === 0, `(sobraram ${sobrou} registros)`);
}

main()
  .then(() => {
    if (falhas > 0) {
      console.error(`\n${falhas} FALHA(S)`);
      process.exitCode = 1;
    } else {
      console.log("\nCICLO COMPLETO OK: clique -> conversa -> etiqueta -> venda -> fila de conversão");
    }
  })
  .catch((e) => {
    console.error("ERRO:", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await fecharBanco();
    await db.$disconnect();
    await pool.end();
  });
