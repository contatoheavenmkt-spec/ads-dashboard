import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { formatCurrency } from "@/lib/utils";
import { Settings, Shield, CheckCircle, XCircle } from "lucide-react";

function EnvCheck({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-800/60 last:border-0">
      <span className="text-sm text-slate-300 font-mono">{label}</span>
      {value ? (
        <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
          <CheckCircle size={13} /> Configurado
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-xs font-bold text-red-400">
          <XCircle size={13} /> Ausente
        </span>
      )}
    </div>
  );
}

export default async function SettingsPage() {
  const [totalUsers, totalWorkspaces, totalIntegrations, totalLogs] = await Promise.all([
    db.user.count(),
    db.workspace.count(),
    db.integration.count(),
    db.adminLog.count(),
  ]);

  const envVars = [
    { label: "ADMIN_EMAIL", value: !!process.env.ADMIN_EMAIL },
    { label: "ADMIN_PASSWORD", value: !!process.env.ADMIN_PASSWORD },
    { label: "ADMIN_SECRET", value: !!process.env.ADMIN_SECRET },
    { label: "AUTH_SECRET / NEXTAUTH_SECRET", value: !!(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET) },
    { label: "DATABASE_URL", value: !!process.env.DATABASE_URL },
    { label: "META_MARKETING_APP_ID", value: !!process.env.META_MARKETING_APP_ID },
    { label: "GOOGLE_CLIENT_ID", value: !!process.env.GOOGLE_CLIENT_ID },
    { label: "STRIPE_SECRET_KEY", value: !!process.env.STRIPE_SECRET_KEY },
    { label: "NEXT_PUBLIC_APP_URL", value: !!process.env.NEXT_PUBLIC_APP_URL },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-black text-white flex items-center gap-2">
          <Settings size={20} className="text-slate-400" />
          Configurações Internas
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Status do sistema e variáveis de ambiente</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Env vars */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={14} className="text-slate-400" />
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Variáveis de Ambiente</h2>
          </div>
          <div>
            {envVars.map((env) => <EnvCheck key={env.label} label={env.label} value={env.value} />)}
          </div>
        </div>

        {/* DB counts */}
        <div className="space-y-4">
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Banco de Dados</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Usuários", value: totalUsers },
                { label: "Workspaces", value: totalWorkspaces },
                { label: "Integrações", value: totalIntegrations },
                { label: "Logs Admin", value: totalLogs },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-800/40 rounded-xl p-3 text-center">
                  <p className="text-xl font-black text-white">{value}</p>
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Planos ativos */}
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Planos Configurados</h2>
            <div className="space-y-2.5">
              {Object.entries(PLANS).map(([key, def]) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium text-white">{def.name}</span>
                    <span className="text-slate-500 text-xs ml-2">{def.accountsLimit} contas · {def.maxPlatforms ?? "∞"} plataformas</span>
                  </div>
                  <span className="font-bold text-slate-300 text-xs">
                    {def.price > 0 ? formatCurrency(def.price) + "/mês" : "Grátis"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Aviso de segurança */}
      <div className="bg-amber-500/5 border border-amber-500/15 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <Shield size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">Segurança Admin</p>
            <ul className="text-[11px] text-slate-400 space-y-0.5 list-disc list-inside">
              <li>Senhas de usuários nunca são exibidas — armazenadas com bcrypt</li>
              <li>A sessão admin expira em 8 horas automaticamente</li>
              <li>Todas as ações admin são registradas nos logs</li>
              <li>O acesso admin está protegido por variáveis de ambiente (não hardcoded)</li>
              <li>A rota <code className="bg-slate-800 px-1 py-0.5 rounded text-slate-300">/admin</code> é inacessível para usuários comuns pelo middleware</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
