import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, getClientIp, gcRateLimit } from "@/lib/rate-limit";

function getFixSuggestion(errorType: string, statusCode?: number): string {
  if (statusCode === 404) return "Verificar se a rota/recurso existe. Checar links e dynamic routes no App Router.";
  if (statusCode === 500) return "Erro interno do servidor. Verificar logs do servidor e exceções não tratadas.";
  if (statusCode === 401 || statusCode === 403) return "Erro de autenticação/autorização. Verificar middleware e callbacks da sessão.";
  if (errorType === "TypeError") return "Verificar se variáveis não são null/undefined antes de acessar propriedades.";
  if (errorType === "SyntaxError") return "Verificar sintaxe do código JavaScript/JSON.";
  if (errorType === "NetworkError" || errorType === "fetch failed") return "Verificar conectividade e endpoints de API.";
  return "Analisar stack trace completo. Verificar logs do servidor para mais contexto.";
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);

    // Rate limit: 30 errors / min por IP — evita flood que enche ErrorLog.
    gcRateLimit();
    const rl = rateLimit(`err:${ip}`, 30, 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ ok: true, throttled: true });
    }

    const body = await req.json();
    const path = typeof body?.path === "string" ? body.path.slice(0, 500) : "";
    const errorType = typeof body?.errorType === "string" ? body.errorType.slice(0, 100) : "Unknown";
    const errorMessage = typeof body?.errorMessage === "string" ? body.errorMessage.slice(0, 2000) : "";
    const statusCode = typeof body?.statusCode === "number" ? body.statusCode : null;
    const stackTrace = typeof body?.stackTrace === "string" ? body.stackTrace.slice(0, 5000) : null;
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.slice(0, 100) : null;
    const userId = typeof body?.userId === "string" ? body.userId.slice(0, 50) : null;

    const ipForDb = ip === "unknown" ? null : ip;

    const fixSuggestion = getFixSuggestion(errorType, statusCode ?? undefined);

    await db.errorLog.create({
      data: {
        path,
        statusCode,
        errorType,
        errorMessage,
        stackTrace,
        sessionId,
        userId,
        ip: ipForDb,
        fixSuggestion,
      },
    });
  } catch {
    // analytics never breaks the app
  }
  return NextResponse.json({ ok: true });
}
