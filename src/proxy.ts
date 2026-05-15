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
  const isPublicPage =
    nextUrl.pathname.startsWith("/page") ||
    nextUrl.pathname.startsWith("/privacy") ||
    nextUrl.pathname.startsWith("/terms") ||
    nextUrl.pathname.startsWith("/about") ||
    nextUrl.pathname.startsWith("/data-deletion");
  const isAgencyRoute =
    nextUrl.pathname.startsWith("/dashboard") ||
    nextUrl.pathname.startsWith("/integracoes") ||
    nextUrl.pathname.startsWith("/workspaces");
  const isPasswordChange = nextUrl.pathname.startsWith("/account/change-password");

  if (isPublicClient || isPublicPage) return NextResponse.next();

  if (!isLoggedIn && !isAuthPage) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  const role = (session?.user as { role?: string })?.role;
  const workspaceSlug = (session?.user as { workspaceSlug?: string })?.workspaceSlug;
  const forcePasswordChange = !!(session?.user as { forcePasswordChange?: boolean })?.forcePasswordChange;

  // Usuário com senha temporária só pode acessar a página de troca de senha.
  if (isLoggedIn && forcePasswordChange && !isPasswordChange) {
    return NextResponse.redirect(new URL("/account/change-password", nextUrl));
  }

  if (isLoggedIn && isAuthPage) {
    if (forcePasswordChange) {
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
