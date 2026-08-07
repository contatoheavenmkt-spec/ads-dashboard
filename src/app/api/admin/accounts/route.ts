/**
 * GET /api/admin/accounts
 * Lista paginada de contas para o painel admin.
 *
 * CONTRATO (retrocompatível de propósito):
 *   A tela /admin/accounts já consome { users, total, limit, offset } e, dentro
 *   de cada usuário, { id, email, name, role, createdAt, subscription, _count }.
 *   Nada disso mudou de nome. Todo campo novo foi ACRESCENTADO em pt-BR ao lado
 *   do antigo (name → nome, createdAt → criadoEm, ...), e o envelope ganhou
 *   `paginacao`, `filtros` e `ordenacao`. A tela antiga continua funcionando sem
 *   nenhuma alteração; a nova pode migrar aos poucos.
 *
 * PARÂMETROS (nome novo | alias antigo aceito):
 *   busca      | search   texto livre: email, nome ou id exato
 *   role       | —        AGENCY | CLIENT | ADMIN
 *   plano      | plan     trial | start | plus | premium
 *   statusAss. | status   active | trialing | expired | canceled
 *   ativo      | —        true/false — teve acesso nos últimos 30 dias
 *   pagina     | —        1-based
 *   porPagina  | limit    1..200 (padrão 25)
 *   offset     | offset   alternativa a `pagina` (0-based), mantida por compat
 *   ordenar    | —        criadoEm | email | nome | role | plano |
 *                         statusAssinatura | ultimoAcesso
 *   direcao    | dir      asc | desc
 *
 * CUSTO: cada ida ao Supabase custa ~190ms, então o caminho normal é
 * 2 round-trips (findMany ‖ count, depois os agregados em paralelo), não uma
 * query por usuário. Ver comentário em carregarAcessos/carregarAgregados.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateAdminRequest } from "@/lib/admin-auth";
import { db } from "@/lib/db";

// ─── Constantes ───────────────────────────────────────────────────────────────

const PADRAO_POR_PAGINA = 25;
const MIN_POR_PAGINA = 1;
/** Teto herdado da versão anterior da rota (limit era Math.min(limit, 200)). */
const MAX_POR_PAGINA = 200;
const MAX_PAGINA = 100_000;
const MAX_OFFSET = 1_000_000;
const MAX_BUSCA = 120;

const JANELA_ONLINE_MS = 5 * 60 * 1000;
const JANELA_ATIVO_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Teto para a ordenação por `ultimoAcesso`. Esse campo não é coluna do User —
 * vem de PageView/ActiveSession — então ordenar por ele exige trazer os ids do
 * conjunto filtrado para a memória. Uma coluna de id é barata, mas não é
 * ilimitada: acima desse teto a rota cai para ordenação por data de cadastro e
 * avisa no corpo da resposta (campo `aviso`), em vez de mentir silenciosamente.
 */
const MAX_IDS_ORDENACAO = 5_000;

/** Mesmas whitelists usadas no PATCH de /api/admin/accounts/[id]. */
const ROLES = ["AGENCY", "CLIENT", "ADMIN"];
const PLANOS = ["trial", "start", "plus", "premium"];
const STATUS_ASSINATURA = ["active", "trialing", "expired", "canceled", "cortesia"];

type Direcao = "asc" | "desc";
type CampoOrdenacao =
  | "criadoEm"
  | "email"
  | "nome"
  | "role"
  | "plano"
  | "statusAssinatura"
  | "ultimoAcesso";

/** Aceita o nome pt-BR e o nome da coluna, para o front poder usar qualquer um. */
const CAMPOS_ORDENACAO: Record<string, CampoOrdenacao> = {
  criadoem: "criadoEm",
  createdat: "criadoEm",
  email: "email",
  nome: "nome",
  name: "nome",
  role: "role",
  plano: "plano",
  plan: "plano",
  statusassinatura: "statusAssinatura",
  status: "statusAssinatura",
  ultimoacesso: "ultimoAcesso",
};

type MapasDeAcesso = {
  /** max(PageView.createdAt, ActiveSession.lastSeen) por usuário. */
  ultimoAcesso: Map<string, Date>;
  /** Só ActiveSession.lastSeen — é o que define "online", não o pageview. */
  ultimaSessao: Map<string, Date>;
};

