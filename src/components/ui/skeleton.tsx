import { cn } from "@/lib/utils";

/**
 * Bloco cinza animado que ocupa o espaço do conteúdo enquanto carrega.
 * Substitui o spinner — usuário já vê a *forma* do layout, sente que a
 * página tá respondendo. Sensação de velocidade melhora muito mesmo
 * sem mudar tempo real de carregamento.
 *
 * Cor base: slate-800 com leve transparência (combina com glass-panel
 * que é o card padrão do app). `animate-pulse` é built-in do Tailwind.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-slate-700/40", className)}
      {...props}
    />
  );
}

/** Card de KPI vazio — mesma altura e estrutura do KpiCard real. */
export function KpiCardSkeleton() {
  return (
    <div className="glass-panel rounded-xl p-3 sm:p-5 h-24 sm:h-36 flex flex-col justify-between relative overflow-hidden">
      <div className="space-y-2 relative z-10">
        <Skeleton className="h-2 w-20" />
        <Skeleton className="h-6 sm:h-8 w-28" />
      </div>
      {/* Imita o sparkline de fundo do KpiCard */}
      <Skeleton className="absolute bottom-0 left-0 right-0 h-10 rounded-none rounded-b-xl opacity-30" />
    </div>
  );
}

/** Painel de gráfico vazio. height ajusta a altura interna. */
export function ChartSkeleton({ height = "min-h-[200px] sm:min-h-[300px]" }: { height?: string }) {
  return (
    <div className="glass-panel rounded-2xl p-3 sm:p-5 flex flex-col">
      <Skeleton className="h-3 w-32 mb-3 sm:mb-4 mx-auto" />
      <div className={cn("flex-1 w-full flex items-end justify-around gap-1", height)}>
        {/* Barras de altura variada pra parecer um gráfico */}
        {[60, 35, 80, 50, 95, 40, 70, 55, 85, 45, 75, 65].map((h, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-t-md rounded-b-none"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Donut/pie placeholder — círculo cinza animado. */
export function DonutSkeleton() {
  return (
    <div className="glass-panel rounded-2xl p-3 sm:p-5 flex flex-col items-center">
      <Skeleton className="h-3 w-24 mb-4" />
      <Skeleton className="aspect-square w-full max-w-[140px] rounded-full" />
      <div className="mt-3 space-y-2 w-full">
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-2 w-3/4" />
        <Skeleton className="h-2 w-5/6" />
      </div>
    </div>
  );
}

/** Tabela vazia com N linhas placeholder. */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <div className="border-b border-slate-800 bg-slate-900/40 px-4 py-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-2 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-slate-800/40">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3 flex items-center gap-4">
            {Array.from({ length: cols }).map((_, j) => (
              <Skeleton key={j} className="h-3 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton "completão" do bloco principal de uma dash — grid de KPIs +
 * trio de gráficos + tabela. Usado durante loading inicial pra cobrir
 * a área visível inteira no lugar do spinner central.
 */
export function DashboardSkeleton({ kpiCount = 6 }: { kpiCount?: number }) {
  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 pb-8 sm:p-6 space-y-4 sm:space-y-6">
      {/* KPIs row */}
      <div
        className="grid gap-3 sm:gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
      >
        {Array.from({ length: kpiCount }).map((_, i) => (
          <KpiCardSkeleton key={i} />
        ))}
      </div>

      {/* Charts row — funil | linha | donut */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4">
        <div className="lg:col-span-3">
          <DonutSkeleton />
        </div>
        <div className="lg:col-span-6">
          <ChartSkeleton />
        </div>
        <div className="lg:col-span-3">
          <DonutSkeleton />
        </div>
      </div>

      {/* Tabela */}
      <TableSkeleton rows={5} cols={6} />
    </div>
  );
}
