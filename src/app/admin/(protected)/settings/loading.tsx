import { Settings, Shield } from "lucide-react";

import { Skeleton } from "../../_components/admin-ui";

/**
 * Esqueleto de /admin/settings — page.tsx é Server Component com quatro
 * counts do Prisma antes do primeiro HTML, o mesmo cenário do loading.tsx do
 * Financeiro. Chrome estático (h1, títulos dos painéis) em texto; contagens,
 * checagens de env e planos em bloco. Geometria de page.tsx, no mesmo
 * `bg-slate-900/60` desta tela (ela não usa glass-panel).
 */
export default function CarregandoConfiguracoes() {
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
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={14} className="text-slate-400" />
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Variáveis de Ambiente</h2>
          </div>
          <div>
            {["w-32", "w-40", "w-32", "w-56", "w-36", "w-52", "w-44", "w-40", "w-48"].map((largura, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 border-b border-slate-800/60 last:border-0">
                <Skeleton className={`h-3.5 ${largura}`} />
                <Skeleton className="h-3.5 w-24" />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Banco de Dados</h2>
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="bg-slate-800/40 rounded-xl p-3 flex flex-col items-center gap-1.5">
                  <Skeleton className="h-6 w-12" />
                  <Skeleton className="h-2 w-16" />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Planos Configurados</h2>
            <div className="space-y-2.5">
              {["w-40", "w-48", "w-44"].map((largura, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className={`h-3.5 ${largura}`} />
                  <Skeleton className="h-3.5 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-amber-500/5 border border-amber-500/15 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <Shield size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">Segurança Admin</p>
            {["w-2/3", "w-1/2", "w-3/5", "w-3/4", "w-1/2"].map((largura, i) => (
              <Skeleton key={i} className={`h-2.5 ${largura}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
