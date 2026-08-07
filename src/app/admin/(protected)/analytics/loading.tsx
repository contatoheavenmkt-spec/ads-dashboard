import { Activity, AlertTriangle, Clock, Eye, Target, TrendingUp, Users } from "lucide-react";

import { CardKpi, Secao, Skeleton } from "../../_components/admin-ui";

/**
 * Esqueleto de /admin/analytics — mesmas regras do loading.tsx do Financeiro:
 * chrome estático em texto, dado em bloco, geometria de page.tsx (`space-y-8`,
 * h1 em gradiente, 6 KPIs, gráfico de 260px). O resto fica abaixo da dobra.
 */
export default function CarregandoAnalytics() {
  return (
    <div className="p-6 space-y-8">
      {/* Cabeçalho fixo; à direita, seletor de período e recarregar. */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_10px_2px_rgba(59,130,246,0.55)]" />
            <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.22em]">Painel administrativo</p>
          </div>
          <h1 className="mt-2.5 text-3xl md:text-4xl font-black tracking-tight bg-gradient-to-br from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            Analytics
          </h1>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed max-w-xl">
            Tráfego, presença em tempo real, erros do sistema e ranking de receita da plataforma.
          </p>
          <p className="text-[11px] text-slate-500 mt-3 flex items-center gap-1.5">
            <Clock size={11} className="shrink-0" />
            Carregando indicadores…
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-9 w-52 rounded-xl" />
          <Skeleton className="h-9 w-9 rounded-xl" />
        </div>
      </header>

      <section className="space-y-4">
        <Secao titulo="Visão geral" descricao="Visualizações e visitantes na janela selecionada. “Ativos agora” e “erros não resolvidos” são a foto do momento." />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <CardKpi titulo="Visualizações hoje" icone={<Eye size={16} />} carregando destaque />
          <CardKpi titulo="Visualizações no período" icone={<TrendingUp size={16} />} carregando />
          <CardKpi titulo="Visitantes únicos" icone={<Users size={16} />} carregando />
          <CardKpi titulo="Ativos agora" icone={<Activity size={16} />} carregando />
          <CardKpi titulo="Erros não resolvidos" icone={<AlertTriangle size={16} />} carregando />
          <CardKpi titulo="Taxa de erros" icone={<Target size={16} />} carregando />
        </div>
      </section>

      {/* Gráfico de visualizações por dia: 260px, a altura do desenho real. */}
      <section className="space-y-4">
        <Secao titulo="Tráfego" descricao="Visualizações de página por dia na janela selecionada." />
        <div className="glass-panel rounded-2xl p-5 min-w-0 ring-1 ring-slate-100/[0.03]">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <h3 className="text-[11px] font-black text-slate-300 uppercase tracking-widest">Visualizações por dia</h3>
              <Skeleton className="h-2 w-44 max-w-full" />
            </div>
            <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
          </div>
          <Skeleton className="h-[260px] w-full rounded-xl" />
        </div>
      </section>

      <section className="space-y-4">
        <Secao titulo="Origem do tráfego" descricao="Onde os acessos entram e de onde eles vêm." />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
          {["Top páginas", "Distribuição por país"].map((titulo) => (
            <div key={titulo} className="glass-panel rounded-2xl p-5 min-w-0 ring-1 ring-slate-100/[0.03] space-y-4">
              <h3 className="text-[11px] font-black text-slate-300 uppercase tracking-widest">{titulo}</h3>
              {["w-3/4", "w-2/3", "w-1/2", "w-2/5"].map((largura, i) => (
                <Skeleton key={i} className={`h-3 ${largura}`} />
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
