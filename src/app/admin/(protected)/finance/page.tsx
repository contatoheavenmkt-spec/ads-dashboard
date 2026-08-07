import type { ReactNode } from "react";
import {
  AlertTriangle,
  Clock,
  CreditCard,
  DollarSign,
  Layers,
  RefreshCw,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";

import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import {
  calcularMrr,
  resumoAssinaturas,
  type MetricasMrr,
  type ResumoAssinaturas,
} from "@/lib/admin-metrics";
// Só COMPONENTES entram desta lista — ver "Fronteira servidor/cliente" abaixo.
import { BadgeStatus, CardKpi, EstadoVazio, Secao } from "../../_components/admin-ui";
// Funções e constantes vêm do módulo NEUTRO (sem "use client"), que pode ser
// chamado do servidor. É a fonte única da paleta validada.
import {
  TRACO,
  numeroValido,
  formatarMoeda,
  formatarNumero,
  formatarPercentual,
  corDoPlano,
} from "../../_components/admin-format";

/**
 * /admin/finance — visão financeira do SaaS.
 *
 * Continua sendo Server Component: a tela é uma FOTO (não tem filtro, seletor de
 * período nem botão que troque dados sem navegar), então renderizar no servidor
 * evita um round-trip de API e um estado de carregamento que não serviria a
 * ninguém. O que mudou foi de onde vêm os números.
 *
 * 1. UMA FONTE DE VERDADE. A versão anterior fazia `db.subscription.findMany()`
 *    e reimplementava o MRR aqui dentro (`active.reduce(... PLANS[s.plan].price)`).
 *    Era a MESMA regra escrita em dois lugares: mudar o que entra no MRR em
 *    lib/admin-metrics.ts corrigia o dashboard e deixava esta tela mentindo, sem
 *    nenhum sinal de que as duas discordavam. Agora MRR, ARR, ticket médio
 *    (arpu) e receita por plano vêm de `calcularMrr()`, e o retrato da base vem
 *    de `resumoAssinaturas()` — as mesmas funções que /api/admin/metrics usa.
 *    De quebra, as duas agregam no banco (groupBy/count) em vez de trazer a
 *    tabela inteira para somar em memória.
 *
 * 2. AS FUNÇÕES DA LIB LANÇAM. É decisão consciente dela (ver o cabeçalho de
 *    admin-metrics.ts): a versão que engolia o erro e devolvia zero fez a API
 *    servir "R$ 0,00" durante um pico de conexões, e num painel financeiro um
 *    zero-por-erro é pior que um card vazio. Só que, num Server Component, uma
 *    exceção não fica contida no card: ela sobe pela árvore e derruba a rota
 *    inteira no error boundary do Next. Por isso TODA chamada aqui está contida
 *    e a falha vira estado renderizado, nunca uma página quebrada e nunca um
 *    número inventado.
 *
 *    E a contenção é POR AGREGAÇÃO, não por tela. Cada carga é aguardada com
 *    `Promise.allSettled` e vira `null` sozinha; os cards que dependiam dela
 *    recebem `indisponivel`, os demais continuam mostrando o número que chegou
 *    íntegro. `Promise.all` fazia o contrário: bastava a metade mais pesada cair
 *    (`resumoAssinaturas()` roda 4 queries contra 1 de `calcularMrr()`) para
 *    apagar da tela o MRR, o ARR e o ticket médio que estavam corretos. É o
 *    mesmo desenho de /api/admin/metrics (allSettled + campo `degradado`).
 *    A tela só vira `PainelIndisponivel` quando NÃO SOBRA NADA.
 *
 * 3. O QUE A LIB NÃO EXPÕE, E SÓ ISSO, É CONSULTADO AQUI. "Novos em 30 dias" e
 *    "encerradas em 30 dias" não existem em admin-metrics, então saem de dois
 *    `count()` locais (`carregarMovimentacao`). Nenhum valor monetário é
 *    recalculado fora da lib — preço continua vindo só de plans.ts, através dela.
 *
 * 4. FRONTEIRA SERVIDOR/CLIENTE. `_components/admin-ui.tsx` começa com
 *    "use client". Isso permite RENDERIZAR os componentes dele daqui (o bundler
 *    troca cada export por uma client reference e o React resolve na fronteira —
 *    é o caso de CardKpi, Secao, EstadoVazio e BadgeStatus, todos recebendo
 *    apenas props serializáveis), mas PROÍBE chamar as funções puras do mesmo
 *    arquivo: `formatarMoeda(...)` aqui receberia a client reference no lugar da
 *    função e o render morreria com "Attempted to call formatarMoeda() from the
 *    server". Pelo mesmo motivo não dá nem para ler `PALETA_PLANO` ("you cannot
 *    dot into a client module from a server component"). Então formatadores e
 *    cores estão espelhados logo abaixo, com a mesma saída — e o conserto de
 *    verdade, que é extrair essas partes puras de admin-ui.tsx para um módulo sem
 *    diretiva, fica anotado lá embaixo porque mexe em arquivo compartilhado.
 *
 * O skeleton NÃO mora neste arquivo: SSR só entrega HTML depois que os dados
 * chegaram, então dentro do componente não existe o instante de "carregando"
 * que o skeleton cobre. Esse instante existe na NAVEGAÇÃO — entre o clique em
 * "Financeiro" e a chegada do HTML — e quem o cobre é o `loading.tsx` deste
 * segmento, que o Next monta como fallback de Suspense da rota.
 */

// Painel financeiro nunca pode vir de cache — o admin abre a tela para ver o
// estado de AGORA. Mesmo motivo documentado em /api/admin/metrics.
export const dynamic = "force-dynamic";

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Espelha STATUS_ENCERRADOS de lib/admin-metrics.ts, que não é exportado.
 * Os dois valores existem no banco (o schema documenta "expired", rotas antigas
 * gravaram "canceled") e os dois significam fim de vida — contar só um faria
 * cancelamento virar churn invisível.
 *
 * CUIDADO: se aquela lista mudar, esta precisa mudar junto.
 */
const STATUS_ENCERRADOS = ["expired", "canceled"];

// ─── Formatação ───────────────────────────────────────────────────────────────
// TRACO e numeroValido também vêm de admin-format (ver import no topo): eram
// definidos aqui como parte do mesmo espelho.

/*
 * A DÍVIDA DESTE BLOCO FOI PAGA.
 *
 * Aqui viviam cópias locais dos formatadores e dos quatro hex da paleta de
 * planos, porque `admin-ui.tsx` é "use client" e um Server Component não pode
 * CHAMAR função nem ler constante de módulo cliente (o bundler troca cada
 * export por client reference).
 *
 * A paleta agora mora em `admin-format.ts`, um módulo sem diretiva, importado
 * tanto por esta tela quanto por `admin-ui.tsx` (que a reexporta para as telas
 * cliente). Fonte única — que é o que o validador de acessibilidade enxerga.
 * Duplicar hex foi exatamente o que manteve o roxo reprovado #a855f7 vivo na
 * rosca do dashboard depois da troca de paleta.
 */

// ─── Carga de dados ───────────────────────────────────────────────────────────

/**
 * As duas metades do núcleo, cada uma podendo faltar SOZINHA.
 *
 * O `| null` por campo (e não um `Nucleo | null` inteiro) é o que permite à tela
 * degradar por bloco: um dos dois ausente marca só os cards daquela agregação.
 */
interface Nucleo {
  receita: MetricasMrr | null;
  assinaturas: ResumoAssinaturas | null;
}

interface Movimentacao {
  novos30d: number;
  encerradas30d: number;
}

/**
 * MRR + retrato das assinaturas, as duas agregações que sustentam a tela.
 *
 * Em paralelo porque são independentes — em série a página pagaria a latência
 * das duas somada. E `allSettled`, não `all`: o risco NÃO é simétrico.
 * `calcularMrr()` roda 1 groupBy; `resumoAssinaturas()` roda 4 queries (1
 * groupBy + 3 counts). Com `Promise.all`, a rejeição da mais pesada levava junto
 * o resultado da outra — MRR, ARR e ticket médio já calculados sumiam da tela
 * por causa de uma falha que não era deles.
 *
 * Nunca rejeita: o `throw` da lib vira `null` no campo correspondente, e quem
 * decide o que mostrar é a página.
 */
async function carregarNucleo(): Promise<Nucleo> {
  const [resReceita, resAssinaturas] = await Promise.allSettled([
    calcularMrr(),
    resumoAssinaturas(),
  ]);

  // A lib já registrou o detalhe em console.warn; aqui fica o registro de QUAL
  // bloco da tela caiu para o estado degradado, que é o que se procura no log.
  if (resReceita.status === "rejected") {
    console.error(
      "[admin/finance] receita (MRR) indisponível:",
      (resReceita.reason as Error)?.message ?? resReceita.reason
    );
  }
  if (resAssinaturas.status === "rejected") {
    console.error(
      "[admin/finance] resumo de assinaturas indisponível:",
      (resAssinaturas.reason as Error)?.message ?? resAssinaturas.reason
    );
  }

  return {
    receita: resReceita.status === "fulfilled" ? resReceita.value : null,
    assinaturas: resAssinaturas.status === "fulfilled" ? resAssinaturas.value : null,
  };
}

/**
 * Movimentação da base nos últimos 30 dias — os dois números que a lib não tem.
 *
 * `encerradas30d` usa `updatedAt` como carimbo da baixa (é a escrita que muda o
 * status), a mesma aproximação de receitaMensal(). A versão anterior desta tela
 * filtrava cancelamento por `createdAt`, o que respondia outra pergunta: "quem
 * entrou nos últimos 30 dias e hoje está cancelado" — número sempre menor que o
 * real, com cara de churn do mês.
 *
 * Falha isolada: se estes dois counts caírem, o resto da tela continua de pé e
 * só o card de movimentação aparece como indisponível.
 */
async function carregarMovimentacao(): Promise<Movimentacao | null> {
  try {
    const desde = new Date(Date.now() - 30 * DIA_MS);
    const [novos30d, encerradas30d] = await Promise.all([
      db.subscription.count({ where: { createdAt: { gte: desde } } }),
      db.subscription.count({
        where: { status: { in: STATUS_ENCERRADOS }, updatedAt: { gte: desde } },
      }),
    ]);
    return { novos30d, encerradas30d };
  } catch (err) {
    console.error("[admin/finance] movimentação 30d indisponível:", (err as Error)?.message ?? err);
    return null;
  }
}

// ─── Helpers de apresentação ──────────────────────────────────────────────────

/** Percentual de 0 a 100 (não fração), no mesmo contrato de formatarPercentual.
 *  Denominador zero devolve 0 — nunca NaN, nunca Infinity. */
function percentual(parte: number, total: number): number {
  if (!numeroValido(parte) || !numeroValido(total) || total <= 0) return 0;
  return (parte / total) * 100;
}

/** Largura da barra, presa entre 0% e 100%: um dado sujo não pode fazer o
 *  preenchimento vazar do trilho. */
function largura(pct: number): string {
  const seguro = numeroValido(pct) ? Math.min(100, Math.max(0, pct)) : 0;
  return `${seguro}%`;
}

interface LinhaReceita {
  plano: string;
  nome: string;
  preco: number;
  assinantes: number;
  receita: number;
}

/**
 * Receita por plano pronta para desenhar.
 *
 * `calcularMrr().porPlano` só traz plano COM assinante ativo (é um groupBy). Aqui
 * cruzamos com PLANS para que um plano pago sem ninguém continue na lista, em
 * versão esmaecida: sumir da tela faz "ninguém assina o Start" parecer "o Start
 * não existe", e a faixa vazia é justamente a informação comercial.
 *
 * O segundo laço cobre o contrário — plano que aparece no groupBy mas não está na
 * tabela de preços (dado sujo, ou um "trial" marcado como active). Ele entra com
 * a receita que a lib calculou (R$ 0,00 para plano sem preço): esconder um plano
 * com assinante ativo seria apagar linha de banco da tela.
 */
function montarReceitaPorPlano(porPlano: MetricasMrr["porPlano"]): LinhaReceita[] {
  const linhas: LinhaReceita[] = Object.entries(PLANS)
    .filter(([, def]) => def.price > 0)
    .map(([chave, def]) => {
      const achado = porPlano.find((l) => l.plano === chave);
      return {
        plano: chave,
        nome: def.name,
        preco: def.price,
        assinantes: achado?.assinantes ?? 0,
        receita: achado?.receita ?? 0,
      };
    });

  for (const l of porPlano) {
    if (linhas.some((x) => x.plano === l.plano)) continue;
    linhas.push({
      plano: l.plano,
      nome: PLANS[l.plano]?.name ?? l.plano,
      preco: PLANS[l.plano]?.price ?? 0,
      assinantes: l.assinantes,
      receita: l.receita,
    });
  }

  // Receita manda; empate de zero cai para nº de assinantes e depois para o
  // preço de tabela, para que a ordem das faixas vazias seja estável.
  return linhas.sort(
    (a, b) => b.receita - a.receita || b.assinantes - a.assinantes || b.preco - a.preco
  );
}

interface LinhaStatus {
  status: string;
  quantidade: number;
}

/** `porPlanoStatus` vem quebrado por (plano, status); aqui só interessa o status. */
function montarPorStatus(porPlanoStatus: ResumoAssinaturas["porPlanoStatus"]): LinhaStatus[] {
  const mapa = new Map<string, number>();
  for (const l of porPlanoStatus) {
    mapa.set(l.status, (mapa.get(l.status) ?? 0) + l.quantidade);
  }
  const linhas: LinhaStatus[] = [];
  mapa.forEach((quantidade, status) => {
    linhas.push({ status, quantidade });
  });
  return linhas.sort((a, b) => b.quantidade - a.quantidade);
}

// ─── Peças locais ─────────────────────────────────────────────────────────────

/**
 * Cabeçalho no padrão das telas novas (mesma anatomia de Contas e Assinaturas:
 * ladrilho de ícone + título + linha de contexto).
 *
 * Aparece nos DOIS caminhos da página, inclusive no de erro — uma tela sem
 * cabeçalho parece quebrada, e o operador precisa saber onde está mesmo quando
 * não há número para mostrar. Por isso `total` é opcional: sem dado, a pílula da
 * direita simplesmente não existe, em vez de escrever "0 assinaturas".
 */
function Cabecalho({ total }: { total?: number }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-11 h-11 rounded-2xl bg-blue-500/10 ring-1 ring-inset ring-blue-500/25 text-blue-400 grid place-items-center shrink-0">
          <DollarSign size={19} />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-black text-slate-100 tracking-tight leading-tight">Financeiro</h1>
          {/* Sem carimbo de horário: o texto seria formatado no fuso do SERVIDOR
              e um "atualizado às 04:12" para quem está às 01:12 em Brasília é
              pior que não ter carimbo nenhum. O que importa dizer é que o número
              é de agora — e é, a cada carregamento. */}
          <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-xl">
            Receita recorrente calculada sobre o preço de tabela dos planos, pelas mesmas regras do
            dashboard. Foto do estado atual, refeita a cada carregamento.
          </p>
        </div>
      </div>

      {typeof total === "number" && (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-800/70 ring-1 ring-inset ring-slate-700/60 px-2.5 py-1 rounded-full tabular-nums whitespace-nowrap">
          <Layers size={11} />
          {formatarNumero(total)} assinatura(s) na base
        </span>
      )}
    </div>
  );
}

