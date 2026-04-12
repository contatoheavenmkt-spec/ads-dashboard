import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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
    const body = await req.json();
    const { path, errorType, errorMessage, statusCode, stackTrace, sessionId, userId } = body;

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null;
    const country =
      req.headers.get("cf-ipcountry") ||
      req.headers.get("x-vercel-ip-country") ||
      "BR";

    const fixSuggestion = getFixSuggestion(errorType, statusCode);

    await db.errorLog.create({
      data: {
        path,
        statusCode: statusCode ?? null,
        errorType,
        errorMessage,
        stackTrace: stackTrace ?? null,
        sessionId: sessionId ?? null,
        userId: userId ?? null,
        ip,
        fixSuggestion,
      },
    });
  } catch {
    // analytics never breaks the app
  }
  return NextResponse.json({ ok: true });
}
