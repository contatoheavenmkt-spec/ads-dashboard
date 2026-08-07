import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { brDateKey } from "@/lib/email";

// Planos com price > 0. Trials contribuem R$ 0 no ranking de receita, então
// não há motivo para carregá-los do banco só para descartá-los na ordenação.
const PAID_PLAN_IDS = Object.entries(PLANS)
  .filter(([, def]) => def.price > 0)
  .map(([id]) => id);

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_COOKIE)?.value;
    if (!token || !verifyAdminToken(token)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") ?? "30d";
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Início do dia no fuso de SÃO PAULO, não no do servidor.
    //
    // `new Date().setHours(0,0,0,0)` usa o fuso do processo. Em produção o
    // servidor roda em UTC, então "hoje" começava à meia-noite UTC = 21h do dia
    // ANTERIOR em Brasília, e o card "Visualizações hoje" somava as três horas
    // mais movimentadas da noite passada — todo santo dia. O resto do projeto
    // agrupa por `brDateKey()` justamente para não fazer isso; aqui a rota
    // divergia sozinha.
    //
    // Montamos a partir da chave YYYY-MM-DD em BR com offset fixo -03:00: o
    // Brasil não observa horário de verão desde 2019, então não há ambiguidade.
    const todayStart = new Date(`${brDateKey()}T00:00:00-03:00`);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const [
      totalViewsToday,
      viewsPeriod,
      uniqueVisitorsRaw,
      errorsPeriod,
      unresolvedErrors,
      activeNow,
      topPagesRaw,
      topCountriesRaw,
      recentErrors,
      activeSessions,
      errorsByTypeRaw,
      paidUsers,
    ] = await Promise.all([
      db.pageView.count({ where: { createdAt: { gte: todayStart } } }),
      db.pageView.findMany({ where: { createdAt: { gte: since } }, select: { sessionId: true, createdAt: true } }),
      db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT "sessionId") as count
        FROM "PageView"
        WHERE "createdAt" >= ${since}
      `,
      db.errorLog.count({ where: { createdAt: { gte: since } } }),
      db.errorLog.count({ where: { resolved: false } }),
      db.activeSession.count({ where: { lastSeen: { gte: fiveMinutesAgo } } }),
      db.$queryRaw<{ path: string; views: bigint; unique: bigint }[]>`
        SELECT path, COUNT(*) as views, COUNT(DISTINCT "sessionId") as unique
        FROM "PageView"
        WHERE "createdAt" >= ${since}
        GROUP BY path
        ORDER BY views DESC
        LIMIT 10
      `,
      db.$queryRaw<{ country: string; views: bigint }[]>`
        SELECT country, COUNT(*) as views
        FROM "PageView"
        WHERE "createdAt" >= ${since} AND country IS NOT NULL
        GROUP BY country
        ORDER BY views DESC
        LIMIT 10
      `,
      db.errorLog.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, path: true, errorType: true, errorMessage: true, statusCode: true, resolved: true, fixSuggestion: true, createdAt: true },
      }),
      db.activeSession.findMany({
        where: { lastSeen: { gte: fiveMinutesAgo } },
        orderBy: { lastSeen: "desc" },
        select: { sessionId: true, userId: true, path: true, country: true, lastSeen: true },
        // Teto generoso: a janela é de 5 minutos, então 500 sessões simultâneas
        // está muito acima do tráfego real — o take só protege a resposta de
        // crescer sem limite num pico ou num flood de sessões sintéticas.
        take: 500,
      }),
      db.$queryRaw<{ errorType: string; count: bigint }[]>`
        SELECT "errorType", COUNT(*) as count
        FROM "ErrorLog"
        WHERE "createdAt" >= ${since}
        GROUP BY "errorType"
        ORDER BY count DESC
      `,
      db.user.findMany({
        // Só assinantes de plano pago: trial tem price 0, nunca entraria no
        // top 10 de receita — filtrar no banco evita varrer a tabela inteira.
        where: { subscription: { plan: { in: PAID_PLAN_IDS } } },
        select: { id: true, email: true, name: true, createdAt: true, subscription: { select: { plan: true, createdAt: true } } },
      }),
    ]);

    // unique visitors in period — COUNT(DISTINCT) no banco, mesmo padrão dos
    // top pages/countries logo acima; sem materializar a janela num Set em JS.
    const uniqueVisitorsPeriod = Number(uniqueVisitorsRaw[0]?.count ?? 0);
    const totalViewsPeriod = viewsPeriod.length;
    const totalErrors = errorsPeriod;
    const errorRate = totalViewsPeriod > 0 ? (totalErrors / totalViewsPeriod) * 100 : 0;

    // views by day — usa fuso BR para o agrupamento (evita salto de dia em UTC).
    //
    // O laço vai até `days` INCLUSIVE, e não `< days`. Com `< days` o último
    // balde criado era `since + (days-1) dias`, ou seja ONTEM: o dia de hoje
    // nunca ganhava balde e o `if (entry)` logo abaixo descartava em silêncio
    // toda visualização das últimas horas. A curva nunca fechava com o card
    // "Visualizações no período" ao lado, que conta a mesma janela.
    //
    // O primeiro balde é parcial por natureza (a query filtra por instante,
    // `createdAt >= since`, então cobre só o pedaço daquele dia depois da hora
    // atual) — por isso a primeira barra é sempre mais baixa. É esperado.
    const dayMap = new Map<string, { views: number; sessions: Set<string> }>();
    for (let i = 0; i <= days; i++) {
      const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
      const key = brDateKey(d);
      if (!dayMap.has(key)) dayMap.set(key, { views: 0, sessions: new Set() });
    }
    for (const v of viewsPeriod) {
      const key = brDateKey(v.createdAt);
      const entry = dayMap.get(key);
      if (entry) {
        entry.views++;
        entry.sessions.add(v.sessionId);
      }
    }
    const viewsByDay = Array.from(dayMap.entries()).map(([date, { views, sessions }]) => ({
      date,
      views,
      unique: sessions.size,
    }));

    // active users with user info
    const userIds = activeSessions.map((s) => s.userId).filter(Boolean) as string[];
    const usersMap = new Map<string, { email: string; name: string | null }>();
    if (userIds.length > 0) {
      const users = await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, name: true },
      });
      for (const u of users) usersMap.set(u.id, { email: u.email, name: u.name });
    }
    const activeUsers = activeSessions.map((s) => {
      const user = s.userId ? usersMap.get(s.userId) : null;
      return {
        sessionId: s.sessionId,
        userId: s.userId,
        userEmail: user?.email ?? null,
        userName: user?.name ?? null,
        path: s.path,
        country: s.country,
        lastSeen: s.lastSeen,
      };
    });

    // revenue ranking
    const revenueRanking = paidUsers
      .map((u) => {
        const plan = u.subscription?.plan ?? "trial";
        const planDef = PLANS[plan];
        const price = planDef?.price ?? 0;
        const subCreatedAt = u.subscription?.createdAt ?? u.createdAt;
        const monthsActive = Math.max(1, Math.ceil((Date.now() - new Date(subCreatedAt).getTime()) / (30 * 24 * 60 * 60 * 1000)));
        const totalPaid = price * monthsActive;
        return { userId: u.id, email: u.email, name: u.name, plan, totalPaid, joinedAt: u.createdAt };
      })
      .sort((a, b) => b.totalPaid - a.totalPaid)
      .slice(0, 10);

    return NextResponse.json({
      overview: {
        totalViewsToday,
        totalViewsPeriod,
        uniqueVisitorsPeriod,
        activeNow,
        totalErrors,
        unresolvedErrors,
        errorRate: Math.round(errorRate * 100) / 100,
      },
      viewsByDay,
      topPages: topPagesRaw.map((r) => ({ path: r.path, views: Number(r.views), unique: Number(r.unique) })),
      topCountries: topCountriesRaw.map((r) => ({ country: r.country, views: Number(r.views) })),
      recentErrors,
      activeUsers,
      revenueRanking,
      errorsByType: errorsByTypeRaw.map((r) => ({ errorType: r.errorType, count: Number(r.count) })),
    });
  } catch (err) {
    console.error("Analytics API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
