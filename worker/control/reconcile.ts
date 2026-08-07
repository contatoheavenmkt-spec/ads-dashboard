import { env } from "../env";
import { criarLog } from "../log";
import { db } from "../prisma";
import { conectar, estadoDe, idsAtivos, pausar } from "../wa/manager";

const log = criarLog("reconcile");

/**
 * Converge o estado real das sessões para o estado desejado no banco.
 *
 * A fonte da verdade é a coluna `desiredState`: o painel só faz UPDATE, e é
 * este loop que age. O HTTP de controle existe só para encurtar a espera.
 *
 * Isso cobre sozinho os casos que um comando direto não cobre: worker
 * reiniciado, comando perdido, VPS que voltou de reboot, ou alguém que mexeu
 * no banco por fora.
 */

let rodando = false;

export async function reconciliar(): Promise<void> {
  // Uma passada por vez: com o banco lento, dois loops sobrepostos tentariam
  // subir a mesma sessão duas vezes.
  if (rodando) return;
  rodando = true;

  try {
    const desejadas = await db.whatsappInstance.findMany({
      where: { workspace: { deletedAt: null } },
      select: { id: true, workspaceId: true, desiredState: true, state: true },
      take: 500,
    });

    const conhecidas = new Set(desejadas.map((i) => i.id));

    for (const inst of desejadas) {
      const real = estadoDe(inst.id);

      if (inst.desiredState === "on") {
        // logged_out não sobe sozinho: precisa de QR novo, e ficar tentando
        // só gera ruído no log e chamada inútil ao WhatsApp.
        if (inst.state === "logged_out") continue;
        if (real === "close") {
          log.info(`subindo ${inst.id}`);
          await conectar(inst.id, inst.workspaceId).catch((e) =>
            log.erro(`falha ao subir ${inst.id}: ${e.message}`),
          );
        }
        continue;
      }

      if (real !== "close") {
        log.info(`derrubando ${inst.id} (desligado no painel)`);
        await pausar(inst.id).catch((e) => log.erro(`falha ao pausar ${inst.id}: ${e.message}`));
      }
    }

    // Sessão viva cuja linha sumiu do banco: workspace apagado ou instância
    // removida enquanto o socket seguia aberto.
    for (const id of idsAtivos()) {
      if (!conhecidas.has(id)) {
        log.warn(`${id} não existe mais no banco, encerrando`);
        await pausar(id).catch(() => {});
      }
    }
  } catch (err) {
    log.erro(`passada falhou: ${(err as Error).message}`);
  } finally {
    rodando = false;
  }
}

export function iniciarLoopReconciliacao(): NodeJS.Timeout {
  void reconciliar();
  return setInterval(() => void reconciliar(), env.reconcileIntervalMs);
}

/**
 * Heartbeat. O cron de saúde compara `lastSeenAt` com agora para saber se o
 * worker morreu: sem isso, uma instância "open" no banco com o processo caído
 * pareceria saudável e ninguém perceberia que parou de chegar lead.
 */
export function iniciarHeartbeat(): NodeJS.Timeout {
  const bater = async () => {
    const ativos = idsAtivos();
    if (ativos.length === 0) return;
    try {
      await db.whatsappInstance.updateMany({
        where: { id: { in: ativos } },
        data: { lastSeenAt: new Date() },
      });
    } catch (err) {
      log.warn(`heartbeat falhou: ${(err as Error).message}`);
    }
  };
  void bater();
  return setInterval(() => void bater(), env.heartbeatIntervalMs);
}
