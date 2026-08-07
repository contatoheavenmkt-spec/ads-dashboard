import { env } from "./env";
import { criarLog } from "./log";
import { fecharBanco, db } from "./prisma";
import { encerrarTudo, registrarHandlers } from "./wa/manager";
import { iniciarHeartbeat, iniciarLoopReconciliacao } from "./control/reconcile";
import { iniciarServidorDeControle } from "./control/server";
import { processarMensagens } from "./pipeline/mensagem";
import { processarEtiqueta } from "./pipeline/etiqueta";

const log = criarLog("worker");

/**
 * Worker do Dashfys Track.
 *
 * Mantém sessões de WhatsApp abertas, observa mensagens e etiquetas, e grava
 * os fatos no Postgres. Não decide nada de negócio: quem aplica as regras de
 * funil e envia conversão para o Google é o cron do Next. O contrato entre os
 * dois processos são as tabelas, então nenhum derruba o outro.
 *
 * Sobe com: npm run worker
 */

async function principal(): Promise<void> {
  log.info(`iniciando (${env.nodeEnv}), teto de ${env.maxInstances} sessões`);

  // Falha cedo se o banco não responde: worker "online" no PM2 sem banco é
  // pior que worker caído, porque ninguém percebe.
  try {
    const total = await db.whatsappInstance.count();
    log.info(`banco ok, ${total} instância(s) cadastrada(s)`);
  } catch (err) {
    log.erro(`banco inacessível: ${(err as Error).message}`);
    process.exit(1);
  }

  registrarHandlers({
    mensagem: processarMensagens,
    etiqueta: processarEtiqueta,
  });

  const servidor = iniciarServidorDeControle();
  const loopReconciliacao = iniciarLoopReconciliacao();
  const loopHeartbeat = iniciarHeartbeat();

  let encerrando = false;
  const encerrar = async (sinal: string) => {
    if (encerrando) return;
    encerrando = true;
    log.info(`recebi ${sinal}, encerrando`);

    clearInterval(loopReconciliacao);
    clearInterval(loopHeartbeat);
    servidor.close();

    // Fecha os sockets sem apagar credencial: no próximo boot as sessões
    // voltam sozinhas, sem pedir QR.
    await encerrarTudo();
    await fecharBanco();

    log.info("encerrado");
    process.exit(0);
  };

  process.on("SIGTERM", () => void encerrar("SIGTERM"));
  process.on("SIGINT", () => void encerrar("SIGINT"));

  // Erro não tratado não pode derrubar o worker calado: o PM2 reinicia, mas
  // sem o log ninguém descobre a causa.
  process.on("unhandledRejection", (motivo) => {
    log.erro(`promessa rejeitada sem tratamento: ${String(motivo)}`);
  });
  process.on("uncaughtException", (err) => {
    log.erro(`exceção não capturada: ${err.message}`, err.stack);
  });

  log.info("no ar");
}

void principal().catch(async (err) => {
  log.erro(`falha fatal na subida: ${(err as Error).message}`);
  await fecharBanco();
  process.exit(1);
});