function Painel({
  titulo,
  descricao,
  icone,
  rodape,
  children,
}: {
  titulo: string;
  descricao?: string;
  icone?: ReactNode;
  rodape?: ReactNode;
  children: ReactNode;
}) {
  return (
    // `h-full flex flex-col` + `mt-auto` no rodapé mantêm os dois painéis da
    // grade com a mesma altura e os rodapés alinhados na base.
    <div className="glass-panel rounded-2xl p-5 min-w-0 h-full flex flex-col ring-1 ring-slate-100/[0.03]">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[11px] font-black text-slate-300 uppercase tracking-widest">{titulo}</h3>
          {descricao && <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{descricao}</p>}
        </div>
        {icone && (
          <div className="w-8 h-8 rounded-xl bg-slate-800/70 ring-1 ring-inset ring-slate-700/60 text-slate-400 flex items-center justify-center shrink-0">
            {icone}
          </div>
        )}
      </div>

      <div className="min-w-0">{children}</div>

      {rodape && <div className="mt-auto pt-4 border-t border-slate-700/50">{rodape}</div>}
    </div>
  );
}

/**
 * Trilho + preenchimento. `h-2` com `rounded-full` dá exatamente o raio de 4px
 * da linguagem de gráficos do painel.
 *
 * `aria-hidden`: a barra é redundante — assinantes, valor e percentual estão
 * escritos ao lado, em texto. Anunciar "imagem" aqui só atrasaria a leitura.
 *
 * Sem transição de nenhum tipo: a página é renderizada no servidor e o valor
 * nunca muda depois da montagem, então animar seria enfeite (e `transition-all`,
 * que a versão anterior usava, animava também a largura do texto vizinho).
 */