type AgregadoWorkspace = { workspaces: number; integracoes: number };

// ─── Validação de parâmetros ──────────────────────────────────────────────────

/**
 * Inteiro dentro de [min, max], com fallback.
 *
 * Existe porque `parseInt` cru é o bug repetido em outras rotas do projeto:
 * `parseInt("abc")` vira NaN, NaN entra no `take` do Prisma e derruba a rota
 * com 500. Aqui usamos Number() (que rejeita "12abc", ao contrário do parseInt),
 * checamos isFinite e só então limitamos à faixa.
 */
function inteiroNaFaixa(bruto: string | null, padrao: number, min: number, max: number): number {
  if (bruto === null || bruto.trim() === "") return padrao;
  const n = Number(bruto);
  if (!Number.isFinite(n)) return padrao;
  const inteiro = Math.trunc(n);
  if (inteiro < min) return min;
  if (inteiro > max) return max;
  return inteiro;
}

function texto(bruto: string | null, max: number): string {
  if (!bruto) return "";
  return bruto.trim().slice(0, max);
}

/**
 * Valor de enum ou null. Valor inválido é IGNORADO (mesmo comportamento do
 * PATCH de accounts/[id]) em vez de virar 400 — mas a resposta devolve
 * `filtros` com o que realmente foi aplicado, para o admin não achar que
 * filtrou algo quando não filtrou.
 */
function umDentreOs(bruto: string | null, permitidos: string[]): string | null {
  if (!bruto) return null;
  const valor = bruto.trim();
  return permitidos.includes(valor) ? valor : null;
}

/** undefined = "não filtrar por isso" (diferente de false = "só inativos"). */
function booleano(bruto: string | null): boolean | undefined {
  if (bruto === null) return undefined;
  const v = bruto.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "sim") return true;
  if (v === "0" || v === "false" || v === "nao" || v === "não") return false;
  return undefined;
}

/** Texto cresce melhor A→Z; data e último acesso, do mais recente para o mais antigo. */
function direcaoPadrao(campo: CampoOrdenacao): Direcao {
  return campo === "criadoEm" || campo === "ultimoAcesso" ? "desc" : "asc";
}

/** `any` de propósito (mesmo estilo do `where: any` que já existia nesta rota):
 *  o tipo do orderBy do Prisma muda conforme o campo, e o valor só é consumido
 *  pelo próprio Prisma logo abaixo. */
function montarOrderBy(campo: CampoOrdenacao, direcao: Direcao): any {
  switch (campo) {
    case "email":
      return { email: direcao };
    case "nome":
      return { name: direcao };
    case "role":
      return { role: direcao };
    case "plano":
      return { subscription: { plan: direcao } };
    case "statusAssinatura":
      return { subscription: { status: direcao } };
    // "ultimoAcesso" não é coluna: a ordenação real acontece mais abaixo, em
    // memória. Devolvemos createdAt aqui para o findMany ter sempre uma ordem
    // determinística (e para servir de fallback se o conjunto for grande demais).
    default:
      return { createdAt: direcao };
  }
}

// ─── Agregados (evitam N+1) ───────────────────────────────────────────────────

/**
 * Último acesso por usuário, em 2 queries agregadas no banco — NUNCA uma por
 * usuário. `ids` null = base inteira (usado pelo filtro `ativo` e pela ordenação
 * por último acesso); `desde` limita a janela, o que mantém o resultado
 * proporcional a "usuários com atividade no período", não ao volume de PageView
 * (2.7k linhas hoje e sempre crescendo).
 */
