import type { NextAuthConfig } from "next-auth";

const REVALIDATE_MS = 5 * 60 * 1000; // 5 min — limita "JWT stale" sem onerar cada request

export const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET,
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
        token.workspaceId = (user as { workspaceId?: string }).workspaceId;
        token.workspaceSlug = (user as { workspaceSlug?: string | null }).workspaceSlug;
        token.onboardingCompleted = (user as { onboardingCompleted?: boolean }).onboardingCompleted ?? false;
        token.forcePasswordChange = (user as { forcePasswordChange?: boolean }).forcePasswordChange ?? false;
        token._revAt = Date.now();
      }

      // Revalida do banco quando:
      //  - workspaceId está null no token (caso clássico de "ainda não criou"); ou
      //  - faz mais de REVALIDATE_MS desde a última revalidação (pega mudanças
      //    de role / forcePasswordChange / plano feitas pelo admin).
      //
      // OBS: este callback também roda no middleware (edge), onde Prisma não
      // está disponível — o try/catch silencia o erro. Em deploy edge, a
      // revalidação só funciona em server components/route handlers (Node runtime).
      // O middleware aceita JWT potencialmente stale; rotas sensíveis devem
      // revalidar do DB por conta própria (ex.: /api/auth/change-password).
      const lastRev = (token as { _revAt?: number })._revAt ?? 0;
      const isStale = Date.now() - lastRev > REVALIDATE_MS;
      if (token.id && (!token.workspaceId || isStale)) {
        try {
          const { db } = await import("@/lib/db");
          const fresh = await db.user.findUnique({
            where: { id: token.id as string },
            select: {
              role: true,
              workspaceId: true,
              workspace: { select: { slug: true } },
              onboardingCompleted: true,
              forcePasswordChange: true,
            },
          });
          if (fresh) {
            token.role = fresh.role;
            token.workspaceId = fresh.workspaceId ?? undefined;
            token.workspaceSlug = fresh.workspace?.slug ?? null;
            token.onboardingCompleted = fresh.onboardingCompleted;
            token.forcePasswordChange = fresh.forcePasswordChange;
            token._revAt = Date.now();
          }
        } catch { /* silencia erros de DB no middleware edge */ }
      }

      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.workspaceId = token.workspaceId as string | undefined;
        session.user.workspaceSlug = token.workspaceSlug as string | undefined;
        session.user.onboardingCompleted = token.onboardingCompleted as boolean;
        session.user.forcePasswordChange = (token as { forcePasswordChange?: boolean }).forcePasswordChange ?? false;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
};