function Barra({ pct, cor }: { pct: number; cor: string }) {
  return (
    <div aria-hidden className="h-2 rounded-full bg-slate-800/80 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: largura(pct), backgroundColor: cor }} />
    </div>
  );
}

/**
 * Estado terminal desta tela.
 *
 * Não dá para usar o <EstadoErro> de admin-ui aqui: ele pede
 * `onTentarNovamente: () => void`, e função não atravessa a fronteira
 * servidor → cliente (o RSC não serializa função). Então a anatomia é a mesma e
 * a retentativa é uma navegação de verdade — um <a> comum, que refaz o render no
 * servidor e roda as queries de novo.
 */
function PainelIndisponivel() {
  return (
    <div className="relative overflow-hidden bg-slate-900/60 border border-rose-500/20 rounded-2xl flex flex-col items-center justify-center text-center px-6 py-16 gap-4">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 h-40 w-40 rounded-full bg-rose-500/10 blur-3xl"
      />
      <div className="relative w-14 h-14 rounded-full bg-rose-500/10 ring-1 ring-inset ring-rose-500/25 flex items-center justify-center text-rose-400">
        <AlertTriangle size={22} />
      </div>
      <div className="relative space-y-1.5">
        <p className="text-base font-black text-slate-200 tracking-tight">Não foi possível calcular a receita</p>
        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
          As agregações financeiras falharam nesta leitura. Nenhum número é exibido enquanto isso: um
          &quot;R$ 0,00&quot; aqui seria indistinguível de &quot;não temos receita&quot;. Recarregue para tentar
          de novo.
        </p>
      </div>
      <a
        href="/admin/finance"
        className="relative mt-1 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-950/40 transition-colors"
      >
        <RefreshCw size={13} />
        Tentar novamente
      </a>
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default async function FinancePage() {
  // Nenhuma das duas cargas rejeita — cada uma já trata o próprio erro e devolve
  // null no lugar do dado —, então este Promise.all não precisa de try/catch.
  const [{ receita, assinaturas }, movimentacao] = await Promise.all([
    carregarNucleo(),
    carregarMovimentacao(),
  ]);

  // Saída antecipada só quando NÃO SOBRA NADA: sem MRR E sem retrato da base não
  // existe tela financeira para montar. Com uma das duas de pé a página continua
  // renderizando, e é o `indisponivel` dos cards que marca a metade que caiu —
  // derrubar tudo por causa de uma agregação apagaria números íntegros.
  if (receita === null && assinaturas === null) {
    return (
      <div className="p-6 space-y-6">
        <Cabecalho />
        <PainelIndisponivel />
      </div>
    );
  }

  const linhasPlano = receita !== null ? montarReceitaPorPlano(receita.porPlano) : [];
  const linhasStatus = assinaturas !== null ? montarPorStatus(assinaturas.porPlanoStatus) : [];

  // Denominadores das barras lidos AQUI, fora dos callbacks de `map`: dentro do
  // closure o estreitamento de `receita`/`assinaturas` para não-nulo é
  // desnecessariamente sutil, e `percentual()` já devolve 0 com total 0 — que é
  // justamente o caminho inalcançável (sem o dado, a lista nem é renderizada).
  const mrrTotal = receita?.mrr ?? 0;
  const totalDaBase = assinaturas?.total ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Sem o resumo não há total confiável: a pílula some em vez de escrever
          "0 assinatura(s) na base", que seria um zero-por-erro no cabeçalho. */}
      <Cabecalho total={assinaturas?.total} />

      {/*
        Alerta de trial vencido não processado. Fica ANTES dos cards porque é a
        única linha da tela que pede AÇÃO: a expiração é preguiçosa (só roda
        quando o usuário volta e getAndSyncSubscription() executa), então quem
        nunca mais voltou segue marcado como "trialing" para sempre — some do
        radar de cobrança e ainda infla a contagem de "em teste" mais abaixo.
        Âmbar com ícone e rótulo, que é como cor de estado pode aparecer.
        Zero é a situação saudável: aí o aviso simplesmente não existe — e sem o
        resumo carregado também não, porque "0 trials vencidos" seria uma
        afirmação que não temos como fazer.
      */}
      {assinaturas !== null && assinaturas.trialsExpiradosNaoProcessados > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-amber-400 tabular-nums">
              {assinaturas.trialsExpiradosNaoProcessados === 1
                ? "1 trial venceu e continua marcado como em teste"
                : `${formatarNumero(
                    assinaturas.trialsExpiradosNaoProcessados
                  )} trials venceram e continuam marcados como em teste`}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              São contas que passaram da data de fim do trial sem nunca serem processadas — receita
              potencial parada e contagem de &quot;em teste&quot; inflada.
              {assinaturas.trialsVencendo7d > 0 && (
                <> Outros {formatarNumero(assinaturas.trialsVencendo7d)} vencem nos próximos 7 dias.</>
              )}
            </p>
          </div>
        </div>
      )}

      {/* ─── KPIs ────────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <Secao
          titulo="Receita e base"
          descricao="MRR conta só assinatura com status ativo: trial custa R$ 0,00 e ainda não pagou nada, então fica de fora."
        />

        {/*
          3 colunas (e não 6) no desktop: valor em moeda com o corpo de destaque
          do MRR não cabe em coluna de 1/6 sem truncar, e valor financeiro
          cortado é pior que uma linha a mais na grade.

          `indisponivel` por AGREGAÇÃO, não por tela: os quatro primeiros cards
          vêm de calcularMrr(), "Inadimplentes" vem de resumoAssinaturas() e a
          movimentação tem query própria. Como as três podem cair sozinhas, cada
          card marca a sua — sem isso, um "R$ 0,00" ou um "0 novas assinaturas"
          causado por falha passaria por número real, que é exatamente o modo de
          falha que o vocabulário compartilhado existe para evitar.
        */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <CardKpi
            titulo="MRR"
            valor={receita ? formatarMoeda(receita.mrr) : undefined}
            sufixo="/mês"
            icone={<DollarSign size={16} />}
            indisponivel={receita === null}
            destaque
          />
          <CardKpi
            titulo="ARR"
            valor={receita ? formatarMoeda(receita.arr) : undefined}
            sufixo="MRR × 12"
            icone={<TrendingUp size={16} />}
            indisponivel={receita === null}
          />
          {/* Ticket médio = arpu da lib (MRR ÷ assinantes ativos). Não é
              recalculado aqui, senão voltaríamos a ter duas contas para o mesmo
              número. O denominador é o mesmo do card ao lado — TODA assinatura
              "active", trial marcado como active incluído —, por isso o sufixo
              diz "assinante ativo" e não "cliente pagante". O tom é NEUTRO: a
              versão antiga pintava este card de roxo, cor que não existe na
              paleta do painel. */}
          <CardKpi
            titulo="Ticket médio"
            valor={receita ? formatarMoeda(receita.arpu) : undefined}
            sufixo="/assinante ativo"
            icone={<CreditCard size={16} />}
            indisponivel={receita === null}
          />
          {/* NÃO é contagem de pagantes: `assinantesAtivos` soma todas as linhas
              do groupBy de calcularMrr(), que filtra só `status: "active"` sem
              olhar o plano (admin-metrics.ts:175-194). Um "trial" gravado como
              active — combinação que a rota PATCH de assinaturas aceita, porque
              valida plano e status em blocos independentes — entra nesta conta e
              NÃO entra no MRR. Chamar isso de "pagantes" ao lado de um MRR que
              exclui trial faria os dois cards se contradizerem na mesma faixa.
              O sufixo descreve o que a query realmente conta. */}
          <CardKpi
            titulo="Assinantes ativos"
            valor={receita?.assinantesAtivos}
            sufixo="com assinatura ativa"
            icone={<UserCheck size={16} />}
            indisponivel={receita === null}
          />
          {/* Conta TODA assinatura criada no período, trial incluído — o count
              de `carregarMovimentacao` não filtra plano, e admin-metrics.ts
              descreve a mesma contagem como "métrica de topo de funil, não de
              venda". Numa base de 16 trials contra 2 pagantes a diferença é de
              quase uma ordem de grandeza, então o título e o sufixo dizem isso
              na cara: dentro de "Receita e base", ao lado de MRR e ARR, o rótulo
              antigo ("Novos em 30 dias") lia como aquisição de cliente pagante.
              As "encerradas" seguem no sufixo, mas depois do separador — são
              outro número, de outra natureza (baixas por updatedAt). */}
          <CardKpi
            titulo="Novas assinaturas (30d)"
            valor={movimentacao?.novos30d}
            sufixo={
              movimentacao
                ? `inclui trials · ${formatarNumero(movimentacao.encerradas30d)} encerradas`
                : undefined
            }
            icone={<Users size={16} />}
            indisponivel={movimentacao === null}
          />
          {/* Inadimplente = status ativo com o período pago já vencido: ainda
              entra no MRR acima, mas o dinheiro não entrou. O acento âmbar só
              acende quando existe algum — card sempre alarmado deixa de
              significar alarme. */}
          <CardKpi
            titulo="Inadimplentes"
            valor={assinaturas?.inadimplentes}
            sufixo="período pago vencido"
            icone={<AlertTriangle size={16} />}
            indisponivel={assinaturas === null}
            tom={assinaturas !== null && assinaturas.inadimplentes > 0 ? "atencao" : "neutro"}
          />
        </div>
      </section>

      {/* ─── Distribuições ───────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <Secao
          titulo="Distribuição"
          descricao={
            assinaturas === null
              ? "Como o MRR se reparte entre os planos. A repartição por status depende do resumo das assinaturas, que não veio nesta leitura."
              : receita === null
                ? "Como a base se reparte entre os status. A repartição do MRR por plano depende do cálculo de receita, que não veio nesta leitura."
                : "Como o MRR se reparte entre os planos e como a base se reparte entre os status."
          }
        />

        {/* Duas colunas só quando existem DOIS painéis: com o resumo de
            assinaturas indisponível, o painel restante ocuparia metade da largura
            e a outra metade ficaria como um buraco sem explicação. */}
        <div
          className={cn(
            "grid grid-cols-1 gap-5 items-stretch",
            assinaturas !== null && "lg:grid-cols-2"
          )}
        >
          <Painel
            titulo="Receita por plano"
            descricao="Participação de cada plano no MRR. A cor identifica o plano — a mesma das assinaturas e do dashboard."
            icone={<DollarSign size={15} />}
            rodape={
              receita !== null && linhasPlano.length > 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold text-slate-400">Total</span>
                  <span className="text-[11px] text-slate-500 tabular-nums">
                    {formatarNumero(receita.assinantesAtivos)} assinante(s) ·{" "}
                    <span className="text-slate-100 font-bold">{formatarMoeda(receita.mrr)}</span>/mês
                  </span>
                </div>
              ) : undefined
            }
          >
            {receita === null ? (
              // Sem o cálculo de receita nenhuma barra é desenhada: uma faixa
              // zerada aqui seria indistinguível de "plano sem assinante", que é
              // informação comercial legítima e apareceria como se fosse real.
              <EstadoVazio
                icone={<AlertTriangle size={20} />}
                titulo="Receita indisponível"
                descricao="O cálculo do MRR falhou nesta leitura, então a participação de cada plano não pode ser mostrada. Recarregue a página para tentar de novo."
              />
            ) : linhasPlano.length === 0 ? (
              <EstadoVazio
                icone={<DollarSign size={20} />}
                titulo="Nenhum plano pago cadastrado"
                descricao="A tabela de preços não tem nenhum plano com valor acima de zero."
              />
            ) : (
              <ul className="space-y-4">
                {linhasPlano.map((p) => {
                  const pct = percentual(p.receita, mrrTotal);
                  const vazio = p.assinantes === 0;
                  return (
                    <li
                      key={p.plano}
                      // Plano sem assinante fica esmaecido, não some: a faixa
                      // vazia é informação comercial. `opacity` não muda a ordem
                      // nem o espaço que a linha ocupa.
                      className={cn("space-y-2 min-w-0", vazio && "opacity-45")}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          {/* O ponto carrega a identidade do plano; o nome ao
                              lado é a codificação secundária que a paleta exige
                              (premium e plus ficam num ΔE de fronteira). O texto
                              nunca veste a cor da série. */}
                          <span
                            aria-hidden
                            className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-slate-900/80"
                            style={{ backgroundColor: corDoPlano(p.plano) }}
                          />
                          <span className="text-sm font-bold text-slate-200 truncate">{p.nome}</span>
                          <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
                            {formatarMoeda(p.preco)}/assinante
                          </span>
                        </div>
                        <div className="flex items-center gap-3 tabular-nums shrink-0">
                          <span className="text-[11px] text-slate-500">
                            {vazio ? "sem assinantes" : `${formatarNumero(p.assinantes)} assinante(s)`}
                          </span>
                          <span className="text-xs font-bold text-slate-100">{formatarMoeda(p.receita)}</span>
                          <span className="text-[11px] text-slate-500 w-12 text-right">
                            {formatarPercentual(pct)}
                          </span>
                        </div>
                      </div>
                      <Barra pct={pct} cor={corDoPlano(p.plano)} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Painel>

          {/* Painel inteiro fora da tela quando o resumo não veio: ele não tem um
              único número que não dependa de `assinaturas`, então um estado
              "indisponível" aqui seria só um cartão vazio ocupando metade da
              grade. Quem avisa da falha são os cards da faixa acima. */}
          {assinaturas !== null && (
            <Painel
              titulo="Assinaturas por status"
              descricao="Toda a base, inclusive quem já saiu. Cor de status é reservada ao estado, então aqui quem nomeia é o rótulo."
              icone={<Layers size={15} />}
              // Mesmo guard do painel vizinho: com a base vazia o corpo já
              // explica que não há assinatura, e o rodapé embaixo da linha
              // divisória ficaria detalhando "0 trials" de uma contagem que não
              // está na tela.
              rodape={
                linhasStatus.length > 0 ? (
                  <p className="text-[11px] text-slate-500 leading-relaxed flex items-start gap-2">
                    <Clock size={12} className="shrink-0 mt-0.5" />
                    <span className="tabular-nums">
                      {formatarNumero(assinaturas.trialsVencendo7d)} trial(s) vencem em até 7 dias e{" "}
                      {formatarNumero(assinaturas.trialsExpiradosNaoProcessados)} já venceram sem
                      processamento — estes últimos continuam contados em &quot;em teste&quot; acima.
                    </span>
                  </p>
                ) : undefined
              }
            >
              {linhasStatus.length === 0 ? (
                <EstadoVazio
                  icone={<Layers size={20} />}
                  titulo="Nenhuma assinatura na base"
                  descricao="Assim que a primeira conta for criada, a distribuição por status aparece aqui."
                />
              ) : (
                <ul className="space-y-4">
                  {linhasStatus.map((s) => {
                    const pct = percentual(s.quantidade, totalDaBase);
                    return (
                      <li key={s.status} className="space-y-2 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 min-w-0">
                          {/* <BadgeStatus> é o vocabulário do painel para status:
                              caixa neutra, texto em cor de texto e a marca
                              colorida no ponto. Ele já corrige sozinho o que a
                              versão antiga errava — "em teste" era pintado de
                              âmbar, como se estar em trial fosse alerta, quando é
                              o estado normal de quem acabou de entrar. E
                              "cancelados" era vermelho de estado, gasto como
                              decoração de categoria. */}
                          <BadgeStatus status={s.status} />
                          <div className="flex items-center gap-3 tabular-nums shrink-0">
                            <span className="text-xs font-bold text-slate-100">
                              {formatarNumero(s.quantidade)}
                            </span>
                            <span className="text-[11px] text-slate-500 w-12 text-right">
                              {formatarPercentual(pct)}
                            </span>
                          </div>
                        </div>
                        {/* Cinza para TODAS as faixas: status não é série
                            categórica, e reusar verde/âmbar/vermelho aqui
                            gastaria as três cores reservadas do painel numa
                            decoração. Quem diferencia as linhas é o rótulo ao
                            lado. slate-500 (#64748b) e não o slate-600 do
                            fallback de plano: contra o trilho slate-800 o
                            slate-600 fica em ~2:1, abaixo do piso de 3:1 de
                            elemento gráfico. */}
                        <Barra pct={pct} cor="#64748b" />
                      </li>
                    );
                  })}
                </ul>
              )}
            </Painel>
          )}
        </div>
      </section>
    </div>
  );
}
