import { AlertTriangle, BadgeCheck, Clock, CreditCard } from "lucide-react";

import { CardKpi, Secao, Skeleton } from "../../_components/admin-ui";

/**
 * Esqueleto de /admin/subscriptions — mesmas regras do loading.tsx do
 * Financeiro: chrome estático em texto, dado em bloco, geometria de page.tsx
 * (cabeçalho com dois botões, Panorama em `grid-cols-2 lg:grid-cols-4`,
 * painel de filtros `p-3.5` e tabela em glass-panel).
 */
export default function CarregandoAssinaturas() {
  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho: a linha de apoio usa o MESMO texto da primeira carga do
          client; os botões "Atualizar" e "Exportar CSV" viram blocos. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-blue-500/10 ring-1 ring-inset ring-blue-500/25 text-blue-400 grid place-items-center shrink-0">
            <CreditCard size={19} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black text-slate-100 tracking-tight leading-tight">Assinaturas</h1>
            <p className="text-xs text-slate-500 mt-1 tabular-nums">Carregando assinaturas...</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28 rounded-xl" />
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
      </div>

      <div className="space-y-3">
        <Secao titulo="Panorama" descricao="Contagens da página carregada; o total considera o filtro inteiro." />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <CardKpi titulo="Total no filtro" icone={<CreditCard size={16} />} carregando destaque />
          <CardKpi titulo="Ativas" icone={<BadgeCheck size={16} />} carregando />
          <CardKpi titulo="Em teste" icone={<Clock size={16} />} carregando />
          <CardKpi titulo="Vencidas" icone={<AlertTriangle size={16} />} carregando />
        </div>
      </div>

      {/* Painel de filtros: cabeçalho curto + fileira de campos de 40px. */}
      <div className="glass-panel rounded-2xl p-3.5 space-y-3">
        <Skeleton className="h-3.5 w-20" />
        <div className="flex flex-wrap items-center gap-2.5">
          <Skeleton className="h-10 flex-1 min-w-[220px] rounded-xl" />
          <Skeleton className="h-10 w-36 rounded-xl" />
          <Skeleton className="h-10 w-36 rounded-xl" />
          <Skeleton className="h-10 w-40 rounded-xl" />
        </div>
      </div>

      <Secao
        className="-mb-3"
        titulo="Assinaturas"
        descricao="Clique no nome para abrir a conta; em Gerenciar para trocar plano, status ou estender o trial."
      />

      {/* Tabela: larguras variadas de propósito — blocos idênticos parecem
          grade quebrada, não conteúdo chegando (como o TabelaSkeleton real). */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-700/50">
          <Skeleton className="h-2.5 w-full max-w-lg" />
        </div>
        <ul className="divide-y divide-slate-800/40">
          {["w-44", "w-36", "w-52", "w-40", "w-48", "w-36"].map((largura, i) => (
            <li key={i} className="px-5 py-4 flex items-center gap-4">
              <Skeleton className={`h-3 ${largura}`} />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3 w-24 ml-auto" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
