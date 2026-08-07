import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { authConfig } from "./auth.config";
import { normalizeEmail } from "@/lib/email";
import { IMP_PROVIDER_ID, verifyImpersonationTicket } from "@/lib/impersonation";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = normalizeEmail(credentials.email as string);

        const user = await db.user.findUnique({
          where: { email },
          include: { workspace: true },
        });

        if (!user || !user.password) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          workspaceId: user.workspaceId,
          workspaceSlug: user.workspace?.slug ?? null,
          onboardingCompleted: user.onboardingCompleted,
          forcePasswordChange: user.forcePasswordChange,
        };
      },
    }),

    // Provider EXCLUSIVO da impersonação do painel admin.
    // Não há bcrypt aqui: a única porta é o HMAC do ticket — 60s de validade e
    // uso único —, emitido apenas por /api/admin/impersonate depois de
    // validateAdminRequest. O provider de senha acima não é tocado.
    Credentials({
      id: IMP_PROVIDER_ID, // ← id explícito é OBRIGATÓRIO: sem ele colide com o "credentials" do login dos clientes
      name: "Impersonation",
      credentials: {
        ticket: { label: "Ticket", type: "text" },
      },
      async authorize(credentials) {
        const raw = credentials?.ticket;
        if (typeof raw !== "string") return null;

        const t = verifyImpersonationTicket(raw);
        if (!t) return null;

        const user = await db.user.findUnique({
          where: { id: t.sub },
          include: { workspace: true },
        });

        if (!user) return null;

        const base = {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          workspaceId: user.workspaceId,
          workspaceSlug: user.workspace?.slug ?? null,
          onboardingCompleted: user.onboardingCompleted,
          forcePasswordChange: user.forcePasswordChange,
        };

        // by === null é ticket de RESTAURAÇÃO: devolve sessão limpa, sem marca.
        if (!t.by) return base;

        return { ...base, impersonatedBy: t.by, impersonatedUntil: t.exp };
      },
    }),
  ],
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: string;
      workspaceId?: string;
      workspaceSlug?: string;
      onboardingCompleted: boolean;
      forcePasswordChange: boolean;
      /** Marca da impersonação: "admin:<idDoOperador>" ou "admin". */
      impersonatedBy?: string;
      /** Quando a sessão impersonada expira (epoch ms). */
      impersonatedUntil?: number;
    };
  }
}
