import { Link2 } from "lucide-react";

import { Skeleton } from "../../_components/admin-ui";

/**
 * Esqueleto de /admin/integrations — page.tsx é Server Component que consulta
 * o Prisma antes de emitir HTML, o MESMO cenário que motivou o loading.tsx do
 * Financeiro. Regras de lá: chrome estático em texto (h1, rótulos das
 * plataformas seriam dinâmicos na ordem — viram bloco), dado em bloco cinza,
 * geometria de page.tsx (três cards `grid-cols-3` e tabela de seis colunas
 * no mesmo `bg-slate-900/60` que a página usa em vez de glass-panel).
 */
export default function CarregandoIntegracoes() {
  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho fixo; o contador de contas vem do banco, vira bloco. */}
      <div>
        <h1 className="text-xl font-black text-white flex items-center gap-2">
          <Link2 size={20} className="text-cyan-400" />
          Integrações
        </h1>
        <Skeleton className="h-3.5 w-56 mt-1.5" />
      </div>

      {/* Cards por plataforma: badge, número grande e legenda. */}
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
            <Skeleton className="h-4 w-20 rounded-full" />
            <Skeleton className="h-8 w-12 mt-3" />
            <Skeleton className="h-2.5 w-28 mt-2" />
          </div>
        ))}
      </div>

      {/* Tabela: faixa de cabeçalho + linhas com larguras variadas de
          propósito, para ler como conteúdo chegando e não grade quebrada. */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
        <div className="bg-slate-800/50 border-b border-slate-700/50 px-5 py-3.5 flex items-center gap-6">
          {["w-24", "w-20", "w-28", "w-28", "w-20", "w-14"].map((largura, i) => (
            <Skeleton key={i} className={`h-2.5 ${largura}`} />
          ))}
        </div>
        <ul className="divide-y divide-slate-800/40">
          {["w-40", "w-52", "w-36", "w-48", "w-44"].map((largura, i) => (
            <li key={i} className="px-5 py-4 flex items-center gap-6">
              <Skeleton className={`h-3 ${largura}`} />
              <Skeleton className="h-4 w-16 rounded-full" />
              <Skeleton className="h-3 w-24 ml-auto" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
