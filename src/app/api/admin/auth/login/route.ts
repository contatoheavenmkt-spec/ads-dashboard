import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { signAdminToken, setAdminCookie, logAdminAction } from "@/lib/admin-auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/email";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Confere a senha contra ADMIN_PASSWORD_HASH (bcrypt) quando existir; só cai
 * para ADMIN_PASSWORD em texto puro se o hash não estiver configurado, para
 * não travar um deploy antigo. Guardar hash significa que ler o .env não
 * entrega mais a senha utilizável.
 */
async function senhaConfere(informada: string): Promise<boolean> {
  const hash = process.env.ADMIN_PASSWORD_HASH ?? "";
  if (hash.startsWith("$2")) {
    return bcrypt.compare(informada, hash);
  }
  const texto = process.env.ADMIN_PASSWORD ?? "";
  return texto.length > 0 && safeEqual(informada, texto);
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);

  // Rate limit por IP. 10 tentativas / 10 min: com bcrypt cost 12 no caminho,
  // brute force online segue inviável (10 chutes a cada 10 min), mas dá folga
  // para quem erra a senha algumas vezes. Com 5 era fácil um humano se trancar
  // fora por 10 minutos digitando errado.
  const rl = rateLimit(`admin-login:${ip}`, 10, 10 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente em alguns minutos." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  // O campo continua chegando como `email` do formulário, mas o valor agora é
  // um nome de usuário simples ("admin"). normalizeEmail só faz trim+lowercase,
  // então serve para os dois formatos.
  const usuario = normalizeEmail(body?.email ?? body?.usuario ?? body?.username);
  const password = typeof body?.password === "string" ? body.password : "";

  const adminUser = normalizeEmail(process.env.ADMIN_EMAIL);
  const temSenha = !!(process.env.ADMIN_PASSWORD_HASH ?? process.env.ADMIN_PASSWORD);

  if (!adminUser || !temSenha) {
    return NextResponse.json({ error: "Admin não configurado" }, { status: 503 });
  }

  // Sem delay artificial: as duas verificações abaixo rodam SEMPRE, e o tempo
  // de resposta é dominado pelo bcrypt (~250ms) tanto para usuário errado
  // quanto para senha errada. O `setTimeout(400)` que existia aqui era um
  // resquício de quando a comparação era só string — hoje só somava 400ms
  // à espera do operador sem proteger nada.
  const usuarioOk = safeEqual(usuario, adminUser);
  const senhaOk = await senhaConfere(password);

  if (!usuarioOk || !senhaOk) {
    // Fire-and-forget: o log de auditoria é uma ida ao Supabase (~190ms) e
    // não deve entrar no caminho crítico da resposta. logAdminAction já
    // engole os próprios erros.
    void logAdminAction("admin_login_falhou", undefined, { usuario }, ip);
    return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
  }

  let token: string;
  try {
    token = signAdminToken();
  } catch {
    // ADMIN_SECRET ausente/curto — falha fechado em vez de assinar com um
    // segredo previsível.
    return NextResponse.json({ error: "Admin não configurado" }, { status: 503 });
  }

  void logAdminAction("admin_login", undefined, undefined, ip);
  const res = NextResponse.json({ ok: true });
  return setAdminCookie(res, token);
}
