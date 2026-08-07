"use client";

/**
 * /admin/subscriptions — gestão de assinaturas.
 *
 * Client Component que consome GET /api/admin/subscriptions (lista paginada) e
 * PATCH /api/admin/subscriptions/[id] (alteração de plano/status/trial).
 *
 * Três decisões que valem para o arquivo inteiro:
 *
 * 1. A LISTA É PAGINADA NO SERVIDOR. Tudo que é resumo/CSV aqui fala sobre a
 *    PÁGINA carregada, nunca sobre a base inteira — e a UI diz isso em texto.
 *    Somar 25 linhas e chamar de "total de ativos" seria número errado com cara
 *    de número certo.
 *
 * 2. NADA DE ESTADO OTIMISTA. Depois do PATCH a lista é recarregada do
 *    servidor. O PATCH mexe em campos derivados (accountsLimit muda junto com o
 *    plano, `vencido` é recalculado) — remendar a linha em memória faria a tela
 *    divergir do banco em silêncio.
 *
 * 3. ERRO SEMPRE TEM SAÍDA. Falha de rede vira <EstadoErro> com botão de tentar
 *    de novo; falha de PATCH aparece dentro do modal com a mensagem que a API
 *    devolveu (a rota responde 400 com `{ error }` legível).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Clock,
  CreditCard,
  Download,
  Filter,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PLANS } from "@/lib/plans";
import {
  BadgeStatus,
  CardKpi,
  EstadoErro,
  EstadoVazio,
  Paginacao,
  Secao,
  Skeleton,
  corDoPlano,
  formatarData,
  formatarMoeda,
  formatarNumero,
} from "../../_components/admin-ui";

// ─── Constantes ───────────────────────────────────────────────────────────────

const POR_PAGINA = 25;
const MS_DIA = 1000 * 60 * 60 * 24;

/** Derivado de PLANS (mesma fonte que a API usa para validar) — plano novo em
 *  plans.ts já aparece nos selects sem ninguém tocar nesta tela. */
const PLANOS = Object.keys(PLANS);

/** Os únicos status que o PATCH aceita gravar (ver STATUS_VALIDOS na rota).
 *  "canceled" existe em linhas antigas e é exibido, mas não é oferecido. */
const STATUS_EDITAVEIS = [
  { valor: "trialing", rotulo: "Em teste" },
  { valor: "active", rotulo: "Ativo (pagante)" },
  { valor: "cortesia", rotulo: "Cortesia (sem cobrança)" },
  { valor: "expired", rotulo: "Expirado" },
];

/** Explicação de cada status no editor — evita que "Ativo" e "Cortesia"
 *  pareçam sinônimos e o MRR volte a contar acesso liberado à mão. */
const AJUDA_STATUS: Record<string, string> = {
  trialing: "Período de teste. Acesso liberado até a data do trial.",
  active: "Cliente PAGANTE. Entra no MRR e no faturamento do painel.",
  cortesia: "Acesso liberado por você, sem cobrança. Tem o mesmo acesso do plano escolhido, mas NÃO entra no MRR.",
  expired: "Sem acesso. O usuário vê a tela de plano expirado.",
};

const EXTENSOES_TRIAL = [7, 15, 30];

/*
 * Chrome compartilhado da tela.
 *
 * Altura fixa (h-10) em TODO campo e botão da barra de filtros: sem ela, input,
 * select e botão fecham com 1–3px de diferença (cada um resolve o line-height do
 * seu jeito) e a barra ganha degraus visíveis. Com a altura fixa a fileira lê
 * como uma peça só.
 *
 * `ring-1 ring-inset` no lugar de `border`: os campos vivem dentro de painéis
 * `.glass-panel`, que define o shorthand `border` — sobrescrever a cor por
 * utilitário dependeria da ordem no CSS gerado. Ring não disputa com nada.
 */
const CAMPO =
  "h-10 rounded-xl bg-slate-950/40 px-3 text-sm text-slate-100 placeholder-slate-600 ring-1 ring-inset ring-slate-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500/60 transition-[background-color,box-shadow] duration-200";
const BOTAO_SEC =
  "inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl bg-slate-800/70 ring-1 ring-inset ring-slate-700/60 text-slate-300 text-xs font-bold hover:bg-slate-700/70 hover:ring-slate-500/50 transition-[background-color,box-shadow] duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800/70 disabled:hover:ring-slate-700/60";
const BOTAO_PRI =
  "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-950/40 transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-blue-600";

// ─── Tipos e normalização ─────────────────────────────────────────────────────

interface Assinatura {
  id: string;
  userId: string;
  email: string;
  nome: string | null;
  plano: string;
  status: string;
  valorMensal: number;
  accountsLimit: number;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  diasRestantesTrial: number | null;
  vencido: boolean;
  criadoEm: string | null;
}

interface Lista {
  itens: Assinatura[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
}

type Direcao = "asc" | "desc";

/** String utilizável ou null — evita que "" e undefined virem texto na tela. */
function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function numero(v: unknown, padrao: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : padrao;
}

/**
 * A resposta da API é tratada como desconhecida e normalizada campo a campo.
 *
 * Não é paranoia gratuita: qualquer campo que chegar diferente do esperado (um
 * deploy fora de sincronia, um proxy devolvendo HTML de erro com 200) viraria
 * "undefined"/"NaN" espalhado pela tabela. Aqui o estrago para numa linha só.
 *
 * `any` no parâmetro porque é literalmente JSON não tipado — mesmo padrão dos
 * route handlers do projeto.
 */
function normalizarItem(bruto: any): Assinatura {
  return {
    id: texto(bruto?.id) ?? "",
    userId: texto(bruto?.userId) ?? "",
    email: texto(bruto?.email) ?? "—",
    nome: texto(bruto?.nome),
    plano: texto(bruto?.plano) ?? "—",
    status: texto(bruto?.status) ?? "—",
    valorMensal: numero(bruto?.valorMensal, 0),
    accountsLimit: numero(bruto?.accountsLimit, 0),
    trialEndsAt: texto(bruto?.trialEndsAt),
    currentPeriodEnd: texto(bruto?.currentPeriodEnd),
    // null é legítimo aqui ("nunca teve trial") e é diferente de 0.
    diasRestantesTrial:
      typeof bruto?.diasRestantesTrial === "number" && Number.isFinite(bruto.diasRestantesTrial)
        ? bruto.diasRestantesTrial
        : null,
    vencido: bruto?.vencido === true,
    criadoEm: texto(bruto?.criadoEm),
  };
}

function normalizarLista(bruto: any): Lista {
  const itens = Array.isArray(bruto?.itens) ? bruto.itens.map(normalizarItem) : [];
  const total = Math.max(0, numero(bruto?.total, itens.length));
  return {
    itens,
    total,
    pagina: Math.max(1, numero(bruto?.pagina, 1)),
    porPagina: Math.max(1, numero(bruto?.porPagina, POR_PAGINA)),
    totalPaginas: Math.max(1, numero(bruto?.totalPaginas, 1)),
  };
}

// ─── Helpers de apresentação ──────────────────────────────────────────────────

function rotuloPlano(plano: string): string {
  return PLANS[plano]?.name ?? plano;
}

function rotuloStatus(status: string): string {
  const achado = STATUS_EDITAVEIS.find((s) => s.valor === status);
  return achado?.rotulo ?? status;
}

/**
 * Plano do cliente — mesma anatomia do <BadgeStatus>: caixa neutra, texto em cor
 * de texto e a identidade morando no PONTO colorido ao lado.
 *
 * As cores saem de `corDoPlano` (PALETA_PLANO no admin-ui), validada contra o
 * fundo escuro real. A paleta antiga desta tela pintava "plus" de roxo, que em
 * deuteranopia ficava indistinguível do azul do "start" — dois planos, uma cor
 * só para ~8% dos homens.
 *
 * O nome do plano escrito por extenso é a codificação secundária que a paleta
 * exige: a cor nunca identifica o plano sozinha.
 */
function BadgePlano({ plano }: { plano: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[9px] font-bold px-2 py-[3px] rounded-full bg-slate-800/70 ring-1 ring-inset ring-slate-700/60 text-slate-300 uppercase tracking-wide whitespace-nowrap">
      <span
        aria-hidden
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: corDoPlano(plano) }}
      />
      {rotuloPlano(plano)}
    </span>
  );
}

