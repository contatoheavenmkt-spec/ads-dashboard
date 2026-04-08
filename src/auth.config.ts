import type { NextAuthConfig } from "next-auth";

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
      }

      // Se workspaceId está null no token, revalida no banco (pode ter sido criado após o login)
      if (!token.workspaceId && token.id) {
        try {
          const { db } = await import("@/lib/db");
          const fresh = await db.user.findUnique({
            where: { id: token.id as string },
            select: { workspaceId: true, workspace: { select: { slug: true } }, onboardingCompleted: true },
          });
          if (fresh?.workspaceId) {
            token.workspaceId = fresh.workspaceId;
            token.workspaceSlug = fresh.workspace?.slug ?? null;
            token.onboardingCompleted = fresh.onboardingCompleted;
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
