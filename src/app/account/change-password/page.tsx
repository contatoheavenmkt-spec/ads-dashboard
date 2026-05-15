import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "./form";

export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const forced = !!(session.user as { forcePasswordChange?: boolean }).forcePasswordChange;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-xl font-bold text-gray-900">Trocar senha</h1>
        {forced && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
            Você precisa trocar sua senha antes de continuar usando a plataforma.
          </p>
        )}
        <p className="text-sm text-gray-500 mt-2">
          Escolha uma nova senha com no mínimo 6 caracteres.
        </p>
        <div className="mt-6">
          <ChangePasswordForm />
        </div>
      </div>
    </div>
  );
}
