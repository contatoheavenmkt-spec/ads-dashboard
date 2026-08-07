import { db } from "@/lib/db";
import { getMetaAdAccounts, MetaApiError } from "@/lib/meta-api";
import { getStoredMetaToken } from "@/lib/meta-token";

/**
 * Reconcilia as integrações Meta salvas com as contas que o token realmente
 * enxerga hoje.
 *
 * Por que isto e não um contador de erros: quando uma conta sai do portfólio
 * de BMs, a Meta responde erro nos insights daquela conta, mas o mesmo token
 * segue funcionando para as outras. Contar falhas exigiria interpretar
 * mensagem de erro e calibrar um limiar. Aqui a pergunta é direta — "quais
 * contas você me deixa ver?" — e a resposta é uma lista. Determinístico.
 *
 * Regra de ouro: só marcamos algo como morto quando a LISTAGEM DEU CERTO.
 * Falha de rede, token expirado ou lista vazia nunca marcam nada — seria
 * fácil apagar o painel inteiro do cliente por uma indisponibilidade da Meta.
 */

// account_status da Meta: 1=ACTIVE, 2=DISABLED, 3=UNSETTLED, 7=PENDING_RISK_REVIEW,
// 8=PENDING_SETTLEMENT, 9=IN_GRACE_PERIOD, 100=PENDING_CLOSURE, 101=CLOSED,
// 201=ANY_ACTIVE, 202=ANY_CLOSED. Tratamos como inutilizável só o que não volta
// sozinho — desabilitada, em fechamento ou fechada.
const STATUS_INUTILIZAVEL = new Set([2, 100, 101]);

export interface ResultadoReconciliacao {
  ownerId: string;
  verificadas: number;
  marcadasErro: number;
  reativadas: number;
  pulado?: string;
}

export async function reconcileMetaIntegrations(ownerId: string): Promise<ResultadoReconciliacao> {
  const base = { ownerId, verificadas: 0, marcadasErro: 0, reativadas: 0 };

  const token = await getStoredMetaToken(ownerId);
  if (!token) return { ...base, pulado: "sem token Meta" };

  let contasVivas;
  try {
    contasVivas = await getMetaAdAccounts(token);
  } catch (err) {
    // Erro de token afeta tudo do dono — não é evidência de conta removida.
    const motivo =
      err instanceof MetaApiError && err.isTokenError
        ? "token Meta inválido (code 190)"
        : `falha ao listar contas: ${(err as Error)?.message ?? "desconhecido"}`;
    return { ...base, pulado: motivo };
  }

  // Lista vazia pode ser resposta degradada. Não vale marcar tudo morto.
  if (contasVivas.length === 0) {
    return { ...base, pulado: "a Meta devolveu lista vazia" };
  }

  const acessiveis = new Map(contasVivas.map((c) => [c.id, c]));

  const vinculos = await db.workspaceIntegration.findMany({
    where: {
      workspace: { ownerId, deletedAt: null },
      integration: { platform: "meta" },
    },
    include: { integration: true },
  });

  // A mesma Integration pode estar em vários workspaces — dedup por id.
  const integracoes = new Map<string, { id: string; adAccountId: string; status: string }>();
  for (const v of vinculos) {
    integracoes.set(v.integration.id, {
      id: v.integration.id,
      adAccountId: v.integration.adAccountId,
      status: v.integration.status,
    });
  }

  const paraErro: string[] = [];
  const paraAtivo: string[] = [];

  for (const it of integracoes.values()) {
    const conta = acessiveis.get(it.adAccountId);
    const utilizavel = !!conta && !STATUS_INUTILIZAVEL.has(conta.account_status);

    if (!utilizavel && it.status !== "error") paraErro.push(it.id);
    // Volta sozinha quando a conta reaparece no portfólio — sem isso, religar
    // a BM exigiria mexer no banco na mão.
    if (utilizavel && it.status === "error") paraAtivo.push(it.id);
  }

  if (paraErro.length) {
    await db.integration.updateMany({ where: { id: { in: paraErro } }, data: { status: "error" } });
  }
  if (paraAtivo.length) {
    await db.integration.updateMany({ where: { id: { in: paraAtivo } }, data: { status: "active" } });
  }

  return {
    ownerId,
    verificadas: integracoes.size,
    marcadasErro: paraErro.length,
    reativadas: paraAtivo.length,
  };
}

/** Roda a reconciliação para todo dono que tenha ao menos uma integração Meta. */
export async function reconcileAllOwners(): Promise<ResultadoReconciliacao[]> {
  const donos = await db.workspace.findMany({
    where: {
      deletedAt: null,
      ownerId: { not: null },
      integrations: { some: { integration: { platform: "meta" } } },
    },
    select: { ownerId: true },
    distinct: ["ownerId"],
    take: 200,
  });

  const resultados: ResultadoReconciliacao[] = [];
  for (const d of donos) {
    if (!d.ownerId) continue;
    try {
      resultados.push(await reconcileMetaIntegrations(d.ownerId));
    } catch (err) {
      console.warn(`[reconcile] dono ${d.ownerId}:`, (err as Error)?.message ?? err);
    }
  }
  return resultados;
}
