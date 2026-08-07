/**
 * Aviso ao worker de que o estado desejado mudou.
 *
 * Isto é ATALHO, não caminho crítico. A ordem de verdade já está gravada em
 * `WhatsappInstance.desiredState`, e o loop de reconciliação do worker aplica
 * em até 20 segundos de qualquer forma. Se o worker estiver reiniciando, ou
 * este fetch falhar, nada se perde: só demora um pouco mais.
 *
 * Por isso o timeout é curto e o erro é engolido: travar a resposta do painel
 * esperando um processo que talvez nem esteja no ar seria pior que esperar o
 * loop.
 */

const TIMEOUT_MS = 2000;

export async function avisarWorker(caminho = "/sincronizar"): Promise<boolean> {
  const segredo = process.env.WORKER_SECRET;
  if (!segredo) return false;

  const porta = process.env.WORKER_PORT ?? "3101";
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`http://127.0.0.1:${porta}${caminho}`, {
      method: "POST",
      headers: { "x-worker-secret": segredo },
      signal: controlador.signal,
    });
    return res.ok;
  } catch {
    // Worker fora do ar, reiniciando, ou porta trocada. O loop de
    // reconciliação resolve sozinho.
    return false;
  } finally {
    clearTimeout(timer);
  }
}
