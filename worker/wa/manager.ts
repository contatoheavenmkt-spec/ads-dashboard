import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import fs from "node:fs";
import path from "node:path";
import { env } from "../env";
import { criarLog, tel } from "../log";
import { db } from "../prisma";

const log = criarLog("wa");

/**
 * Gerência das sessões de WhatsApp.
 *
 * Duas regras que definem o desenho:
 *
 * 1. O worker é READ-ONLY. Nunca envia mensagem, nunca marca presença, nunca
 *    sincroniza histórico completo. É o maior redutor de risco de ban
 *    disponível e sai de graça, porque o produto só precisa observar.
 *
 * 2. Parar não é deslogar. `pausar()` fecha o socket e mantém a credencial em
 *    disco, então religar não pede QR de novo. Só `deslogar()` apaga a pasta
 *    de auth. O instance-manager do AtendeAI mistura os dois e apaga a
 *    credencial ao parar, o que obriga a reparear a cada pausa.
 */

export type EstadoInstancia =
  | "close"
  | "connecting"
  | "qr"
  | "open"
  | "logged_out";

interface Instancia {
  id: string;
  workspaceId: string;
  sock: WASocket;
  estado: EstadoInstancia;
  qr: string | null;
  pairingCode: string | null;
  phone: string | null;
  tentativas: number;
  timerReconexao: NodeJS.Timeout | null;
  /** Pausa pedida pelo painel: não deve disparar reconexão automática. */
  pausando: boolean;
}

const instancias = new Map<string, Instancia>();

export type HandlerMensagem = (ctx: {
  instanceId: string;
  workspaceId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mensagens: any[];
  tipo: string;
}) => void | Promise<void>;

export type HandlerEtiqueta = (ctx: {
  instanceId: string;
  workspaceId: string;
  evento: "association" | "edit";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
}) => void | Promise<void>;

let aoReceberMensagem: HandlerMensagem = () => {};
let aoMudarEtiqueta: HandlerEtiqueta = () => {};

export function registrarHandlers(h: {
  mensagem: HandlerMensagem;
  etiqueta: HandlerEtiqueta;
}) {
  aoReceberMensagem = h.mensagem;
  aoMudarEtiqueta = h.etiqueta;
}

function pastaAuth(instanceId: string): string {
  return path.resolve(env.authDir, instanceId);
}

/**
 * Logger silencioso para o Baileys.
 *
 * A lib usa pino e, no nível padrão, despeja o handshake inteiro e cada nó do
 * protocolo no stdout. Num worker sob PM2 isso enche o disco da VPS em dias e
 * afoga as linhas que interessam. Erros continuam aparecendo pelo nosso log.
 */
const loggerSilencioso = {
  level: "silent",
  fatal: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  trace: () => {},
  child: () => loggerSilencioso,
};

export function estadoDe(instanceId: string): EstadoInstancia {
  return instancias.get(instanceId)?.estado ?? "close";
}

export function totalConectadas(): number {
  return [...instancias.values()].filter((i) => i.estado === "open").length;
}

export function idsAtivos(): string[] {
  return [...instancias.keys()];
}

async function gravarEstado(
  instanceId: string,
  dados: Record<string, unknown>,
): Promise<void> {
  try {
    await db.whatsappInstance.update({ where: { id: instanceId }, data: dados });
  } catch (err) {
    // Instância apagada do painel enquanto o socket ainda vivia.
    log.warn(`não consegui gravar estado de ${instanceId}: ${(err as Error).message}`);
  }
}

/**
 * Sobe uma sessão. Idempotente: chamar de novo em instância já conectada
 * não faz nada, que é o que o loop de reconciliação precisa.
 */
