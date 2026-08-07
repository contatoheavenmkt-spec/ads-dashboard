import {
  AlertTriangle, Clock, CreditCard, DollarSign, LayoutDashboard,
  Plug, Target, TrendingUp, UserCheck, Users,
} from "lucide-react";

import { CardKpi, Secao, Skeleton } from "../_components/admin-ui";

/**
 * Esqueleto de /admin (dashboard) — mesmo papel e mesmas regras do loading.tsx
 * do Financeiro: cobre a NAVEGAÇÃO antes de o bundle client pintar o próprio
 * skeleton; chrome estático vira texto, dado vira bloco; e a geometria copia
 * page.tsx (`p-4 gap-3` = CLASSE_KPI, com o MRR fora dele como lá). O WorldMap
 * fica de fora: terceira dobra e fonte de dados própria.
 */
export default function CarregandoDashboard() {
  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho fixo; à direita, o lugar do seletor de período e do botão
          de recarregar. O sufixo é o texto da primeira carga do client. */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-blue-500/10 ring-1 ring-inset ring-blue-500/25 text-blue-400 grid place-items-center shrink-0">
            <LayoutDashboard size={19} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black text-slate-100 tracking-tight leading-tight">Dashboard</h1>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-2xl">
              Receita, base de clientes e saúde operacional do Dashfy em uma tela só.
              <span className="tabular-nums">{" · "}carregando indicadores…</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-9 w-52 rounded-xl" />
          <Skeleton className="h-9 w-9 rounded-xl" />
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-x-4 gap-y-3">
        <div className="col-span-full">
          <Secao titulo="Receita e base" descricao="Foto do estado atual — estes números não mudam com o período selecionado." />
        </div>
        <CardKpi titulo="MRR" icone={<DollarSign size={16} />} carregando destaque />
        <CardKpi titulo="ARR" icone={<TrendingUp size={16} />} carregando className="p-4 gap-3" />
        <CardKpi titulo="ARPU" icone={<CreditCard size={16} />} carregando className="p-4 gap-3" />
        <CardKpi titulo="Assinantes ativos" icone={<UserCheck size={16} />} carregando className="p-4 gap-3" />
        <CardKpi titulo="Usuários totais" icone={<Users size={16} />} carregando className="p-4 gap-3" />

        <div className="col-span-full mt-1 pt-3 border-t border-slate-700/50">
          <Secao titulo="Funil e alarmes" descricao="Trial vencido continua em “trialing” até alguém processar — é dinheiro parado. Integração com erro significa cliente vendo dado desatualizado." />
        </div>
        <CardKpi titulo="Em trial" icone={<Clock size={16} />} carregando className="p-4 gap-3" />
        <CardKpi titulo="Taxa de conversão" icone={<Target size={16} />} carregando className="p-4 gap-3" />
        <CardKpi titulo="Trials vencidos" icone={<AlertTriangle size={16} />} carregando className="p-4 gap-3" />
        <CardKpi titulo="Inadimplentes" icone={<CreditCard size={16} />} carregando className="p-4 gap-3" />
        <CardKpi titulo="Integrações com erro" icone={<Plug size={16} />} carregando className="p-4 gap-3" />
      </section>

      {/* Quatro cartões de gráfico; o desenho tem os 220px do real. */}
      <section className="space-y-3">
        <Secao titulo="Séries históricas" descricao="Os únicos blocos da tela que respondem ao período selecionado no topo." />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
          {["Receita mensal", "Churn mensal", "Receita por plano", "Usuários ativos vs inativos"].map((titulo) => (
            <div key={titulo} className="glass-panel rounded-2xl p-5 min-w-0 ring-1 ring-slate-100/[0.03]">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                  <h3 className="text-[11px] font-black text-slate-300 uppercase tracking-widest">{titulo}</h3>
                  <Skeleton className="h-2 w-44 max-w-full" />
                </div>
                <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
              </div>
              <Skeleton className="h-[220px] w-full rounded-xl" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
