/**
 * Serializa trabalho por chave dentro do processo.
 *
 * Existe por causa de uma corrida real: a lista de etiquetas de uma conversa é
 * lida, alterada e gravada de volta. Se duas associações chegam quase juntas
 * (o app state do WhatsApp entrega em rajada depois de uma sincronização), as
 * duas leem o mesmo estado e a segunda gravação sobrescreve a primeira.
 *
 * Quando a etiqueta perdida é a "Pago", a venda nunca vira conversão e ninguém
 * percebe: a etiqueta continua lá na tela do atendente, então nem ele nem o
 * gestor têm motivo para mexer de novo.
 *
 * O worker é um processo só, então uma fila em memória por conversa basta.
 * Se um dia rodar em mais de um processo, isto vira lock no banco.
 */

const filas = new Map<string, Promise<unknown>>();

/**
 * Roda `tarefa` garantindo que nada com a mesma `chave` roda ao mesmo tempo.
 * Chaves diferentes seguem em paralelo.
 */
export function emSerie<T>(chave: string, tarefa: () => Promise<T>): Promise<T> {
  const anterior = filas.get(chave) ?? Promise.resolve();

  // A falha de uma tarefa não pode travar a fila da chave: o catch aqui só
  // encadeia, o erro real continua indo para quem chamou.
  const atual = anterior.catch(() => {}).then(tarefa);

  filas.set(chave, atual);

  // Limpa a entrada quando esta era a última da fila, para o Map não crescer
  // sem limite ao longo de dias de execução.
  void atual.catch(() => {}).finally(() => {
    if (filas.get(chave) === atual) filas.delete(chave);
  });

  return atual;
}

/** Só para diagnóstico e teste. */
export function filasAbertas(): number {
  return filas.size;
}