export async function conectar(
  instanceId: string,
  workspaceId: string,
  opts: { pairPhone?: string | null } = {},
): Promise<void> {
  const existente = instancias.get(instanceId);
  if (existente && ["open", "connecting", "qr"].includes(existente.estado)) return;

  if (instancias.size >= env.maxInstances && !existente) {
    log.erro(
      `teto de ${env.maxInstances} sessões atingido, ${instanceId} não vai subir. Aumente TRACK_MAX_INSTANCES ou distribua em outro worker.`,
    );
    await gravarEstado(instanceId, {
      state: "close",
      lastError: "Teto de sessões do worker atingido",
    });
    return;
  }

  const dir = pastaAuth(instanceId);
  fs.mkdirSync(dir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    // Fingerprint estável: trocar isso a cada boot chama atenção.
    browser: ["Dashfys Track", "Chrome", "120.0.0"],
    // Read-only: nada de aparecer online nem puxar histórico inteiro.
    markOnlineOnConnect: false,
    syncFullHistory: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logger: loggerSilencioso as any,
  });

  const inst: Instancia = {
    id: instanceId,
    workspaceId,
    sock,
    estado: "connecting",
    qr: null,
    pairingCode: null,
    phone: null,
    tentativas: existente?.tentativas ?? 0,
    timerReconexao: null,
    pausando: false,
  };
  instancias.set(instanceId, inst);
  await gravarEstado(instanceId, { state: "connecting", lastError: null });

  sock.ev.on("creds.update", saveCreds);

  // Pareamento por código, para quem não tem um segundo aparelho para ler o QR.
  if (opts.pairPhone && !state.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(String(opts.pairPhone).replace(/\D/g, ""));
        const i = instancias.get(instanceId);
        if (i) i.pairingCode = code;
        await gravarEstado(instanceId, {
          pairingCode: code,
          qrExpiresAt: new Date(Date.now() + 3 * 60_000),
        });
        log.info(`${instanceId}: código de pareamento gerado`);
      } catch (err) {
        log.erro(`${instanceId}: falha ao gerar código de pareamento: ${(err as Error).message}`);
      }
    }, 2500);
  }

  sock.ev.on("connection.update", async (u) => {
    const i = instancias.get(instanceId);
    if (!i) return;

    if (u.qr) {
      i.qr = await QRCode.toDataURL(u.qr);
      i.estado = "qr";
      // O QR vai pelo banco, não pelo HTTP de controle: assim a tela de
      // conexão não depende da saúde do processo worker.
      await gravarEstado(instanceId, {
        state: "qr",
        qr: i.qr,
        qrExpiresAt: new Date(Date.now() + 60_000),
      });
      log.info(`${instanceId}: QR gerado`);
    }

    if (u.connection === "open") {
      i.estado = "open";
      i.qr = null;
      i.pairingCode = null;
      i.tentativas = 0;
      i.phone = sock.user?.id?.split(":")[0]?.replace(/\D/g, "") ?? null;

      // Conta Business é o que tem etiqueta. Sem isso, o funil depende só das
      // frases-gatilho, e o painel precisa avisar o cliente disso.
      const plataforma = (state.creds as { platform?: string }).platform ?? "";
      const isBusiness = ["smba", "smbi"].includes(plataforma);

      await gravarEstado(instanceId, {
        state: "open",
        qr: null,
        pairingCode: null,
        qrExpiresAt: null,
        phone: i.phone,
        isBusiness,
        lastConnectedAt: new Date(),
        lastSeenAt: new Date(),
        lastError: null,
      });
      log.info(`${instanceId}: conectado ${tel(i.phone)}${isBusiness ? " (Business)" : " (pessoal, sem etiquetas)"}`);

      // Força a sincronização do app state, que é de onde vêm os nomes das
      // etiquetas. Sem isso só chegam ids de etiqueta, sem nome legível.
      try {
        await sock.resyncAppState(["regular"], false);
        log.info(`${instanceId}: app state ressincronizado`);
      } catch (err) {
        log.warn(`${instanceId}: resync do app state falhou: ${(err as Error).message}`);
      }
    }

    if (u.connection === "close") {
      const codigo = (u.lastDisconnect?.error as { output?: { statusCode?: number } })?.output
        ?.statusCode;

      if (i.pausando) {
        log.info(`${instanceId}: pausado pelo painel`);
        instancias.delete(instanceId);
        await gravarEstado(instanceId, { state: "close" });
        return;
      }

      // Deslogado do celular: credencial morreu, reconectar é inútil.
      if (codigo === DisconnectReason.loggedOut) {
        log.warn(`${instanceId}: sessão encerrada no aparelho, precisa parear de novo`);
        limparAuth(instanceId);
        instancias.delete(instanceId);
        await gravarEstado(instanceId, {
          state: "logged_out",
          desiredState: "off",
          qr: null,
          lastError: "A sessão foi desconectada pelo aparelho. Escaneie o QR de novo.",
        });
        return;
      }

      // Backoff exponencial de 5s a 5min. connectionReplaced parte de 15s
      // porque significa que outra sessão assumiu: reconectar rápido vira
      // cabo de guerra entre os dois.
      i.tentativas += 1;
      const base = codigo === DisconnectReason.connectionReplaced ? 15_000 : 5_000;
      const espera = Math.min(base * 2 ** (i.tentativas - 1), 5 * 60_000);
      i.estado = "close";
      log.warn(`${instanceId}: caiu (código ${codigo ?? "?"}), tentativa ${i.tentativas} em ${Math.round(espera / 1000)}s`);
      await gravarEstado(instanceId, {
        state: "close",
        lastError: `Desconectado (código ${codigo ?? "desconhecido"})`,
      });

      i.timerReconexao = setTimeout(() => {
        const atual = instancias.get(instanceId);
        const tentativas = atual?.tentativas ?? 0;
        instancias.delete(instanceId);
        conectar(instanceId, workspaceId)
          .then(() => {
            const nova = instancias.get(instanceId);
            if (nova) nova.tentativas = tentativas;
          })
          .catch((e) => log.erro(`${instanceId}: falha ao reconectar: ${e.message}`));
      }, espera);
    }
  });

  /**
   * ATENÇÃO ao `type`: mensagem que chegou com o socket fora do ar volta como
   * 'append', não 'notify'. O AtendeAI descarta tudo que não é 'notify', o que
   * significa perder exatamente os leads que chegaram durante uma queda. Aqui
   * os dois passam, e a duplicata é barrada pelo unique de waMessageId.
   */
  sock.ev.on("messages.upsert", (payload) => {
    const tipo = payload.type;
    if (tipo !== "notify" && tipo !== "append") return;
    void Promise.resolve(
      aoReceberMensagem({
        instanceId,
        workspaceId,
        mensagens: payload.messages ?? [],
        tipo,
      }),
    ).catch((e) => log.erro(`${instanceId}: handler de mensagem falhou: ${e.message}`));
  });

  // A etiqueta "Pago" no celular chega aqui. É o coração do produto e o
  // motivo de usarmos Baileys em vez da API oficial, que não expõe etiquetas.
  sock.ev.on("labels.association", (payload) => {
    void Promise.resolve(
      aoMudarEtiqueta({ instanceId, workspaceId, evento: "association", payload }),
    ).catch((e) => log.erro(`${instanceId}: handler de etiqueta falhou: ${e.message}`));
  });

  // Só aqui vem o NOME da etiqueta. O association traz apenas o id.
  sock.ev.on("labels.edit", (payload) => {
    void Promise.resolve(
      aoMudarEtiqueta({ instanceId, workspaceId, evento: "edit", payload }),
    ).catch((e) => log.erro(`${instanceId}: handler de etiqueta falhou: ${e.message}`));
  });
}

