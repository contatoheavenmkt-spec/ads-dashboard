import http from "node:http";
import { env } from "../env";
import { criarLog } from "../log";
import { estadoDe, idsAtivos, totalConectadas, deslogar } from "../wa/manager";
import { reconciliar } from "./reconcile";

const log = criarLog("control");

/**
 * Canal de controle painel → worker.
 *
 * Escuta SÓ em 127.0.0.1 e exige um segredo no header. Não é exposto no nginx
 * e não deve ser: quem fala com ele pode desconectar o WhatsApp de qualquer
 * cliente.
 *
 * O papel dele é apenas encurtar a espera. Toda ordem já está no banco em
 * `desiredState`, e o loop de reconciliação aplicaria em até 20 segundos de
 * qualquer forma. Se este servidor estiver fora, nada quebra: só demora.
 */

function autorizado(req: http.IncomingMessage): boolean {
  const enviado = req.headers["x-worker-secret"];
  return typeof enviado === "string" && enviado === env.workerSecret;
}

function json(res: http.ServerResponse, status: number, corpo: unknown): void {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(texto),
  });
  res.end(texto);
}

export function iniciarServidorDeControle(): http.Server {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${env.controlHost}`);

    // Saúde não exige segredo: serve para o PM2 e para debug local.
    if (url.pathname === "/saude") {
      json(res, 200, {
        ok: true,
        sessoes: idsAtivos().length,
        conectadas: totalConectadas(),
        uptimeSegundos: Math.round(process.uptime()),
      });
      return;
    }

    if (!autorizado(req)) {
      json(res, 401, { error: "não autorizado" });
      return;
    }

    // Painel mudou desiredState e quer o efeito agora, sem esperar o loop.
    if (url.pathname === "/sincronizar" && req.method === "POST") {
      void reconciliar();
      json(res, 202, { ok: true, aplicando: true });
      return;
    }

    if (url.pathname === "/estado" && req.method === "GET") {
      const id = url.searchParams.get("id");
      if (id) {
        json(res, 200, { id, estado: estadoDe(id) });
        return;
      }
      json(res, 200, {
        instancias: idsAtivos().map((i) => ({ id: i, estado: estadoDe(i) })),
      });
      return;
    }

    // Desligar de verdade: encerra a sessão no WhatsApp e apaga a credencial.
    if (url.pathname === "/deslogar" && req.method === "POST") {
      const id = url.searchParams.get("id");
      if (!id) {
        json(res, 400, { error: "informe o id" });
        return;
      }
      void deslogar(id).catch((e) => log.erro(`falha ao deslogar ${id}: ${e.message}`));
      json(res, 202, { ok: true });
      return;
    }

    json(res, 404, { error: "rota não encontrada" });
  });

  server.listen(env.controlPort, env.controlHost, () => {
    log.info(`controle ouvindo em http://${env.controlHost}:${env.controlPort} (só loopback)`);
  });

  server.on("error", (err) => {
    log.erro(`servidor de controle falhou: ${err.message}`);
  });

  return server;
}