async function carregarAcessos(ids: string[] | null, desde: Date | null): Promise<MapasDeAcesso> {
  // `not: null` descarta os pageviews anônimos (userId nulo), que são a maioria.
  const usuario: { in?: string[]; not?: null } = ids ? { in: ids } : { not: null };

  const [porPageView, porSessao] = await Promise.all([
    db.pageView.groupBy({
      by: ["userId"],
      where: desde ? { userId: usuario, createdAt: { gte: desde } } : { userId: usuario },
      _max: { createdAt: true },
    }),
    db.activeSession.groupBy({
      by: ["userId"],
      where: desde ? { userId: usuario, lastSeen: { gte: desde } } : { userId: usuario },
      _max: { lastSeen: true },
    }),
  ]);

  const ultimoAcesso = new Map<string, Date>();
  const ultimaSessao = new Map<string, Date>();

  const guardar = (mapa: Map<string, Date>, id: string | null, data: Date | null | undefined) => {
    if (!id || !data) return;
    const atual = mapa.get(id);
    if (!atual || data.getTime() > atual.getTime()) mapa.set(id, data);
  };

  for (const linha of porPageView) guardar(ultimoAcesso, linha.userId, linha._max?.createdAt);
  for (const linha of porSessao) {
    guardar(ultimaSessao, linha.userId, linha._max?.lastSeen);
    guardar(ultimoAcesso, linha.userId, linha._max?.lastSeen);
  }

  return { ultimoAcesso, ultimaSessao };
}

/**
 * Workspaces e integrações por dono, em UMA query — não uma por usuário.
 *
 * Só workspaces vivos (deletedAt null): a coluna da lista responde "quantos
 * workspaces essa conta opera hoje", e soft-deleted não opera nada. Quem quiser
 * ver os removidos abre a conta em /admin/accounts/[id].
 *
 * A contagem de integrações é DISTINTA por Integration: a mesma conta de anúncio
 * pode estar vinculada a dois workspaces do mesmo dono, e contar o vínculo duas
 * vezes inflaria o número. Por isso trazemos os integrationId (poucas linhas,
 * limitadas aos usuários da página) em vez de um _count de vínculos.
 */