/**
 * Iniciais do avatar: primeira letra do primeiro e do último nome, ou a primeira
 * letra do email quando o cadastro não tem nome. Nunca devolve string vazia — um
 * círculo em branco na tabela lê como imagem quebrada, não como "sem nome".
 */
function iniciais(nome: string | null, email: string): string {
  const base = typeof nome === "string" ? nome.trim() : "";
  if (base !== "") {
    const partes = base.split(/\s+/).filter((p) => p !== "");
    const primeira = partes[0]?.charAt(0) ?? "";
    const ultima = partes.length > 1 ? partes[partes.length - 1].charAt(0) : "";
    const letras = `${primeira}${ultima}`;
    if (letras !== "") return letras.toUpperCase();
  }
  const inicial = (typeof email === "string" ? email.trim() : "").charAt(0);
  return /[a-zA-Z0-9]/.test(inicial) ? inicial.toUpperCase() : "?";
}

/** Avatar circular gerado das iniciais. Decorativo: o nome e o email estão
 *  escritos ao lado, então o leitor de tela não precisa ouvir "AB". */
function Avatar({ nome, email }: { nome: string | null; email: string }) {
  return (
    <span
      aria-hidden
      className="grid place-items-center w-9 h-9 rounded-full shrink-0 text-[11px] font-black tracking-wide bg-gradient-to-br from-slate-700/80 to-slate-800 text-slate-300 ring-1 ring-inset ring-slate-600/40"
    >
      {iniciais(nome, email)}
    </span>
  );
}

/**
 * Texto da coluna "Dias restantes".
 *
 * A API manda `diasRestantesTrial` com Math.max(0, ...) — um trial que venceu
 * há duas semanas chega como 0, e "0 dias" não conta a história. Por isso o
 * atraso é recalculado aqui a partir de `trialEndsAt`; o número positivo
 * continua vindo da API para as duas telas nunca discordarem.
 */
