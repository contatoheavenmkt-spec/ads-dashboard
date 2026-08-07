import { UserCheck, Users, UserX, Wifi } from "lucide-react";

import { CardKpi, Secao, Skeleton } from "../../_components/admin-ui";

/**
 * Esqueleto de /admin/accounts — mesmas regras do loading.tsx do Financeiro:
 * só chrome estático vira texto, dado vira bloco cinza, e a geometria segue
 * page.tsx (cabeçalho, Panorama em `grid-cols-2 lg:grid-cols-4`, painel de
 * filtros `p-3.5` e tabela em glass-panel) para não haver salto de layout.
 */
export default function CarregandoContas() {
  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho: tudo fixo, menos o carimbo de hora (que só existe após a
          primeira leitura) e o botão "Atualizar", que reserva o espaço. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-blue-500/10 ring-1 ring-inset ring-blue-500/25 text-blue-400 grid place-items-center shrink-0">
            <Users size={19} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black text-slate-100 tracking-tight leading-tight">Contas</h1>
            <p className="text-xs text-slate-500 mt-1">Gestão de usuários da plataforma</p>
          </div>
        </div>
        <Skeleton className="h-10 w-28 rounded-xl" />
      </div>

      <div className="space-y-3">
        <Secao titulo="Panorama" descricao="Contagens da base filtrada." />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <CardKpi titulo="Total de usuários" icone={<Users size={16} />} carregando destaque />
          <CardKpi titulo="Online agora" icone={<Wifi size={16} />} carregando />
          <CardKpi titulo="Ativos (30 dias)" icone={<UserCheck size={16} />} carregando />
          <CardKpi titulo="Inativos" icone={<UserX size={16} />} carregando />
        </div>
      </div>

      {/* Painel de filtros: cabeçalho curto + fileira de campos de 40px, a
          mesma altura dos inputs/selects reais. */}
      <div className="glass-panel rounded-2xl p-3.5 space-y-3">
        <Skeleton className="h-3.5 w-20" />
        <div className="flex flex-wrap items-center gap-2.5">
          <Skeleton className="h-10 flex-1 min-w-[220px] rounded-xl" />
          <Skeleton className="h-10 w-36 rounded-xl" />
          <Skeleton className="h-10 w-36 rounded-xl" />
          <Skeleton className="h-10 w-36 rounded-xl" />
        </div>
      </div>

      <Secao
        className="-mb-3"
        titulo="Usuários"
        descricao={'Use "Ver conta", no fim da linha, para abrir o perfil completo do usuário.'}
      />

      {/* Tabela: faixa de cabeçalho + linhas com larguras variadas de
          propósito — blocos idênticos parecem grade quebrada, não conteúdo
          chegando (mesma decisão do TabelaSkeleton de Assinaturas). */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-700/50">
          <Skeleton className="h-2.5 w-full max-w-lg" />
        </div>
        <ul className="divide-y divide-slate-800/40">
          {["w-40", "w-52", "w-36", "w-48", "w-44", "w-56"].map((largura, i) => (
            <li key={i} className="px-5 py-4 flex items-center gap-4">
              <Skeleton className="w-8 h-8 rounded-full shrink-0" />
              <Skeleton className={`h-3 ${largura}`} />
              <Skeleton className="h-3 w-24 ml-auto" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
