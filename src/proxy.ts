import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const isLoggedIn = !!session?.user;

  const isAuthPage = nextUrl.pathname.startsWith("/login");
  const isPublicClient = nextUrl.pathname.startsWith("/cliente");
  const isAgencyRoute =
    nextUrl.pathname.startsWith("/dashboard") ||
    nextUrl.pathname.startsWith("/integracoes") ||
    nextUrl.pathname.startsWith("/workspaces");

  // Deixa rotas públicas passarem
  if (isPublicClient) return NextResponse.next();

  // Redireciona para login se não autenticado
  if (!isLoggedIn && !isAuthPage) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  const role = session?.user?.role;
  const workspaceSlug = (session?.user as { workspaceSlug?: string })?.workspaceSlug;

  // Redireciona usuário já logado que tenta acessar /login
  if (isLoggedIn && isAuthPage) {
    if (role === "CLIENT" && workspaceSlug) {
      return NextResponse.redirect(new URL(`/workspace/${workspaceSlug}`, nextUrl));
    }
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  // Clientes não podem acessar rotas da agência
  if (isLoggedIn && role === "CLIENT" && isAgencyRoute) {
    if (workspaceSlug) {
      return NextResponse.redirect(new URL(`/workspace/${workspaceSlug}`, nextUrl));
    }
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  // Agência não pode acessar portal do cliente autenticado
  if (isLoggedIn && role === "AGENCY" && nextUrl.pathname.startsWith("/workspace/")) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