function descreverTrial(item: Assinatura): { rotulo: string; alerta: boolean } {
  if (!item.trialEndsAt) return { rotulo: "—", alerta: false };
  const fim = new Date(item.trialEndsAt);
  if (Number.isNaN(fim.getTime())) return { rotulo: "—", alerta: false };

  const agora = Date.now();
  if (fim.getTime() > agora) {
    const restantes = item.diasRestantesTrial ?? Math.ceil((fim.getTime() - agora) / MS_DIA);
    if (restantes <= 0) return { rotulo: "vence hoje", alerta: true };
    return {
      rotulo: restantes === 1 ? "1 dia" : `${formatarNumero(restantes)} dias`,
      // 3 dias é o mesmo corte que o dashboard usa para "trials expirando".
      alerta: restantes <= 3,
    };
  }

  const atraso = Math.floor((agora - fim.getTime()) / MS_DIA);
  if (atraso <= 0) return { rotulo: "vencido hoje", alerta: true };
  return {
    rotulo: atraso === 1 ? "vencido há 1 dia" : `vencido há ${formatarNumero(atraso)} dias`,
    alerta: true,
  };
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

/**
 * Um campo de CSV para Excel pt-BR.
 *
 * Tudo entre aspas e aspas internas duplicadas: o separador é ";" (o que o
 * Excel em pt-BR espera), e um nome como `Silva; Cia` ou um `"` no meio
 * quebraria as colunas do arquivo inteiro a partir daquela linha.
 * Quebras de linha viram espaço pelo mesmo motivo.
 *
 * O apóstrofo na frente de =, +, -, @ e tab/CR é contra INJEÇÃO DE FÓRMULA:
 * `nome` e `email` são digitados pelo cliente final, e um nome gravado como
 * `=HYPERLINK("http://x";"clique")` vira fórmula executável quando o admin abre
 * o CSV no Excel. As aspas do CSV não protegem — elas são consumidas no parse,
 * antes de a célula ser avaliada. O apóstrofo força a célula a ser texto.
 * Nenhuma coluna gerada aqui começa legitimamente com esses caracteres, então
 * não há falso positivo visível na planilha.
 */
function campoCsv(valor: unknown): string {
  const bruto = valor === null || valor === undefined ? "" : String(valor);
  const seguro = /^[=+\-@\t\r]/.test(bruto) ? `'${bruto}` : bruto;
  return `"${seguro.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

function exportarCsv(itens: Assinatura[]) {
  const cabecalho = [
    "Nome",
    "Email",
    "Plano",
    "Status",
    "Valor mensal (R$)",
    "Trial termina em",
    "Dias restantes",
    "Fim do periodo",
    "Criado em",
    "Vencido",
  ];

  const linhas = itens.map((i) => [
    i.nome ?? "",
    i.email,
    rotuloPlano(i.plano),
    rotuloStatus(i.status),
    // Vírgula decimal: com ponto o Excel pt-BR leria 299.90 como texto.
    i.valorMensal.toFixed(2).replace(".", ","),
    formatarData(i.trialEndsAt),
    descreverTrial(i).rotulo,
    formatarData(i.currentPeriodEnd),
    formatarData(i.criadoEm),
    i.vencido ? "sim" : "nao",
  ]);

  const csv = [cabecalho, ...linhas].map((linha) => linha.map(campoCsv).join(";")).join("\r\n");

  // BOM UTF-8: sem ele o Excel abre o arquivo assumindo ANSI e todo acento
  // aparece corrompido na planilha do cliente.
  //
  // Escrito com fromCharCode e não com o caractere literal por dois motivos:
  // U+FEFF é invisível no editor e some no primeiro "trim" distraído de quem
  // mexer nesta linha depois; e o pipeline de deploy aborta o build se achar
  // sequências de acento corrompido no fonte — um exemplo literal de texto
  // mal-decodificado dentro de um comentário derrubaria essa checagem.
  const bom = String.fromCharCode(0xfeff);
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `assinaturas_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Cabeçalho ordenável ──────────────────────────────────────────────────────

/**
 * Célula de cabeçalho.
 *
 * `sticky top-0` fica na CÉLULA, não no <thead>: sticky em thead/tr só funciona
 * nos navegadores mais novos, e a borda inferior de um thead sticky não
 * acompanha o scroll. Com o sticky no <th> (e a borda no próprio th) o
 * comportamento é o mesmo em qualquer navegador.
 *
 * O fundo precisa ser SÓLIDO — as linhas passam por baixo dele. `bg-slate-900`
 * é a cor de superfície do painel; qualquer alfa deixaria o texto das linhas
 * transparecendo no cabeçalho.
 *
 * `px-5 py-3.5` é a MESMA métrica de cabeçalho da tela de contas (o corpo usa
 * `px-5 py-3` nas duas): tabelas irmãs no mesmo painel com densidades diferentes
 * fazem o admin sentir uma troca de sistema ao navegar entre elas.
 */
const CELULA_TH =
  "sticky top-0 z-10 bg-slate-900 px-5 py-3.5 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap border-b border-slate-700/60";

function ThOrdenavel({
  rotulo,
  campo,
  ordenar,
  direcao,
  onOrdenar,
  alinharDireita = false,
}: {
  rotulo: string;
  campo: string;
  ordenar: string;
  direcao: Direcao;
  onOrdenar: (campo: string) => void;
  alinharDireita?: boolean;
}) {
  const ativo = ordenar === campo;
  return (
    <th
      // Sem scope o leitor de tela não associa as células ao cabeçalho da coluna
      // numa tabela de 9 colunas — cada valor é lido solto, sem o nome do campo.
      scope="col"
      // Sem aria-sort o leitor de tela não anuncia por qual coluna a tabela está
      // ordenada — a informação existe só nas setinhas.
      aria-sort={ativo ? (direcao === "asc" ? "ascending" : "descending") : "none"}
      className={cn(CELULA_TH, alinharDireita && "text-right")}
    >
      <button
        type="button"
        onClick={() => onOrdenar(campo)}
        // inline-flex (e não flex): o botão continua sendo conteúdo em linha do
        // <th> e obedece ao text-right da coluna.
        className={cn(
          "group inline-flex items-center gap-1.5 uppercase tracking-widest transition-colors align-middle",
          ativo ? "text-blue-400" : "text-slate-500 hover:text-slate-300"
        )}
        title={`Ordenar por ${rotulo.toLowerCase()}`}
      >
        {rotulo}
        {/* Seta só na coluna ativa. Nas demais fica um ícone neutro bem
            apagado: some do olhar, mas anuncia que a coluna é clicável. */}
        {ativo ? (
          direcao === "asc" ? (
            <ArrowUp size={11} strokeWidth={3} />
          ) : (
            <ArrowDown size={11} strokeWidth={3} />
          )
        ) : (
          <ChevronsUpDown size={11} className="text-slate-700 group-hover:text-slate-500 transition-colors" />
        )}
      </button>
    </th>
  );
}

// ─── Modal de ações ───────────────────────────────────────────────────────────

interface Alteracao {
  rotulo: string;
  de: string;
  para: string;
}

function ModalAcoes({
  assinatura,
  onFechar,
  onSalvo,
}: {
  assinatura: Assinatura;
  onFechar: () => void;
  onSalvo: (mensagem: string) => void;
}) {
  const [plano, setPlano] = useState(assinatura.plano);
  const [status, setStatus] = useState(assinatura.status);
  /**
   * Extensão escolhida — null = não mexer no trial.
   *
   * Guarda a data JÁ CALCULADA junto com o número de dias em vez de recalcular
   * `Date.now() + dias` no render: assim a data que aparece na confirmação é
   * exatamente a que vai no PATCH, e o render não depende do relógio (o mesmo
   * estado sempre desenha a mesma tela).
   */
  const [extensao, setExtensao] = useState<{ dias: number; iso: string } | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroApi, setErroApi] = useState<string | null>(null);
  /** Cartão do modal — recebe o foco na abertura (ver efeito abaixo). */
  const cartaoRef = useRef<HTMLDivElement | null>(null);

  const novoTrialIso = extensao?.iso ?? null;

  /**
   * Nova data de fim do trial: HOJE + N dias, não `trialEndsAt + N`.
   * Estender a partir da data antiga num trial vencido há 20 dias entregaria
   * uma data que continua no passado — ou seja, botão que não faz nada.
   */
  function escolherExtensao(dias: number) {
    setExtensao(extensao?.dias === dias ? null : { dias, iso: new Date(Date.now() + dias * MS_DIA).toISOString() });
  }

  const alteracoes: Alteracao[] = [];
  if (plano !== assinatura.plano) {
    alteracoes.push({ rotulo: "Plano", de: rotuloPlano(assinatura.plano), para: rotuloPlano(plano) });
    // O limite de contas é derivado do plano no servidor; mostramos aqui para o
    // admin não descobrir depois que o downgrade cortou as contas do cliente.
    const limiteAntes = assinatura.accountsLimit;
    const limiteDepois = PLANS[plano]?.accountsLimit ?? limiteAntes;
    if (limiteDepois !== limiteAntes) {
      alteracoes.push({
        rotulo: "Limite de contas",
        de: formatarNumero(limiteAntes),
        para: formatarNumero(limiteDepois),
      });
    }
  }
  if (status !== assinatura.status) {
    alteracoes.push({ rotulo: "Status", de: rotuloStatus(assinatura.status), para: rotuloStatus(status) });
  }
  if (novoTrialIso) {
    alteracoes.push({ rotulo: "Fim do trial", de: formatarData(assinatura.trialEndsAt), para: formatarData(novoTrialIso) });
  }

  const temAlteracao = alteracoes.length > 0;

  /**
   * Foco inicial no cartão. Sem isso o foco continua no botão "Gerenciar" que
   * abriu o modal, atrás do overlay: o leitor de tela nunca entra no diálogo e
   * o primeiro Tab cai na tabela por baixo. Foco no CONTÊINER (e não no
   * primeiro campo) porque o cartão começa com um texto de contexto — mandar o
   * foco direto para um <select> pularia a leitura de quem é a assinatura.
   */
  useEffect(() => {
    cartaoRef.current?.focus();
  }, []);

  // Esc fecha o modal — menos uma forma de ficar preso na tela.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape" && !salvando) onFechar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar, salvando]);

  async function salvar() {
    setSalvando(true);
    setErroApi(null);

    // Só os campos que mudaram: mandar os quatro sempre encheria o AdminLog de
    // "de X para X" e reescreveria datas sem necessidade.
    const corpo: Record<string, unknown> = {};
    if (plano !== assinatura.plano) corpo.plano = plano;
    if (status !== assinatura.status) corpo.status = status;
    if (novoTrialIso) corpo.trialEndsAt = novoTrialIso;

    try {
      const res = await fetch(`/api/admin/subscriptions/${encodeURIComponent(assinatura.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      // A rota responde 400/404 com `{ error }` legível em pt-BR — vale mais
      // que qualquer mensagem genérica que eu inventasse aqui.
      const dados = await res.json().catch(() => null);
      if (!res.ok) {
        setErroApi(texto(dados?.error) ?? `Não foi possível salvar (HTTP ${res.status}).`);
        setConfirmando(false);
        setSalvando(false);
        return;
      }
      // Sem `finally` de propósito: no caminho de sucesso quem manda é o pai,
      // que fecha este modal — mexer em estado local depois disso seria escrita
      // em componente já desmontado.
      onSalvo(`Assinatura de ${assinatura.nome ?? assinatura.email} atualizada.`);
    } catch {
      setErroApi("Falha de conexão. Verifique a rede e tente novamente.");
      setConfirmando(false);
      setSalvando(false);
    }
  }

  return (
    <div
      onClick={() => {
        if (!salvando) onFechar();
      }}
      className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        ref={cartaoRef}
        onClick={(e) => e.stopPropagation()}
        // O papel de diálogo mora no CARTÃO, não no backdrop: com role="dialog"
        // no overlay, o conteúdo anunciado incluiria a área de clique de fechar
        // e o nome do diálogo ficaria colado no elemento errado.
        role="dialog"
        aria-modal="true"
        aria-label="Gerenciar assinatura"
        // tabIndex -1: alvo do foco programático da abertura, sem entrar na
        // ordem de tabulação depois. `focus:outline-none` porque esse foco é
        // sempre programático — o anel apareceria sem ninguém ter navegado até
        // aqui pelo teclado.
        tabIndex={-1}
        // overflow-x-hidden explícito (e não o `overflow-hidden` genérico): o
        // card precisa rolar na vertical em telas baixas, e as duas classes
        // juntas dependeriam da ordem no CSS gerado para saber quem vence no
        // eixo Y.
        className="relative bg-slate-950 ring-1 ring-slate-700/70 rounded-3xl shadow-2xl shadow-black/60 w-full max-w-lg max-h-[90vh] overflow-x-hidden overflow-y-auto focus:outline-none"
      >
        {/* Brilho de topo: fora do fluxo, nunca captura clique. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-48 w-72 rounded-full bg-blue-500/10 blur-3xl"
        />

        {/* Cabeçalho */}
        <div className="relative flex items-start justify-between gap-3 px-6 py-5 border-b border-slate-800/80">
          <div className="flex items-start gap-3 min-w-0">
            <Avatar nome={assinatura.nome} email={assinatura.email} />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-400/90 leading-none">
                Gerenciar assinatura
              </p>
              <p className="text-sm font-black text-slate-100 truncate mt-1.5">{assinatura.nome ?? "Sem nome"}</p>
              <p className="text-[11px] text-slate-500 truncate">{assinatura.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            disabled={salvando}
            className="shrink-0 w-8 h-8 grid place-items-center rounded-xl text-slate-500 hover:text-slate-200 hover:bg-slate-800/70 transition-[background-color,color] disabled:opacity-40"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Situação atual */}
        <div className="relative px-6 py-5 border-b border-slate-800/80 grid grid-cols-2 gap-x-4 gap-y-4">
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Plano atual</p>
            <BadgePlano plano={assinatura.plano} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Status atual</p>
            <BadgeStatus status={assinatura.status} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Trial termina</p>
            <p className="text-xs text-slate-300 tabular-nums">{formatarData(assinatura.trialEndsAt)}</p>
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Fim do período</p>
            <p className="text-xs text-slate-300 tabular-nums">{formatarData(assinatura.currentPeriodEnd)}</p>
          </div>
        </div>

        {confirmando ? (
          /* ─── Passo 2: confirmação de/para ─── */
          <div className="relative px-6 py-5 space-y-5">
            <div className="flex items-start gap-2.5 bg-amber-500/[0.07] ring-1 ring-inset ring-amber-500/20 rounded-xl px-3.5 py-3">
              <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-300 leading-relaxed">
                Confirme as alterações abaixo. Elas valem imediatamente para o cliente e ficam registradas no log do
                admin.
              </p>
            </div>

            <div className="space-y-2.5">
              {alteracoes.map((a) => (
                <div key={a.rotulo} className="bg-slate-900/70 ring-1 ring-inset ring-slate-800/80 rounded-2xl px-4 py-3.5">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2.5">{a.rotulo}</p>
                  {/* De → para em dois blocos: o valor que sai fica apagado e
                      recuado, o que entra ganha caixa acesa. A seta no meio é o
                      que faz a leitura ser "vira", e não "duas coisas". */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex-1 min-w-0 truncate text-xs text-slate-500 line-through bg-slate-950/50 ring-1 ring-inset ring-slate-800/70 rounded-lg px-2.5 py-1.5">
                      {a.de}
                    </span>
                    <ArrowRight size={14} className="text-slate-600 shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-xs font-bold text-blue-300 bg-blue-500/10 ring-1 ring-inset ring-blue-500/30 rounded-lg px-2.5 py-1.5">
                      {a.para}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {erroApi && (
              <p className="text-xs text-rose-300 bg-rose-500/10 ring-1 ring-inset ring-rose-500/25 rounded-xl px-3.5 py-3 leading-relaxed">
                {erroApi}
              </p>
            )}

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                disabled={salvando}
                className={cn(BOTAO_SEC, "flex-1 h-11")}
              >
                Voltar
              </button>
              <button type="button" onClick={salvar} disabled={salvando} className={cn(BOTAO_PRI, "flex-1 h-11")}>
                {salvando ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Check size={14} strokeWidth={3} />
                    Confirmar alterações
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* ─── Passo 1: edição ─── */
          <div className="relative px-6 py-5 space-y-5">
            <div>
              {/* htmlFor/id: sem o par, o leitor de tela anuncia só "caixa de
                  combinação" — o texto acima fica solto, sem virar nome do
                  campo. Os ids são fixos porque só existe um modal por vez. */}
              <label
                htmlFor="modal-plano"
                className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2"
              >
                Plano
              </label>
              <div className="relative">
                <select
                  id="modal-plano"
                  value={plano}
                  onChange={(e) => setPlano(e.target.value)}
                  className={cn(CAMPO, "w-full pr-9 appearance-none cursor-pointer")}
                >
                  {PLANOS.map((p) => (
                    <option key={p} value={p} className="bg-slate-900">
                      {rotuloPlano(p)} — {formatarMoeda(PLANS[p]?.price ?? 0)}/mês
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="modal-status"
                className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2"
              >
                Status
              </label>
              <div className="relative">
                <select
                  id="modal-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={cn(CAMPO, "w-full pr-9 appearance-none cursor-pointer")}
                >
                  {/* Status legado (ex.: "canceled") não é opção, mas precisa
                      aparecer selecionado — senão o select mostraria "Em teste"
                      e o admin salvaria uma mudança que não pediu. */}
                  {!STATUS_EDITAVEIS.some((s) => s.valor === assinatura.status) && (
                    <option value={assinatura.status} className="bg-slate-900">
                      {assinatura.status} (atual)
                    </option>
                  )}
                  {STATUS_EDITAVEIS.map((s) => (
                    <option key={s.valor} value={s.valor} className="bg-slate-900">
                      {s.rotulo}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                />
              </div>
              {/* O que cada status significa, sob o campo. "Ativo" e "Cortesia"
                  dão o MESMO acesso e diferem só no faturamento — sem esta
                  linha, a escolha entre os dois vira adivinhação e o MRR volta
                  a contar acesso liberado à mão. */}
              {AJUDA_STATUS[status] && (
                <p className="mt-2 text-[10px] leading-snug text-slate-500">{AJUDA_STATUS[status]}</p>
              )}
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">
                Estender trial
              </label>
              <div className="flex flex-wrap gap-2">
                {EXTENSOES_TRIAL.map((dias) => (
                  <button
                    key={dias}
                    type="button"
                    onClick={() => escolherExtensao(dias)}
                    aria-pressed={extensao?.dias === dias}
                    className={cn(
                      "inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl ring-1 ring-inset text-xs font-bold tabular-nums transition-[background-color,box-shadow,color] duration-200",
                      extensao?.dias === dias
                        ? "bg-blue-500/15 ring-blue-500/45 text-blue-300"
                        : "bg-slate-800/70 ring-slate-700/60 text-slate-300 hover:bg-slate-700/70"
                    )}
                  >
                    {extensao?.dias === dias && <Check size={12} strokeWidth={3} />}+{dias} dias
                  </button>
                ))}
                {extensao !== null && (
                  <button
                    type="button"
                    onClick={() => setExtensao(null)}
                    className="inline-flex items-center h-10 px-3 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Cancelar
                  </button>
                )}
              </div>
              <p
                className={cn(
                  "text-[10px] mt-2.5 leading-relaxed",
                  novoTrialIso ? "text-blue-300/90" : "text-slate-500"
                )}
              >
                {novoTrialIso
                  ? `Novo fim do trial: ${formatarData(novoTrialIso)} (contado a partir de hoje).`
                  : "A nova data é sempre contada a partir de hoje, não da data antiga."}
              </p>
            </div>

            {erroApi && (
              <p className="text-xs text-rose-300 bg-rose-500/10 ring-1 ring-inset ring-rose-500/25 rounded-xl px-3.5 py-3 leading-relaxed">
                {erroApi}
              </p>
            )}

            <div className="flex gap-2.5 pt-1">
              <button type="button" onClick={onFechar} className={cn(BOTAO_SEC, "flex-1 h-11")}>
                Fechar
              </button>
              <button
                type="button"
                // Limpa o erro ANTES de abrir a confirmação: um PATCH que falhou
                // devolve o admin para cá com o banner vermelho; sem este reset,
                // a tela de confirmação da PRÓXIMA tentativa abriria já exibindo
                // o erro antigo, como se a nova alteração tivesse falhado sem
                // nunca ter sido enviada. (Não limpo no onChange dos selects de
                // propósito: o admin ainda precisa ler o motivo enquanto corrige.)
                onClick={() => {
                  setErroApi(null);
                  setConfirmando(true);
                }}
                disabled={!temAlteracao}
                className={cn(BOTAO_PRI, "flex-1 h-11")}
                title={temAlteracao ? undefined : "Nenhuma alteração para aplicar"}
              >
                {temAlteracao ? (
                  <>
                    Revisar {alteracoes.length} alteração(ões)
                    <ArrowRight size={14} />
                  </>
                ) : (
                  "Nenhuma alteração"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function SubscriptionsPage() {
  // Filtros
  const [buscaTexto, setBuscaTexto] = useState("");
  const [busca, setBusca] = useState("");
  const [plano, setPlano] = useState("");
  const [status, setStatus] = useState("");
  const [soVencidos, setSoVencidos] = useState(false);

  // Paginação e ordenação
  const [pagina, setPagina] = useState(1);
  const [ordenar, setOrdenar] = useState("criadoEm");
  const [direcao, setDirecao] = useState<Direcao>("desc");

  // Dados
  const [dados, setDados] = useState<Lista | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  /** Contador para forçar refetch (botão atualizar, retry, pós-PATCH). */
  const [versao, setVersao] = useState(0);

  const [selecionada, setSelecionada] = useState<Assinatura | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Debounce da busca: 400ms. Sem isso, "joao@" dispararia 6 requisições —
  // e a última a responder nem sempre é a do texto mais recente.
  //
  // A volta para a página 1 acontece AQUI, no mesmo lote de estado da troca do
  // filtro (idem nos selects de plano e status), e não num efeito reativo
  // separado. Um efeito `useEffect(() => setPagina(1), [busca, plano, status])`
  // rodaria no mesmo commit que o efeito de fetch: o fetch dispararia primeiro
  // com (filtro novo, página antiga) e só no commit seguinte com a página 1 —
  // uma requisição inteira desperdiçada no servidor a cada troca de filtro fora
  // da primeira página (o abort cancela a resposta, não o trabalho já feito).
  //
  // O `if` evita o outro extremo: digitar e apagar dentro dos 400ms não muda a
  // busca de fato, então também não pode arrancar o admin da página em que ele
  // está. `busca` está nas dependências para o efeito nunca comparar contra um
  // valor velho.
  useEffect(() => {
    const t = setTimeout(() => {
      const limpo = buscaTexto.trim();
      if (limpo === busca) return;
      setBusca(limpo);
      setPagina(1);
    }, 400);
    return () => clearTimeout(t);
  }, [buscaTexto, busca]);

  useEffect(() => {
    // `vivo` + abort: com o debounce e a troca de página é fácil ter duas
    // respostas em voo. Sem isso, a mais lenta chega por último e sobrescreve
    // a tela com o resultado do filtro anterior.
    let vivo = true;
    const controlador = new AbortController();

    async function carregar() {
      setCarregando(true);
      setErro(null);

      const params = new URLSearchParams({
        pagina: String(pagina),
        porPagina: String(POR_PAGINA),
        ordenar,
        direcao,
      });
      if (busca) params.set("busca", busca);
      if (plano) params.set("plano", plano);
      if (status) params.set("status", status);

      try {
        const res = await fetch(`/api/admin/subscriptions?${params.toString()}`, {
          cache: "no-store",
          signal: controlador.signal,
        });
        const corpo = await res.json().catch(() => null);
        if (!vivo) return;
        if (!res.ok) {
          setErro(texto(corpo?.error) ?? `Não foi possível carregar a lista (HTTP ${res.status}).`);
          setDados(null);
          return;
        }
        setDados(normalizarLista(corpo));
      } catch {
        // AbortError também cai aqui; o guard `vivo` impede que ele apareça
        // como erro de verdade para o usuário.
        if (!vivo) return;
        setErro("Falha de conexão ao buscar as assinaturas.");
        setDados(null);
      } finally {
        if (vivo) setCarregando(false);
      }
    }

    carregar();
    return () => {
      vivo = false;
      controlador.abort();
    };
  }, [busca, plano, status, pagina, ordenar, direcao, versao]);

  // Aviso de sucesso some sozinho — não vira lixo permanente no topo da tela.
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(t);
  }, [aviso]);

  const itens = dados?.itens ?? [];

  /**
   * "Só vencidos" é filtro de CLIENTE: a API não expõe `vencido` como query
   * (ele é derivado de status + datas na resposta). Por isso ele recorta
   * apenas a página carregada — e a UI avisa isso em texto logo abaixo.
   */
  const visiveis = useMemo(() => (soVencidos ? itens.filter((i) => i.vencido) : itens), [itens, soVencidos]);

  /**
   * Resumo da PÁGINA carregada — conta `itens`, não `visiveis`.
   *
   * Com o recorte "só vencidos" ligado, contar `visiveis` faria o tile "Ativas"
   * passar a significar "ativas E vencidas" e "Em teste" virar "em teste E
   * vencidas", sem que o rótulo mudasse. Número certo respondendo outra
   * pergunta é pior que número errado: o admin não tem como desconfiar.
   */
  const resumo = useMemo(() => {
    let ativos = 0;
    let emTrial = 0;
    let vencidos = 0;
    for (const i of itens) {
      if (i.status === "active") ativos++;
      if (i.status === "trialing") emTrial++;
      if (i.vencido) vencidos++;
    }
    return { ativos, emTrial, vencidos };
  }, [itens]);

  /**
   * Quantos filtros estão ativos — só alimenta o contador do painel de filtros.
   * Lê exatamente os mesmos valores de sempre (`busca` já debounced, não o
   * texto sendo digitado), então o contador nunca discorda da lista na tela.
   */
  const qtdFiltros =
    (busca !== "" ? 1 : 0) + (plano !== "" ? 1 : 0) + (status !== "" ? 1 : 0) + (soVencidos ? 1 : 0);
  const temFiltro = qtdFiltros > 0;

  function alternarOrdenacao(campo: string) {
    if (ordenar === campo) {
      setDirecao(direcao === "asc" ? "desc" : "asc");
    } else {
      setOrdenar(campo);
      // Texto começa em A→Z; data/valor começa do mais recente/maior.
      setDirecao(campo === "nome" || campo === "email" ? "asc" : "desc");
    }
    setPagina(1);
  }

  function limparFiltros() {
    setBuscaTexto("");
    setBusca("");
    setPlano("");
    setStatus("");
    setSoVencidos(false);
    setPagina(1);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-blue-500/10 ring-1 ring-inset ring-blue-500/25 text-blue-400 grid place-items-center shrink-0">
            <CreditCard size={19} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black text-slate-100 tracking-tight leading-tight">Assinaturas</h1>
            <p className="text-xs text-slate-500 mt-1 tabular-nums">
              {/* O ramo de erro vem ANTES do total: quando a carga falha, `dados`
                  é null e o `?? 0` escreveria "0 assinatura(s) no filtro atual"
                  logo acima do <EstadoErro> — zero-por-erro com cara de número
                  real. */}
              {carregando && !dados
                ? "Carregando assinaturas..."
                : erro
                  ? "Não foi possível carregar o total"
                  : `${formatarNumero(dados?.total ?? 0)} assinatura(s) no filtro atual`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setVersao((v) => v + 1)}
            disabled={carregando}
            className={BOTAO_SEC}
            title="Recarregar a lista"
          >
            <RefreshCw size={13} className={carregando ? "animate-spin" : undefined} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={() => exportarCsv(visiveis)}
            disabled={visiveis.length === 0}
            className={BOTAO_SEC}
            title="Baixa em CSV as linhas visíveis nesta página"
          >
            <Download size={13} />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Confirmação de alteração */}
      {aviso && (
        <div className="flex items-center gap-2.5 bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/25 rounded-2xl px-4 py-3">
          <Check size={15} strokeWidth={3} className="text-emerald-400 shrink-0" />
          <p className="text-xs text-emerald-200 flex-1 min-w-0">{aviso}</p>
          <button
            type="button"
            onClick={() => setAviso(null)}
            className="text-emerald-500/70 hover:text-emerald-300 transition-colors"
            aria-label="Fechar aviso"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Faixa de resumo */}
      <div className="space-y-3">
        {/* O escopo dos números mora na `descricao` da própria Secao (text-xs
            slate-500, o mesmo par da tela de contas) e não mais numa nota de
            10px em slate-600 abaixo dos cards: era o texto que impede o admin de
            ler os números como total da base, escrito no menor tamanho e no
            menor contraste da tela. */}
        <Secao
          titulo="Panorama"
          descricao={`Ativas, em teste e vencidas contam apenas as ${formatarNumero(
            itens.length
          )} linha(s) carregadas nesta página — o recorte "só vencidos" não muda esses números. O total considera o filtro inteiro.`}
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* `indisponivel` em todos: quando a carga falha, `dados` é null e
              `resumo` conta uma lista vazia — os quatro cards sairiam com zero
              real ("Ativas 0") logo acima do <EstadoErro> dizendo que não deu
              para carregar. O estado "indisponível" é justamente o que impede
              esse zero-por-erro de passar por número. */}
          <CardKpi
            titulo="Total no filtro"
            valor={dados?.total ?? 0}
            sufixo="todas as páginas"
            icone={<CreditCard size={16} />}
            carregando={carregando && !dados}
            indisponivel={erro !== null}
            destaque
          />
          <CardKpi
            titulo="Ativas"
            valor={resumo.ativos}
            sufixo="nesta página"
            icone={<BadgeCheck size={16} />}
            tom="bom"
            carregando={carregando && !dados}
            indisponivel={erro !== null}
          />
          <CardKpi
            titulo="Em teste"
            valor={resumo.emTrial}
            sufixo="nesta página"
            icone={<Clock size={16} />}
            carregando={carregando && !dados}
            indisponivel={erro !== null}
          />
          <CardKpi
            titulo="Vencidas"
            valor={resumo.vencidos}
            sufixo="exigem ação"
            icone={<AlertTriangle size={16} />}
            // O acento âmbar só acende quando há algo vencido: um card sempre
            // alarmado deixa de significar alarme.
            tom={resumo.vencidos > 0 ? "atencao" : "neutro"}
            carregando={carregando && !dados}
            indisponivel={erro !== null}
          />
        </div>
      </div>

      {/* Filtros — painel único: cabeçalho com contador + limpar, e uma fileira
          de campos todos com a mesma altura. */}
      <div className="glass-panel rounded-2xl p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <SlidersHorizontal size={12} className="text-slate-500 shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Filtros</span>
            {qtdFiltros > 0 && (
              <span className="text-[9px] font-bold px-2 py-[3px] rounded-full bg-blue-500/10 ring-1 ring-inset ring-blue-500/25 text-blue-300 tabular-nums whitespace-nowrap">
                {qtdFiltros} {qtdFiltros === 1 ? "ativo" : "ativos"}
              </span>
            )}
          </div>
          {temFiltro && (
            <button
              type="button"
              onClick={limparFiltros}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[11px] font-bold text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 transition-[background-color,color] duration-200 shrink-0"
            >
              <X size={12} />
              Limpar filtros
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={buscaTexto}
              onChange={(e) => setBuscaTexto(e.target.value)}
              placeholder="Buscar por email ou nome..."
              // placeholder não é nome acessível: some ao digitar e nem todo
              // leitor de tela o anuncia.
              aria-label="Buscar por email ou nome"
              className={cn(CAMPO, "w-full pl-9 pr-9")}
            />
            {buscaTexto !== "" && (
              <button
                type="button"
                onClick={() => setBuscaTexto("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                aria-label="Limpar busca"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* `appearance-none` é o padrão dos filtros do painel (ver o componente
              Selecao em accounts/page.tsx), mas ele apaga a seta nativa — então a
              seta é desenhada aqui. Sem ela o campo parece um input desabilitado e
              nada indica que abre um menu. As <option> levam bg-slate-900 porque
              o menu nativo não herda o tema escuro em todo navegador. */}
          <div className="relative">
            <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <select
              value={plano}
              onChange={(e) => {
                setPlano(e.target.value);
                setPagina(1);
              }}
              aria-label="Filtrar por plano"
              className={cn(CAMPO, "pl-9 pr-9 appearance-none cursor-pointer")}
            >
              <option value="" className="bg-slate-900">
                Todos os planos
              </option>
              {PLANOS.map((p) => (
                <option key={p} value={p} className="bg-slate-900">
                  {rotuloPlano(p)}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPagina(1);
              }}
              aria-label="Filtrar por status"
              className={cn(CAMPO, "pr-9 appearance-none cursor-pointer")}
            >
              <option value="" className="bg-slate-900">
                Todos os status
              </option>
              {STATUS_EDITAVEIS.map((s) => (
                <option key={s.valor} value={s.valor} className="bg-slate-900">
                  {s.rotulo}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>

          <button
            type="button"
            onClick={() => setSoVencidos(!soVencidos)}
            // Botão que liga/desliga um recorte: sem aria-pressed o leitor de tela
            // anuncia "Só vencidos" igual, ligado ou desligado.
            aria-pressed={soVencidos}
            className={cn(
              "inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl ring-1 ring-inset text-xs font-bold transition-[background-color,box-shadow,color] duration-200",
              soVencidos
                ? "bg-amber-500/15 ring-amber-500/45 text-amber-300"
                : "bg-slate-800/70 ring-slate-700/60 text-slate-300 hover:bg-slate-700/70"
            )}
            title="Recorta as assinaturas vencidas desta página"
          >
            <AlertTriangle size={13} />
            Só vencidos
          </button>
        </div>

        {soVencidos && (
          <p className="text-[10px] text-amber-300/80 leading-relaxed">
            O filtro &quot;só vencidos&quot; é aplicado sobre as linhas desta página — navegue pelas páginas para ver
            as demais.
          </p>
        )}
      </div>

      {/* Conteúdo */}
      {/* -mb-3 encosta o cabeçalho na tabela: com o space-y-6 da página o título
          ficaria à mesma distância do painel de filtros e da tabela, e deixaria
          de parecer o rótulo de alguma coisa. */}
      <Secao
        className="-mb-3"
        titulo="Assinaturas"
        descricao="Clique no nome para abrir a conta; em Gerenciar para trocar plano, status ou estender o trial."
        acao={
          <span className="text-[11px] text-slate-500 tabular-nums">
            {formatarNumero(visiveis.length)} linha(s) nesta página
          </span>
        }
      />

      {erro ? (
        <EstadoErro mensagem={erro} onTentarNovamente={() => setVersao((v) => v + 1)} />
      ) : carregando && !dados ? (
        <TabelaSkeleton />
      ) : visiveis.length === 0 ? (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <EstadoVazio
            icone={<CreditCard size={20} />}
            titulo={temFiltro ? "Nenhuma assinatura com esses filtros" : "Nenhuma assinatura cadastrada"}
            descricao={
              soVencidos && itens.length > 0
                ? "Nenhuma das assinaturas desta página está vencida. Tente outra página ou remova o filtro."
                : temFiltro
                  ? "Ajuste a busca, o plano ou o status para ver outros resultados."
                  : "Assim que o primeiro cliente criar conta, a assinatura de trial dele aparece aqui."
            }
            acao={
              temFiltro ? (
                <button type="button" onClick={limparFiltros} className={BOTAO_SEC}>
                  <X size={13} />
                  Limpar filtros
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div
          className={cn(
            "glass-panel rounded-2xl overflow-hidden transition-opacity",
            // Recarga em cima de dados já visíveis: esmaece em vez de trocar
            // tudo por skeleton (a tabela não "pisca" a cada tecla da busca).
            carregando && "opacity-50 pointer-events-none"
          )}
        >
          {/* O scroll vertical é DESTE contêiner (e não da página): é o que faz
              o cabeçalho sticky ter contra o que grudar. Um `overflow-x-auto`
              solto, com altura automática, não rola nada na vertical e o sticky
              vira decoração. */}
          <div className="overflow-auto max-h-[68vh]">
            <table className="w-full text-sm min-w-[1140px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <ThOrdenavel rotulo="Usuário" campo="nome" ordenar={ordenar} direcao={direcao} onOrdenar={alternarOrdenacao} />
                  <ThOrdenavel rotulo="Plano" campo="plano" ordenar={ordenar} direcao={direcao} onOrdenar={alternarOrdenacao} />
                  <ThOrdenavel rotulo="Status" campo="status" ordenar={ordenar} direcao={direcao} onOrdenar={alternarOrdenacao} />
                  {/* Valor mensal não é ordenável: é derivado da tabela de
                      preços no servidor, não existe como coluna no banco. */}
                  <th scope="col" className={cn(CELULA_TH, "text-right")}>
                    Valor mensal
                  </th>
                  <ThOrdenavel
                    rotulo="Trial termina em"
                    campo="trialEndsAt"
                    ordenar={ordenar}
                    direcao={direcao}
                    onOrdenar={alternarOrdenacao}
                  />
                  <th scope="col" className={CELULA_TH}>
                    Dias restantes
                  </th>
                  <ThOrdenavel
                    rotulo="Fim do período"
                    campo="currentPeriodEnd"
                    ordenar={ordenar}
                    direcao={direcao}
                    onOrdenar={alternarOrdenacao}
                  />
                  <ThOrdenavel
                    rotulo="Criado em"
                    campo="criadoEm"
                    ordenar={ordenar}
                    direcao={direcao}
                    onOrdenar={alternarOrdenacao}
                  />
                  <th scope="col" className={cn(CELULA_TH, "text-right")}>
                    Ações
                  </th>
                </tr>
              </thead>
              {/* divide-y não funciona com border-separate (é o que o sticky
                  exige para a borda do cabeçalho não sumir), então o separador
                  vai como border-top em cada célula, via seletor de filho. O
                  `:not(:first-child)` evita a linha dupla logo abaixo do
                  cabeçalho, que já tem a borda dele. */}
              <tbody className="[&>tr:not(:first-child)>td]:border-t [&>tr>td]:border-slate-800/60">
                {visiveis.map((item) => {
                  const trial = descreverTrial(item);
                  return (
                    <tr
                      key={item.id}
                      className={cn(
                        // Só background-color na transição: com `transition-all`
                        // o hover animaria também largura/cor de texto e a linha
                        // "borracharia" a cada passada do mouse.
                        "group transition-[background-color] duration-200",
                        item.vencido ? "bg-amber-500/[0.06] hover:bg-amber-500/[0.11]" : "hover:bg-slate-800/50"
                      )}
                    >
                      <td className="relative px-5 py-3">
                        {/* Barra âmbar na sangria da linha vencida: a mesma
                            informação do ícone de alerta, legível de longe e sem
                            depender de cor sozinha (o ícone segue ali). */}
                        {item.vencido && (
                          <span aria-hidden className="absolute left-0 inset-y-0 w-[3px] bg-amber-400/70" />
                        )}
                        <a
                          href={`/admin/accounts/${item.userId}`}
                          className="flex items-center gap-3 min-w-0 group/link"
                        >
                          <Avatar nome={item.nome} email={item.email} />
                          <span className="block min-w-0">
                            <span className="block font-bold text-slate-100 truncate max-w-[220px] group-hover/link:text-blue-300 transition-colors">
                              {item.nome ?? "Sem nome"}
                            </span>
                            <span className="block text-[11px] text-slate-500 truncate max-w-[220px]">{item.email}</span>
                          </span>
                        </a>
                      </td>
                      <td className="px-5 py-3">
                        <BadgePlano plano={item.plano} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          <BadgeStatus status={item.status} />
                          {/* O status gravado mente por omissão: nada roda de
                              madrugada dando baixa em trial vencido, então um
                              "Em teste" pode ser um trial morto há semanas.
                              O ícone é o que denuncia isso na linha. */}
                          {item.vencido && (
                            <AlertTriangle size={12} className="text-amber-400 shrink-0" aria-label="Assinatura vencida" />
                          )}
                        </div>
                      </td>
                      <td
                        className="px-5 py-3 text-right text-xs font-bold text-slate-200 tabular-nums whitespace-nowrap"
                        title="Preço de tabela do plano"
                      >
                        {formatarMoeda(item.valorMensal)}
                      </td>
                      <td className="px-5 py-3 text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                        {formatarData(item.trialEndsAt)}
                      </td>
                      <td
                        className={cn(
                          "px-5 py-3 text-[11px] whitespace-nowrap",
                          trial.alerta ? "text-amber-300 font-bold" : "text-slate-400"
                        )}
                      >
                        {trial.rotulo}
                      </td>
                      <td className="px-5 py-3 text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                        {formatarData(item.currentPeriodEnd)}
                      </td>
                      <td className="px-5 py-3 text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                        {formatarData(item.criadoEm)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelecionada(item)}
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-800/70 ring-1 ring-inset ring-slate-700/60 text-[11px] font-bold text-slate-300 hover:bg-blue-500/10 hover:ring-blue-500/40 hover:text-blue-300 transition-[background-color,box-shadow,color] duration-200"
                        >
                          <SlidersHorizontal size={12} />
                          Gerenciar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Paginação continua visível mesmo com a página vazia por causa do
          "só vencidos": sem ela o admin ficaria preso num recorte vazio, sem
          como avançar para a página seguinte. Só some quando não há resultado
          nenhum no filtro (o <Paginacao> já se apaga sozinho com total 0). */}
      {!erro && dados && (
        <Paginacao
          pagina={dados.pagina}
          totalPaginas={dados.totalPaginas}
          total={dados.total}
          porPagina={dados.porPagina}
          onMudar={setPagina}
        />
      )}

      {/* A `key` remonta o modal ao trocar de linha: sem ela os selects
          manteriam o estado da assinatura anterior e o admin poderia salvar
          um plano que só viu por acidente. */}
      {selecionada && (
        <ModalAcoes
          key={selecionada.id}
          assinatura={selecionada}
          onFechar={() => setSelecionada(null)}
          onSalvo={(mensagem) => {
            setSelecionada(null);
            setAviso(mensagem);
            // Refetch: o PATCH mexe em campos derivados (accountsLimit,
            // vencido, diasRestantesTrial) que só o servidor sabe recalcular.
            setVersao((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}

// ─── Skeleton da tabela ───────────────────────────────────────────────────────

/**
 * Mostra a FORMA da tabela enquanto carrega (o painel migrou de spinner central
 * para skeleton). As larguras variam de propósito: blocos idênticos parecem
 * grade quebrada, não conteúdo chegando.
 */
function TabelaSkeleton() {
  const larguras = ["w-16", "w-20", "w-20", "w-24", "w-24", "w-24", "w-24", "w-20"];
  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[1140px]">
          {/* px-5 py-3.5 no cabeçalho e px-5 py-3 nas linhas: as MESMAS medidas
              do CELULA_TH e das células reais. Qualquer diferença aqui vira um
              salto de altura no instante em que os dados chegam. */}
          <div className="flex items-center gap-6 px-5 py-3.5 bg-slate-900 border-b border-slate-700/60">
            <Skeleton className="h-2.5 w-40" />
            {larguras.map((l, i) => (
              <Skeleton key={i} className={cn("h-2.5", l)} />
            ))}
          </div>
          <div className="divide-y divide-slate-800/60">
            {Array.from({ length: 8 }).map((_, linha) => (
              <div key={linha} className="flex items-center gap-6 px-5 py-3">
                {/* A primeira coluna repete a forma da célula de identidade
                    (avatar + duas linhas): skeleton que não imita o layout
                    entrega uma tela que "pula" quando os dados chegam. */}
                <div className="flex items-center gap-3 w-40 shrink-0">
                  <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-2 w-3/4" />
                  </div>
                </div>
                {larguras.map((l, i) => (
                  <Skeleton key={i} className={cn("h-3", l)} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