async function carregarAgregadosWorkspace(ids: string[]): Promise<Map<string, AgregadoWorkspace>> {
  const workspaces = await db.workspace.findMany({
    where: { ownerId: { in: ids }, deletedAt: null },
    select: { ownerId: true, integrations: { select: { integrationId: true } } },
  });

  const acumulador = new Map<string, { workspaces: number; integracoes: Set<string> }>();
  for (const ws of workspaces) {
    if (!ws.ownerId) continue;
    let entrada = acumulador.get(ws.ownerId);
    if (!entrada) {
      entrada = { workspaces: 0, integracoes: new Set<string>() };
      acumulador.set(ws.ownerId, entrada);
    }
    entrada.workspaces += 1;
    for (const vinculo of ws.integrations) entrada.integracoes.add(vinculo.integrationId);
  }

  const resultado = new Map<string, AgregadoWorkspace>();
  for (const [ownerId, entrada] of acumulador) {
    resultado.set(ownerId, { workspaces: entrada.workspaces, integracoes: entrada.integracoes.size });
  }
  return resultado;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!validateAdminRequest(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);

  // ── Filtros ──
  const busca = texto(searchParams.get("busca") ?? searchParams.get("search"), MAX_BUSCA);
  const role = umDentreOs(searchParams.get("role"), ROLES);
  const plano = umDentreOs(searchParams.get("plano") ?? searchParams.get("plan"), PLANOS);
  const statusAssinatura = umDentreOs(
    searchParams.get("statusAssinatura") ?? searchParams.get("status"),
    STATUS_ASSINATURA
  );
  const ativo = booleano(searchParams.get("ativo"));

  // ── Ordenação ──
  const campoOrdenacao =
    CAMPOS_ORDENACAO[(searchParams.get("ordenar") ?? "").trim().toLowerCase()] ?? "criadoEm";
  const direcaoBruta = (searchParams.get("direcao") ?? searchParams.get("dir") ?? "").trim().toLowerCase();
  const direcao: Direcao =
    direcaoBruta === "asc" ? "asc" : direcaoBruta === "desc" ? "desc" : direcaoPadrao(campoOrdenacao);

  // ── Paginação: `pagina`/`porPagina` são os novos; `limit`/`offset` continuam
  // valendo porque a tela atual ainda os envia. Quando os dois chegam, o par
  // novo ganha. ──
  const porPagina = inteiroNaFaixa(
    searchParams.get("porPagina") ?? searchParams.get("limit"),
    PADRAO_POR_PAGINA,
    MIN_POR_PAGINA,
    MAX_POR_PAGINA
  );
  const paginaBruta = searchParams.get("pagina");
  let pagina: number;
  let skip: number;
  if (paginaBruta !== null && paginaBruta.trim() !== "") {
    pagina = inteiroNaFaixa(paginaBruta, 1, 1, MAX_PAGINA);
    skip = (pagina - 1) * porPagina;
  } else {
    skip = inteiroNaFaixa(searchParams.get("offset"), 0, 0, MAX_OFFSET);
    pagina = Math.floor(skip / porPagina) + 1;
  }

  const agora = Date.now();
  const limiteOnline = agora - JANELA_ONLINE_MS;
  const limiteAtivo = agora - JANELA_ATIVO_MS;

  try {
    const where: any = {};

    if (busca) {
      where.OR = [
        { email: { contains: busca, mode: "insensitive" } },
        { name: { contains: busca, mode: "insensitive" } },
        // Id exato: colar o cuid na busca é o jeito mais rápido de achar a conta
        // a partir de um log de erro ou de um AdminLog.
        { id: busca },
      ];
    }
    if (role) where.role = role;
    if (plano) where.subscription = { plan: plano };
    if (statusAssinatura) where.subscription = { ...(where.subscription ?? {}), status: statusAssinatura };

    // `ativo` e a ordenação por último acesso dependem de dados que não estão em
    // User, então precisam do mapa de acessos ANTES da consulta principal.
    // Para o filtro basta a janela de 30 dias; para ordenar precisamos do
    // histórico inteiro (quem sumiu há 90 dias ainda tem que entrar na ordem).
    const ordenarPorAcesso = campoOrdenacao === "ultimoAcesso";
    const acessosGlobais =
      ativo !== undefined || ordenarPorAcesso
        ? await carregarAcessos(null, ordenarPorAcesso ? null : new Date(limiteAtivo))
        : null;

    if (ativo !== undefined && acessosGlobais) {
      const idsAtivos: string[] = [];
      for (const [id, data] of acessosGlobais.ultimoAcesso) {
        if (data.getTime() >= limiteAtivo) idsAtivos.push(id);
      }
      // ativo=false inclui quem NUNCA acessou, por isso é NOT-IN e não uma
      // comparação de data (esses usuários simplesmente não estão no mapa).
      if (ativo) where.id = { in: idsAtivos };
      else where.NOT = { id: { in: idsAtivos } };
    }

    // ── Ordenação por último acesso: resolvida em memória sobre a lista de ids
    // do conjunto filtrado (uma coluna, com teto), porque não dá para pedir ao
    // Postgres via Prisma sem montar SQL dinâmico. ──
    let idsOrdenados: string[] | null = null;
    let totalOrdenado = 0;
    let aviso: string | null = null;

    if (ordenarPorAcesso && acessosGlobais) {
      const candidatos = await db.user.findMany({
        where,
        select: { id: true },
        orderBy: { createdAt: "desc" },
        take: MAX_IDS_ORDENACAO + 1, // +1 só para detectar o estouro do teto
      });

      if (candidatos.length > MAX_IDS_ORDENACAO) {
        aviso = `Mais de ${MAX_IDS_ORDENACAO} contas no filtro: ordenado por data de cadastro em vez de último acesso.`;
      } else {
        const mapa = acessosGlobais.ultimoAcesso;
        const sinal = direcao === "asc" ? 1 : -1;
        totalOrdenado = candidatos.length;
        idsOrdenados = candidatos
          .map((c) => c.id)
          .sort((a, b) => {
            const ta = mapa.get(a)?.getTime() ?? 0;
            const tb = mapa.get(b)?.getTime() ?? 0;
            // "Nunca acessou" vai sempre para o fim da lista, nas duas direções:
            // não é o mesmo que "acessou há muito tempo" e polui o topo do asc.
            if (ta === 0 && tb === 0) return 0;
            if (ta === 0) return 1;
            if (tb === 0) return -1;
            return (ta - tb) * sinal;
          })
          .slice(skip, skip + porPagina);
      }
    }

    const [linhas, total] = await Promise.all([
      db.user.findMany({
        // Quando a ordenação por acesso valeu, `idsOrdenados` JÁ é a fatia da
        // página — o where original vai junto só por segurança.
        where: idsOrdenados ? { ...where, id: { in: idsOrdenados } } : where,
        // select explícito — NUNCA expor `password` (hash bcrypt).
        // stripeCustomerId também fica de fora: a coluna sobrou da época do
        // Stripe (o sistema migrou para Cakto) e não serve a nenhuma tela.
        //
        // Enxuto de propósito (auditoria mediu ~836 B/usuário, ~60% morto):
        // a tela /admin/accounts só lê subscription.plan/.status (fallback dos
        // campos pt-BR) e os dois _count — o resto da Subscription (ids, datas,
        // stripeSubscriptionId legado) e workspaceId/onboardingCompleted/
        // forcePasswordChange/updatedAt do User ninguém consome na lista; o
        // detalhe completo mora em /api/admin/accounts/[id].
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          subscription: { select: { plan: true, status: true } },
          _count: { select: { metaConnections: true, googleConnections: true } },
        },
        orderBy: montarOrderBy(campoOrdenacao, direcao),
        // `idsOrdenados` nunca tem mais que `porPagina` itens (já veio fatiado),
        // então o mesmo take serve aos dois caminhos — só o skip muda.
        take: porPagina,
        skip: idsOrdenados ? 0 : skip,
      }),
      idsOrdenados ? Promise.resolve(totalOrdenado) : db.user.count({ where }),
    ]);

    // O `IN` do Postgres não preserva a ordem do array — reordena pela posição
    // calculada acima, senão a ordenação por último acesso não aparece na tela.
    if (idsOrdenados) {
      const posicao = new Map<string, number>();
      idsOrdenados.forEach((id, i) => posicao.set(id, i));
      linhas.sort((a, b) => (posicao.get(a.id) ?? 0) - (posicao.get(b.id) ?? 0));
    }

    // ── Agregados só dos usuários DESTA página (no máximo `porPagina` linhas).
    // Lista vazia é caso normal (filtro sem resultado) — nesse caso nem vale
    // gastar os ~190ms de cada consulta. ──
    const idsPagina = linhas.map((u) => u.id);
    let acessos: MapasDeAcesso = { ultimoAcesso: new Map(), ultimaSessao: new Map() };
    let agregados: Map<string, AgregadoWorkspace> = new Map();
    if (idsPagina.length > 0) {
      [acessos, agregados] = await Promise.all([
        carregarAcessos(idsPagina, null),
        carregarAgregadosWorkspace(idsPagina),
      ]);
    }

    const users = linhas.map((u) => {
      const ultimoAcesso = acessos.ultimoAcesso.get(u.id) ?? null;
      const ultimaSessao = acessos.ultimaSessao.get(u.id) ?? null;
      const agregado = agregados.get(u.id);

      return {
        // ── Campos que a tela atual já consome. Não renomear. ──
        // (workspaceId/onboardingCompleted/forcePasswordChange/updatedAt saíram
        // do payload: nenhum consumidor da lista os lê — ver o select acima.)
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        createdAt: u.createdAt,
        subscription: u.subscription,
        _count: u._count,

        // ── Campos novos, em pt-BR. ──
        nome: u.name,
        criadoEm: u.createdAt,
        plano: u.subscription?.plan ?? null,
        statusAssinatura: u.subscription?.status ?? null,
        qtdWorkspaces: agregado?.workspaces ?? 0,
        qtdIntegracoes: agregado?.integracoes ?? 0,
        ultimoAcesso,
        online: ultimaSessao !== null && ultimaSessao.getTime() >= limiteOnline,
        ativo: ultimoAcesso !== null && ultimoAcesso.getTime() >= limiteAtivo,
      };
    });

    return NextResponse.json({
      // Compat: a tela lê `users`, `total`, `limit` e `offset`.
      users,
      total,
      limit: porPagina,
      offset: skip,
      paginacao: {
        pagina,
        porPagina,
        total,
        totalPaginas: Math.ceil(total / porPagina),
        temAnterior: skip > 0,
        temProxima: skip + users.length < total,
      },
      // Eco do que foi REALMENTE aplicado — filtro inválido é ignorado, e sem
      // isso o admin não teria como perceber.
      filtros: { busca: busca || null, role, plano, statusAssinatura, ativo: ativo ?? null },
      ordenacao: { campo: campoOrdenacao, direcao },
      ...(aviso ? { aviso } : {}),
    });
  } catch (err) {
    console.error("[admin/accounts/GET] Erro:", (err as Error)?.message ?? err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
