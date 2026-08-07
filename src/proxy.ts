import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse } from "next/server";
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin-auth";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const isLoggedIn = !!session?.user;

  // ─── Admin routes — autenticação separada ─────────────────────────────────
  const isAdminRoute = nextUrl.pathname.startsWith("/admin");
  const isAdminLogin = nextUrl.pathname === "/admin/login";

  if (isAdminRoute) {
    if (isAdminLogin) return NextResponse.next();
    const token = req.cookies.get(ADMIN_COOKIE)?.value ?? null;
    if (!token || !verifyAdminToken(token)) {
      return NextResponse.redirect(new URL("/admin/login", nextUrl));
    }
    return NextResponse.next();
  }

  const isAuthPage = nextUrl.pathname.startsWith("/login") || nextUrl.pathname.startsWith("/cadastro");
  const isPublicClient = nextUrl.pathname.startsWith("/cliente");
  // /r/<slug> é o redirecionador do Track: quem passa por ali clicou num
  // anúncio pago e precisa ir direto ao WhatsApp. Sem esta linha o clique
  // cai na tela de login e a campanha do cliente vira prejuízo.
  const isTrackRedirect = nextUrl.pathname.startsWith("/r/");
  const isPublicPage =
    nextUrl.pathname.startsWith("/page") ||
    nextUrl.pathname.startsWith("/privacy") ||
    nextUrl.pathname.startsWith("/terms") ||
    nextUrl.pathname.startsWith("/about") ||
    nextUrl.pathname.startsWith("/data-deletion");
  const isAgencyRoute =
    nextUrl.pathname.startsWith("/dashboard") ||
    nextUrl.pathname.startsWith("/integracoes") ||
    nextUrl.pathname.startsWith("/workspaces") ||
    // /crm e /track são telas consolidadas da agência: mostram dados de todos
    // os clientes ao mesmo tempo. As APIs por trás já exigem role AGENCY, mas
    // sem estarem listadas aqui um CLIENT logado abria a página e via uma tela
    // de erro em vez de ser mandado para o painel dele.
    nextUrl.pathname.startsWith("/crm") ||
    nextUrl.pathname.startsWith("/track");
  const isPasswordChange = nextUrl.pathname.startsWith("/account/change-password");

  if (isPublicClient || isPublicPage || isTrackRedirect) return NextResponse.next();

  if (!isLoggedIn && !isAuthPage) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  const role = (session?.user as { role?: string })?.role;
  const workspaceSlug = (session?.user as { workspaceSlug?: string })?.workspaceSlug;
  const forcePasswordChange = !!(session?.user as { forcePasswordChange?: boolean })?.forcePasswordChange;
  const impersonatedBy = (session?.user as { impersonatedBy?: string })?.impersonatedBy;
  const impersonatedUntil = (session?.user as { impersonatedUntil?: number })?.impersonatedUntil;
  const impersonando = isLoggedIn && !!impersonatedBy;
  const destinoImp = role === "CLIENT" && workspaceSlug ? `/workspace/${workspaceSlug}` : "/dashboard";

  // Expiração da impersonação: a decisão sai só do token, nada de banco no edge.
  if (impersonando && (!impersonatedUntil || Date.now() > impersonatedUntil)) {
    return NextResponse.redirect(new URL("/api/admin/impersonate/exit?motivo=expirada", nextUrl));
  }

  // Trocar a senha do cliente é a ação mais destrutiva possível aqui.
  if (impersonando && isPasswordChange) {
    return NextResponse.redirect(new URL(destinoImp, nextUrl));
  }

  // Usuário com senha temporária só pode acessar a página de troca de senha.
  // Durante a impersonação a regra é pulada: /account/change-password exige a
  // senha ATUAL do cliente, que o operador não tem — seria um loop fechado.
  if (isLoggedIn && forcePasswordChange && !impersonando && !isPasswordChange) {
    return NextResponse.redirect(new URL("/account/change-password", nextUrl));
  }

  if (isLoggedIn && isAuthPage) {
    if (forcePasswordChange && !impersonando) {
      return NextResponse.redirect(new URL("/account/change-password", nextUrl));
    }
    if (role === "CLIENT" && workspaceSlug) {
      return NextResponse.redirect(new URL(`/workspace/${workspaceSlug}`, nextUrl));
    }
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  if (isLoggedIn && role === "CLIENT" && isAgencyRoute) {
    if (workspaceSlug) {
      return NextResponse.redirect(new URL(`/workspace/${workspaceSlug}`, nextUrl));
    }
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  // Durante a impersonação o redirect AGENCY→/dashboard é pulado: "ver o que o
  // cliente vê" em /workspace/<slug> é o caso de uso principal da feature.
  if (isLoggedIn && role === "AGENCY" && !impersonando && nextUrl.pathname.startsWith("/workspace/")) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // `icon$` e `apple-icon$` ficam de fora: são as rotas de metadata do Next
    // (src/app/icon.tsx e apple-icon.tsx) que devolvem o PNG do favicon. Elas
    // não têm ponto no caminho, então a regra `.*\..*` não as cobria e o
    // middleware redirecionava o favicon para /login — visitante deslogado
    // ficava sem ícone. O `$` garante que só o caminho exato seja liberado
    // (ex.: /icones continua protegido).
    //
    // `r/` fora do middleware é defesa dupla do redirecionador do Track: o
    // handler já libera a rota, mas sem excluir aqui o Edge ainda decodificaria
    // o JWT de sessão a cada clique de anúncio, gastando latência no caminho
    // mais sensível do produto. Só pega "r" seguido de barra, então rotas como
    // /relatorios seguem protegidas.
    "/((?!api|r/|_next/static|_next/image|favicon.ico|icon$|apple-icon$|.*\\..*).*)",
  ],
};