function limparAuth(instanceId: string): void {
  try {
    fs.rmSync(pastaAuth(instanceId), { recursive: true, force: true });
  } catch (err) {
    log.warn(`${instanceId}: não consegui limpar a pasta de auth: ${(err as Error).message}`);
  }
}

/**
 * Fecha o socket mantendo a credencial: religar não vai pedir QR.
 * É o que o painel usa ao desligar uma instância.
 */
export async function pausar(instanceId: string): Promise<void> {
  const inst = instancias.get(instanceId);
  if (!inst) {
    await gravarEstado(instanceId, { state: "close" });
    return;
  }
  inst.pausando = true;
  if (inst.timerReconexao) clearTimeout(inst.timerReconexao);
  try {
    inst.sock.end(undefined);
  } catch {
    // socket já morto
  }
  instancias.delete(instanceId);
  await gravarEstado(instanceId, { state: "close", qr: null, pairingCode: null });
  log.info(`${instanceId}: pausado`);
}

/**
 * Desliga de verdade: encerra a sessão no WhatsApp e apaga a credencial.
 * Depois disso só volta com QR novo.
 */
export async function deslogar(instanceId: string): Promise<void> {
  const inst = instancias.get(instanceId);
  if (inst) {
    inst.pausando = true;
    if (inst.timerReconexao) clearTimeout(inst.timerReconexao);
    try {
      await inst.sock.logout();
    } catch {
      try {
        inst.sock.end(undefined);
      } catch {
        // já morto
      }
    }
    instancias.delete(instanceId);
  }
  limparAuth(instanceId);
  await gravarEstado(instanceId, {
    state: "logged_out",
    desiredState: "off",
    qr: null,
    pairingCode: null,
    phone: null,
  });
  log.info(`${instanceId}: deslogado e credencial apagada`);
}

/** Encerra tudo sem apagar credencial, para reiniciar o processo. */
export async function encerrarTudo(): Promise<void> {
  for (const inst of instancias.values()) {
    inst.pausando = true;
    if (inst.timerReconexao) clearTimeout(inst.timerReconexao);
    try {
      inst.sock.end(undefined);
    } catch {
      // ignora
    }
  }
  instancias.clear();
}
