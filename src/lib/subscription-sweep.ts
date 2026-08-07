import { db } from "@/lib/db";

/**
 * subscription-sweep.ts — varredura periódica de assinaturas vencidas.
 *
 * ─── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
 * A expiração no Dashfy é PREGUIÇOSA: `getAndSyncSubscription()`
 * (lib/subscription.ts) só vira o status para "expired" quando o próprio
 * usuário faz uma requisição. Quem termina o trial e nunca mais volta fica com
 * `status: "trialing"` para sempre.
 *
 * Medido em 29/07/2026: 15 assinaturas nessa situação, a mais recente vencida
 * há 7 dias.
 *
 * ─── O QUE ISTO **NÃO** CONSERTA ─────────────────────────────────────────────
 * Ninguém está com acesso indevido. `isPlanActive()` decide pela DATA
 * (`trialEndsAt`), não pelo status — quem venceu já está bloqueado, esteja o
 * status como estiver. Isto aqui é HIGIENE DE DADO, não correção de acesso:
 * deixa a coluna `status` refletir a realidade, para que código futuro que leia
 * `status` diretamente não erre.
 *
 * ─── POR QUE SÓ TRIAL, E NÃO "active" VENCIDO ────────────────────────────────
 * A simetria seria expirar também `active` com `currentPeriodEnd` no passado —
 * é o que `getAndSyncSubscription` faz na versão por usuário.
 *
 * NÃO É FEITO AQUI DE PROPÓSITO. Em 29/07/2026 havia 2 assinaturas `active`, e
 * UMA delas tinha `currentPeriodEnd` 81 dias no passado. Expirá-la derrubaria o
 * MRR exibido no painel de R$ 599,80 para R$ 299,90 — mexer no número que o
 * dono usa para ler o negócio é decisão dele, não efeito colateral de uma
 * rotina de limpeza. Enquanto essa decisão não for tomada, esta varredura fica
 * restrita ao trial, onde não há receita envolvida.
 */
export interface ResultadoVarredura {
  /** Quantas assinaturas de trial passaram de "trialing" para "expired". */
  trialsExpirados: number;
}

export async function expirarTrialsVencidos(): Promise<ResultadoVarredura> {
  const agora = new Date();

  // `lt` não casa com NULL no Prisma, então trial sem prazo definido (que
  // `isTrialActive` já trata como inativo) não é tocado aqui — mexer nele
  // exigiria decidir uma política de prazo que não existe.
  const r = await db.subscription.updateMany({
    where: {
      status: "trialing",
      trialEndsAt: { lt: agora },
    },
    data: { status: "expired" },
  });

  return { trialsExpirados: r.count };
}
