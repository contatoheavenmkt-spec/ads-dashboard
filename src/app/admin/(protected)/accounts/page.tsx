"use client";

/**
 * /admin/accounts — gestão de usuários.
 *
 * Consome GET /api/admin/accounts, que é retrocompatível de propósito: continua
 * devolvendo `users` e `total` (o que esta tela já lia) e ACRESCENTOU
 * `paginacao`, `filtros`, `ordenacao` e os campos pt-BR por usuário
 * (`plano`, `statusAssinatura`, `qtdWorkspaces`, `qtdIntegracoes`,
 * `ultimoAcesso`, `online`, `ativo`).
 *
 * Por isso todo campo novo é lido com fallback para o campo antigo equivalente:
 * se a API for revertida para a versão anterior, a tabela degrada (sem último
 * acesso / sem workspaces) em vez de quebrar.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  Shield,
  SlidersHorizontal,
  UserCheck,
  Users,
  UserX,
  Wifi,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
  formatarDataHora,
  formatarNumero,
  tempoRelativo,
} from "../../_components/admin-ui";

// ─── Contrato da API ──────────────────────────────────────────────────────────

interface UsuarioAdmin {
  id: string;
  /** Opcional na tipagem (a API sempre manda) só para que um registro
   *  truncado por qualquer motivo caia no fallback em vez de virar "undefined". */
  email?: string | null;
  /** Campo antigo. A API manda `nome` com o mesmo valor; um dos dois basta. */
  name?: string | null;
  nome?: string | null;
  role?: string | null;
  createdAt?: string | null;
  criadoEm?: string | null;
  plano?: string | null;
  statusAssinatura?: string | null;
  qtdWorkspaces?: number | null;
  qtdIntegracoes?: number | null;
  /** ISO ou null — null significa literalmente "nunca acessou". */
  ultimoAcesso?: string | null;
  online?: boolean | null;
  ativo?: boolean | null;
  onboardingCompleted?: boolean | null;
  subscription?: { plan?: string | null; status?: string | null } | null;
  _count?: { metaConnections?: number | null; googleConnections?: number | null } | null;
}

interface PaginacaoApi {
  pagina?: number;
  porPagina?: number;
  total?: number;
  totalPaginas?: number;
}

interface RespostaContas {
  users?: UsuarioAdmin[];
  total?: number;
  limit?: number;
  paginacao?: PaginacaoApi;
  /** A rota avisa aqui quando cai no fallback de ordenação (conjunto grande). */
  aviso?: string;
}

// ─── Constantes de filtro/ordenação ───────────────────────────────────────────

const POR_PAGINA = 25;
/** Mesma janela de "online" usada pela rota (ActiveSession.lastSeen ≤ 5 min). */
const JANELA_ONLINE = "últimos 5 minutos";

type Direcao = "asc" | "desc";
type CampoOrdenacao =
  | "criadoEm"
  | "email"
  | "nome"
  | "role"
  | "plano"
  | "statusAssinatura"
  | "ultimoAcesso";

/** Espelha `direcaoPadrao` da rota: texto cresce A→Z, data começa pela mais recente. */
function direcaoPadrao(campo: CampoOrdenacao): Direcao {
  return campo === "criadoEm" || campo === "ultimoAcesso" ? "desc" : "asc";
}

/**
 * Valor de `aria-sort` do <th>. Visualmente a ordenação só existe nas setinhas
 * do cabeçalho; sem este atributo um leitor de tela não anuncia qual coluna
 * ordena a tabela nem em que direção. Coluna não ordenável devolve `undefined`
 * (omitir o atributo) — "none" ali significaria "ordenável, mas não ordenada".
 */
function valorAriaSort(
  campo: CampoOrdenacao | undefined,
  campoAtivo: CampoOrdenacao,
  direcao: Direcao
): "ascending" | "descending" | "none" | undefined {
  if (!campo) return undefined;
  if (campo !== campoAtivo) return "none";
  return direcao === "asc" ? "ascending" : "descending";
}

/** Whitelists idênticas às da rota — enviar valor fora daqui seria ignorado. */
const OPCOES_ROLE = [
  { valor: "", rotulo: "Todos os perfis" },
  { valor: "AGENCY", rotulo: "Agência" },
  { valor: "CLIENT", rotulo: "Cliente" },
  { valor: "ADMIN", rotulo: "Admin" },
];

const OPCOES_PLANO = [
  { valor: "", rotulo: "Todos os planos" },
  { valor: "trial", rotulo: "Trial" },
  { valor: "start", rotulo: "Start" },
  { valor: "plus", rotulo: "Plus" },
  { valor: "premium", rotulo: "Premium" },
];

const OPCOES_STATUS = [
  { valor: "", rotulo: "Todas as assinaturas" },
  { valor: "active", rotulo: "Ativa" },
  { valor: "trialing", rotulo: "Em teste" },
  { valor: "expired", rotulo: "Expirada" },
  { valor: "canceled", rotulo: "Cancelada" },
];

type FiltroAtividade = "todos" | "ativos" | "inativos";

const OPCOES_ATIVIDADE: Array<{ valor: FiltroAtividade; rotulo: string }> = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

const ROTULO_ROLE: Record<string, string> = {
  AGENCY: "Agência",
  CLIENT: "Cliente",
  ADMIN: "Admin",
};

/** Nome de exibição do plano. Mesma lista do filtro — plano desconhecido cai no
 *  fallback capitalizado em vez de sumir da célula. */
const ROTULO_PLANO: Record<string, string> = {
  trial: "Trial",
  start: "Start",
  plus: "Plus",
  premium: "Premium",
};

/*
 * Chrome compartilhado da tela (mesmas medidas de /admin/subscriptions).
 *
 * Altura fixa (h-10) em todo campo e botão da barra de filtros: sem ela, input,
 * select e botão fecham com 1–3px de diferença e a fileira ganha degraus.
 *
 * `ring-1 ring-inset` no lugar de `border`: os campos vivem dentro de um painel
 * `.glass-panel`, que define o shorthand `border` — sobrescrever a cor por
 * utilitário dependeria da ordem no CSS gerado.
 */
const CAMPO =
  "h-10 rounded-xl bg-slate-950/40 px-3 text-sm text-slate-100 placeholder-slate-600 ring-1 ring-inset ring-slate-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500/60 transition-[background-color,box-shadow] duration-200";

const COLUNAS: Array<{ rotulo: string; campo?: CampoOrdenacao; alinharDireita?: boolean }> = [
  { rotulo: "Usuário", campo: "nome" },
  { rotulo: "Perfil", campo: "role" },
  { rotulo: "Plano", campo: "plano" },
  { rotulo: "Assinatura", campo: "statusAssinatura" },
  { rotulo: "Workspaces", alinharDireita: true },
  { rotulo: "Integrações", alinharDireita: true },
  { rotulo: "Último acesso", campo: "ultimoAcesso" },
  { rotulo: "Cadastro", campo: "criadoEm" },
  // Coluna de ações: sem rótulo visível, mas alinhada à direita como as células.
  { rotulo: "", alinharDireita: true },
];

// ─── Helpers locais ───────────────────────────────────────────────────────────

/**
 * Erro criado por NÓS a partir de uma resposta HTTP ruim.
 *
 * Existe só para separá-lo dos erros que o navegador lança: `fetch` rejeita com
 * `TypeError("Failed to fetch")` quando não há rede/DNS/conexão, e `res.json()`
 * rejeita com `SyntaxError("Unexpected token '<'...")` quando um proxy devolve
 * HTML com status 200. Ambos são `instanceof Error`, então jogar `e.message` na
 * tela colocaria texto em INGLÊS na frente do admin. Só a mensagem desta
 * subclasse é escrita por nós e, portanto, segura para renderizar.
 */
class ErroDaApi extends Error {}

/** Número utilizável ou null — protege contra `null`/string/NaN vindos do JSON. */
function numeroOuNulo(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * "há 3min" a partir de um ISO, reaproveitando o `tempoRelativo` (que recebe
 * segundos) do admin-ui. Devolve null quando não há data legível, para quem
 * chama poder escolher entre "nunca acessou" e simplesmente omitir.
 *
 * Date.now() só é lido depois que os dados chegam do fetch (client-side), então
 * não existe render do servidor com esse valor — sem risco de hydration mismatch.
 */
function relativoDesde(iso: string | null | undefined): string | null {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return tempoRelativo((Date.now() - t) / 1000);
}

/** Ponto verde pulsante — só aparece para quem está online agora. */
function PontoOnline() {
  return (
    <span
      className="relative flex w-2 h-2 shrink-0"
      title={`Online agora (${JANELA_ONLINE})`}
      aria-label="Usuário online agora"
    >
      {/* Duas camadas: o halo anima (animate-ping) e o miolo fica fixo, senão o
          ponto some no meio da animação e vira um "pisca" difícil de notar. */}
      <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
      <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
    </span>
  );
}

/**
 * Perfil do usuário — mesma anatomia do <BadgeStatus> e do <BadgePlano>: caixa
 * neutra, texto em cor de texto e a identidade morando na MARCA ao lado.
 *
 * ADMIN precisa saltar aos olhos (é a conta com poder sobre o painel inteiro, e
 * localizá-la de relance é requisito de segurança), mas o sinal não pode ser
 * cor sozinha: antes o âmbar pintava a palavra inteira, o que (a) usava uma cor
 * de STATUS para identificar uma categoria e (b) sumia para quem não distingue
 * âmbar de cinza claro. Agora o sinal é ÍCONE + RÓTULO — o escudo âmbar aparece
 * só no ADMIN e continua reconhecível pela forma, sem depender do matiz.
 */
function BadgePerfil({ role }: { role: string | null | undefined }) {
  const chave = typeof role === "string" ? role.trim().toUpperCase() : "";
  if (chave === "") return <span className="text-[11px] text-slate-500">—</span>;

  const admin = chave === "ADMIN";

  return (
    <span className="inline-flex items-center gap-1.5 text-[9px] font-bold px-2 py-[3px] rounded-full bg-slate-800/70 ring-1 ring-inset ring-slate-700/60 text-slate-300 uppercase tracking-wide whitespace-nowrap">
      {admin && <Shield size={10} strokeWidth={2.5} className="text-amber-400 shrink-0" aria-hidden />}
      {ROTULO_ROLE[chave] ?? role}
    </span>
  );
}

/**
 * Plano do usuário — mesma anatomia do <BadgeStatus>: caixa neutra, texto em cor
 * de texto e a identidade morando no PONTO colorido ao lado.
 *
 * Antes o plano era renderizado pelo próprio <BadgeStatus>, que só conhece
 * status ("active", "trialing"…): "start", "plus" e "premium" caíam todos no
 * cinza de status desconhecido, ou seja, três planos com a mesma aparência.
 * Agora a cor vem de `corDoPlano` (PALETA_PLANO do admin-ui), validada contra o
 * fundo escuro, e o nome escrito por extenso é a codificação secundária que a
 * paleta exige — a cor nunca identifica o plano sozinha.
 */
function BadgePlano({ plano }: { plano: string }) {
  const chave = typeof plano === "string" ? plano.trim().toLowerCase() : "";
  const rotulo =
    ROTULO_PLANO[chave] ?? (chave === "" ? "—" : chave.charAt(0).toUpperCase() + chave.slice(1));

  return (
    <span className="inline-flex items-center gap-1.5 text-[9px] font-bold px-2 py-[3px] rounded-full bg-slate-800/70 ring-1 ring-inset ring-slate-700/60 text-slate-300 uppercase tracking-wide whitespace-nowrap">
      <span
        aria-hidden
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: corDoPlano(chave) }}
      />
      {rotulo}
    </span>
  );
}

/**
 * Iniciais do avatar: primeira letra do primeiro e do último nome, ou a primeira
 * letra do email quando o cadastro não tem nome. Nunca devolve string vazia — um
 * círculo em branco na tabela lê como imagem quebrada, não como "sem nome".
 */
function iniciais(nome: string | null | undefined, email: string | null | undefined): string {
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

/** Avatar circular gerado das iniciais. Decorativo: nome e email estão escritos
 *  ao lado, então o leitor de tela não precisa ouvir "AB". Conta inativa entra
 *  apagada, no mesmo tom do texto da linha. */
function Avatar({
  nome,
  email,
  apagado = false,
}: {
  nome: string | null | undefined;
  email: string | null | undefined;
  apagado?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid place-items-center w-9 h-9 rounded-full shrink-0 text-[11px] font-black tracking-wide ring-1 ring-inset",
        apagado
          ? "bg-slate-800/70 text-slate-500 ring-slate-700/50"
          : "bg-gradient-to-br from-slate-700/80 to-slate-800 text-slate-300 ring-slate-600/40"
      )}
    >
      {iniciais(nome, email)}
    </span>
  );
}

/**
 * Select padronizado dos filtros.
 *
 * `appearance-none` (padrão do projeto) apaga a setinha nativa, então
 * desenhamos uma — sem ela o campo parece um input desabilitado e ninguém
 * descobre que dá pra clicar. As <option> levam bg-slate-900 explícito porque
 * o menu nativo não herda o tema escuro da página em todos os navegadores.
 */
function Selecao({
  valor,
  aoMudar,
  opcoes,
  rotulo,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  opcoes: Array<{ valor: string; rotulo: string }>;
  rotulo: string;
}) {
  return (
    <div className="relative">
      <select
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        aria-label={rotulo}
        className={cn(CAMPO, "pr-9 text-slate-300 appearance-none cursor-pointer")}
      >
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor} className="bg-slate-900">
            {o.rotulo}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
      />
    </div>
  );
}

function CabecalhoOrdenavel({
  rotulo,
  campo,
  campoAtivo,
  direcao,
  onOrdenar,
}: {
  rotulo: string;
  campo: CampoOrdenacao;
  campoAtivo: CampoOrdenacao;
  direcao: Direcao;
  onOrdenar: (campo: CampoOrdenacao) => void;
}) {
  const ativo = campoAtivo === campo;
  return (
    // inline-flex (e não flex): assim o botão continua sendo conteúdo em linha
    // do <th> e obedece ao text-left/text-right da coluna. Um `flex` viraria
    // bloco de largura total e ignoraria o alinhamento do cabeçalho.
    <button
      type="button"
      onClick={() => onOrdenar(campo)}
      className={cn(
        "group inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-colors align-middle",
        ativo ? "text-blue-400" : "text-slate-500 hover:text-slate-300"
      )}
      title={`Ordenar por ${rotulo.toLowerCase()}`}
    >
      {rotulo}
      {/* Seta só na coluna ativa. Nas demais fica um ícone neutro bem apagado:
          some do olhar, mas anuncia que a coluna é clicável. */}
      {ativo ? (
        direcao === "asc" ? <ArrowUp size={11} strokeWidth={3} /> : <ArrowDown size={11} strokeWidth={3} />
      ) : (
        <ArrowUpDown size={11} className="text-slate-700 group-hover:text-slate-500 transition-colors" />
      )}
    </button>
  );
}

/** Linhas cinzas no lugar da tabela durante a PRIMEIRA carga. Repete a FORMA das
 *  células reais (inclusive o avatar) — skeleton que não imita o layout entrega
 *  uma tela que "pula" quando os dados chegam.
 *
 *  Por isso o padding é `px-5 py-3`, exatamente o das células reais (e não o
 *  `py-3.5` do cabeçalho): 4px a mais por linha, em oito linhas, é a tabela
 *  encolhendo ~32px no instante em que a lista aparece. */
function EsqueletoTabela() {
  return (
    <tbody className="[&>tr:not(:first-child)>td]:border-t [&>tr>td]:border-slate-800/60">
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i}>
          <td className="px-5 py-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full shrink-0" />
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-2.5 w-44" />
              </div>
            </div>
          </td>
          <td className="px-5 py-3"><Skeleton className="h-4 w-16 rounded-full" /></td>
          <td className="px-5 py-3"><Skeleton className="h-4 w-16 rounded-full" /></td>
          <td className="px-5 py-3"><Skeleton className="h-4 w-20 rounded-full" /></td>
          <td className="px-5 py-3"><Skeleton className="h-3 w-6 ml-auto" /></td>
          <td className="px-5 py-3"><Skeleton className="h-3 w-6 ml-auto" /></td>
          <td className="px-5 py-3">
            <Skeleton className="h-3 w-24 mb-1.5" />
            <Skeleton className="h-2.5 w-14" />
          </td>
          <td className="px-5 py-3"><Skeleton className="h-3 w-20" /></td>
          <td className="px-5 py-3"><Skeleton className="h-3 w-10" /></td>
        </tr>
      ))}
    </tbody>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function AccountsPage() {
  // Filtros. `busca` é o que está digitado; `buscaAplicada` é o que já foi
  // debounced e virou query — separar os dois é o que evita um GET por tecla.
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [role, setRole] = useState("");
  const [plano, setPlano] = useState("");
  const [status, setStatus] = useState("");
  const [atividade, setAtividade] = useState<FiltroAtividade>("todos");

  // Ordenação e página
  const [ordenar, setOrdenar] = useState<CampoOrdenacao>("criadoEm");
  const [direcao, setDirecao] = useState<Direcao>("desc");
  const [pagina, setPagina] = useState(1);

  // Dados
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [porPaginaApi, setPorPaginaApi] = useState(POR_PAGINA);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  /** Contador que só existe para forçar o refetch no botão "atualizar". */
  const [recarga, setRecarga] = useState(0);

  // ── Debounce da busca ──
  useEffect(() => {
    // 400ms: cada GET desta rota faz várias idas ao Postgres (lista + count +
    // agregados), então disparar por tecla sairia caro e ainda embaralharia a
    // ordem das respostas.
    const timer = setTimeout(() => {
      setBuscaAplicada(busca.trim());
      setPagina(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [busca]);

  // ── Carga dos dados ──
  useEffect(() => {
    const controlador = new AbortController();
    // `vivo` cobre o intervalo entre o abort e a rejeição da promise: sem ele,
    // uma resposta de filtro antigo poderia sobrescrever a do filtro atual.
    let vivo = true;

    async function carregar() {
      setCarregando(true);
      try {
        const params = new URLSearchParams();
        params.set("pagina", String(pagina));
        params.set("porPagina", String(POR_PAGINA));
        params.set("ordenar", ordenar);
        params.set("direcao", direcao);
        if (buscaAplicada) params.set("busca", buscaAplicada);
        if (role) params.set("role", role);
        if (plano) params.set("plano", plano);
        if (status) params.set("statusAssinatura", status);
        // "todos" = não mandar o parâmetro. Mandar `ativo=` vazio faria a rota
        // ignorar mesmo, mas explicitar aqui deixa a intenção clara.
        if (atividade !== "todos") params.set("ativo", atividade === "ativos" ? "true" : "false");

        const res = await fetch(`/api/admin/accounts?${params.toString()}`, {
          signal: controlador.signal,
          cache: "no-store",
        });

        if (!res.ok) {
          throw new ErroDaApi(
            res.status === 401
              ? "Sessão de admin expirada. Entre novamente para ver as contas."
              : `A API respondeu ${res.status}. Tente novamente em instantes.`
          );
        }

        const json: RespostaContas = await res.json();
        if (!vivo) return;

        // A tela antiga fazia `setAccounts(data.users)` direto; um `users`
        // ausente (erro serializado, resposta de proxy) virava crash no .map.
        const lista = Array.isArray(json?.users) ? json.users : [];
        const totalSeguro = numeroOuNulo(json?.total) ?? numeroOuNulo(json?.paginacao?.total) ?? lista.length;
        const porPagina =
          numeroOuNulo(json?.paginacao?.porPagina) ?? numeroOuNulo(json?.limit) ?? POR_PAGINA;
        const paginas =
          numeroOuNulo(json?.paginacao?.totalPaginas) ??
          Math.max(1, Math.ceil(totalSeguro / Math.max(1, porPagina)));

        // Página órfã: alguém estava na 4 e o conjunto encolheu (filtro novo em
        // outra aba, conta removida). Volta para a última página existente em
        // vez de mostrar "nenhuma conta" com o contador dizendo que há 60.
        if (lista.length === 0 && totalSeguro > 0 && pagina > paginas) {
          setPagina(Math.max(1, Math.trunc(paginas)));
          return;
        }

        setUsuarios(lista);
        setTotal(Math.max(0, Math.trunc(totalSeguro)));
        setPorPaginaApi(Math.max(1, Math.trunc(porPagina)));
        setTotalPaginas(Math.max(1, Math.trunc(paginas)));
        setAviso(typeof json?.aviso === "string" && json.aviso.trim() !== "" ? json.aviso : null);
        setAtualizadoEm(new Date());
        setErro(null);
      } catch (e) {
        // Abort é fluxo normal (troca de filtro / desmontagem), não erro de tela.
        if (controlador.signal.aborted || !vivo) return;
        // Só a mensagem do ErroDaApi foi escrita por nós (e em pt-BR). Qualquer
        // outra coisa — TypeError de rede, SyntaxError de JSON inválido — tem
        // texto do navegador, em inglês, e não pode ir para a tela.
        setErro(
          e instanceof ErroDaApi
            ? e.message
            : "Não foi possível falar com o servidor. Verifique sua conexão e tente novamente."
        );
      } finally {
        if (vivo) setCarregando(false);
      }
    }

    carregar();
    return () => {
      vivo = false;
      controlador.abort();
    };
  }, [buscaAplicada, role, plano, status, atividade, ordenar, direcao, pagina, recarga]);

  // ── Ações ──
  function ordenarPor(campo: CampoOrdenacao) {
    if (campo === ordenar) {
      setDirecao((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setOrdenar(campo);
      setDirecao(direcaoPadrao(campo));
    }
    setPagina(1);
  }

  function limparFiltros() {
    setBusca("");
    setBuscaAplicada("");
    setRole("");
    setPlano("");
    setStatus("");
    setAtividade("todos");
    setPagina(1);
  }

  /**
   * Quantos filtros estão ativos — só alimenta o contador do painel de filtros.
   * Lê exatamente os mesmos valores da condição antiga (inclusive `busca` crua,
   * e não a debounced), então o contador nunca discorda do botão "limpar".
   */
  const qtdFiltros =
    (busca.trim() !== "" ? 1 : 0) +
    (role !== "" ? 1 : 0) +
    (plano !== "" ? 1 : 0) +
    (status !== "" ? 1 : 0) +
    (atividade !== "todos" ? 1 : 0);
  const temFiltro = qtdFiltros > 0;

  // ── Resumo ──
  // Contado sobre a PÁGINA carregada: a rota devolve `online`/`ativo` por
  // usuário, mas só dos usuários desta página. Por isso o rótulo muda para
  // "nesta página" quando há mais de uma — melhor ser explícito do que exibir
  // um "3 online" que o admin leria como total da base.
  const onlineNaPagina = usuarios.filter((u) => u.online === true).length;
  const ativosNaPagina = usuarios.filter((u) => u.ativo === true).length;
  // Contado, e não `usuarios.length - ativosNaPagina`: a subtração trataria
  // `ativo` AUSENTE (API antiga) como inativo e mostraria a página inteira em
  // "Inativos" com "Ativos" em zero. Mesma regra da linha da tabela
  // (`const inativo = u.ativo === false`): sem o campo, o usuário não entra em
  // nenhuma das duas contagens.
  const inativosNaPagina = usuarios.filter((u) => u.ativo === false).length;
  const escopo = totalPaginas > 1 ? "nesta página" : undefined;
  const primeiraCarga = carregando && usuarios.length === 0 && erro === null;
  /** Falhou e não sobrou nada na tela: os KPIs não têm o que descrever. */
  const semDados = erro !== null && usuarios.length === 0;
  /** Nada para listar e nada chegando — é o estado vazio, não o esqueleto. */
  const semLinhas = !primeiraCarga && usuarios.length === 0;

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-blue-500/10 ring-1 ring-inset ring-blue-500/25 text-blue-400 grid place-items-center shrink-0">
            <Users size={19} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black text-slate-100 tracking-tight leading-tight">Contas</h1>
            <p className="text-xs text-slate-500 mt-1">
              Gestão de usuários da plataforma
              {atualizadoEm && (
                // Sem cor própria: herda o slate-500 do parágrafo. O slate-600
                // que estava aqui deixava o carimbo abaixo do piso de contraste
                // do painel.
                <span className="tabular-nums">
                  {" · "}atualizado às{" "}
                  {atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setRecarga((n) => n + 1)}
          disabled={carregando}
          className="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl bg-slate-800/70 ring-1 ring-inset ring-slate-700/60 text-slate-300 text-xs font-bold hover:bg-slate-700/70 hover:ring-slate-500/50 transition-[background-color,box-shadow] duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Atualizar lista"
        >
          <RefreshCw size={13} className={cn(carregando && "animate-spin")} />
          Atualizar
        </button>
      </div>

      {/* Resumo */}
      <div className="space-y-3">
        <Secao
          titulo="Panorama"
          descricao={
            escopo
              ? "O total considera o filtro inteiro; online, ativos e inativos contam só a página carregada."
              : "Contagens da base filtrada."
          }
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* `semDados` = a carga falhou e não há NADA carregado para descrever.
              Sem isso, uma falha de primeira carga desenharia os quatro cards em
              zero ("Total de usuários 0") logo acima do <EstadoErro> — o
              zero-por-erro que o estado "indisponível" do CardKpi existe para
              impedir. A condição exige `usuarios.length === 0` de propósito:
              quando o erro cai em cima de dados já visíveis, a faixa deve seguir
              descrevendo a página antiga, que o banner acima já avisa estar
              desatualizada. */}
          <CardKpi
            titulo="Total de usuários"
            valor={total}
            sufixo={temFiltro ? "no filtro" : undefined}
            icone={<Users size={16} />}
            carregando={primeiraCarga}
            indisponivel={semDados}
            destaque
          />
          <CardKpi
            titulo="Online agora"
            valor={onlineNaPagina}
            sufixo={escopo}
            icone={<Wifi size={16} />}
            // O acento verde só acende quando há alguém online: um card sempre
            // verde deixa de significar alguma coisa.
            tom={onlineNaPagina > 0 ? "bom" : "neutro"}
            carregando={primeiraCarga}
            indisponivel={semDados}
          />
          <CardKpi
            titulo="Ativos (30 dias)"
            valor={ativosNaPagina}
            sufixo={escopo}
            icone={<UserCheck size={16} />}
            carregando={primeiraCarga}
            indisponivel={semDados}
          />
          <CardKpi
            titulo="Inativos"
            valor={inativosNaPagina}
            sufixo={escopo}
            icone={<UserX size={16} />}
            carregando={primeiraCarga}
            indisponivel={semDados}
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
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, e-mail ou ID..."
              // placeholder não é nome acessível: some ao digitar e nem todo
              // leitor de tela o anuncia.
              aria-label="Buscar por nome, e-mail ou ID"
              className={cn(CAMPO, "w-full pl-9 pr-9")}
            />
            {busca !== "" && (
              <button
                type="button"
                onClick={() => setBusca("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                title="Limpar busca"
                aria-label="Limpar busca"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <Selecao
            valor={role}
            aoMudar={(v) => { setRole(v); setPagina(1); }}
            opcoes={OPCOES_ROLE}
            rotulo="Filtrar por perfil"
          />

          <Selecao
            valor={plano}
            aoMudar={(v) => { setPlano(v); setPagina(1); }}
            opcoes={OPCOES_PLANO}
            rotulo="Filtrar por plano"
          />

          <Selecao
            valor={status}
            aoMudar={(v) => { setStatus(v); setPagina(1); }}
            opcoes={OPCOES_STATUS}
            rotulo="Filtrar por status da assinatura"
          />

          {/* Toggle de atividade — "ativo" aqui é acesso nos últimos 30 dias,
              critério da própria rota, e não status de assinatura. */}
          <div className="flex items-center h-10 bg-slate-950/40 ring-1 ring-inset ring-slate-700/50 rounded-xl p-1 gap-1">
            {OPCOES_ATIVIDADE.map((o) => (
              <button
                key={o.valor}
                type="button"
                onClick={() => { setAtividade(o.valor); setPagina(1); }}
                // Sem aria-pressed o leitor de tela anuncia os três botões
                // igual, ligado ou desligado.
                aria-pressed={atividade === o.valor}
                title={
                  o.valor === "ativos"
                    ? "Acessaram nos últimos 30 dias"
                    : o.valor === "inativos"
                      ? "Sem acesso há mais de 30 dias (inclui quem nunca acessou)"
                      : "Sem filtro de atividade"
                }
                className={cn(
                  "h-8 px-3 rounded-lg text-xs font-bold transition-[background-color,box-shadow,color] duration-200",
                  atividade === o.valor
                    ? "bg-blue-500/15 ring-1 ring-inset ring-blue-500/35 text-blue-300"
                    : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/60"
                )}
              >
                {o.rotulo}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Aviso da própria API (ex.: ordenação por último acesso além do teto) */}
      {aviso && (
        <div className="flex items-start gap-2.5 bg-amber-500/[0.07] ring-1 ring-inset ring-amber-500/20 rounded-2xl px-4 py-3">
          <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-200/90 leading-relaxed">{aviso}</p>
        </div>
      )}

      {/* Falha em cima de dados que já estavam na tela: mantém a tabela antiga
          visível e avisa que ela está desatualizada, em vez de esvaziar tudo. */}
      {erro && usuarios.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 bg-rose-500/[0.07] ring-1 ring-inset ring-rose-500/25 rounded-2xl px-4 py-3">
          <AlertTriangle size={14} className="text-rose-400 shrink-0" />
          <p className="text-[11px] text-rose-200/90 flex-1 min-w-[200px] leading-relaxed">
            {erro} Os dados abaixo podem estar desatualizados.
          </p>
          <button
            type="button"
            onClick={() => setRecarga((n) => n + 1)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-800/70 ring-1 ring-inset ring-slate-700/60 text-slate-300 text-[11px] font-bold hover:bg-slate-700/70 hover:ring-slate-500/50 transition-[background-color,box-shadow] duration-200"
          >
            <RefreshCw size={12} />
            Tentar novamente
          </button>
        </div>
      )}

      {erro && usuarios.length === 0 ? (
        <EstadoErro mensagem={erro} onTentarNovamente={() => setRecarga((n) => n + 1)} />
      ) : (
        <>
          <Secao
            // -mb-3 encosta o cabeçalho na tabela: com o space-y-6 da página o
            // título ficaria à mesma distância do painel de filtros e da tabela,
            // e deixaria de parecer o rótulo de alguma coisa.
            className="-mb-3"
            titulo="Usuários"
            descricao={'Use "Ver conta", no fim da linha, para abrir o perfil completo do usuário.'}
            acao={
              <span className="text-[11px] text-slate-500 tabular-nums">
                {formatarNumero(usuarios.length)} linha(s) nesta página
              </span>
            }
          />

          {semLinhas ? (
            /* Vazio FORA da tabela (mesmo padrão de /admin/subscriptions).
               Dentro de um <td> ele herdava o `min-w-[1040px]` do <table>: a
               mensagem saía descentralizada, com scroll horizontal em qualquer
               tela menor que isso e uma fileira de nove colunas vazias em cima.
               Sem linha para mostrar, não há tabela nem cabeçalho. */
            <div className="glass-panel rounded-2xl overflow-hidden">
              <EstadoVazio
                icone={<Users size={20} />}
                titulo={temFiltro ? "Nenhuma conta com esses filtros" : "Nenhuma conta cadastrada"}
                descricao={
                  temFiltro
                    ? "Nenhum usuário corresponde à combinação de busca, perfil, plano e atividade selecionada."
                    : "Assim que o primeiro usuário se cadastrar na plataforma, ele aparece aqui."
                }
                acao={
                  temFiltro ? (
                    <button
                      type="button"
                      onClick={limparFiltros}
                      className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-950/40 transition-colors duration-200"
                    >
                      <X size={13} />
                      Limpar filtros
                    </button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className="glass-panel rounded-2xl overflow-hidden">
              {/* Scroll próprio do card: o <main> do layout admin tem
                  overflow-x-hidden, então a tabela precisa rolar aqui dentro. O
                  scroll VERTICAL também é deste contêiner — é o que dá ao
                  cabeçalho sticky algo contra o que grudar (um overflow-x-auto de
                  altura automática não rola nada na vertical e o sticky vira
                  decoração). */}
              <div className="overflow-auto max-h-[68vh]">
                <table
                  className={cn(
                    "w-full text-sm min-w-[1040px] border-separate border-spacing-0 transition-opacity",
                    // Recarga sobre dados existentes: escurece em vez de trocar
                    // tudo por skeleton (a tabela não "pula" a cada filtro).
                    // `pointer-events-none` junto (como em /admin/subscriptions):
                    // desbotada, a tabela mostra dados que já estão obsoletos —
                    // deixar "Ver conta" e os cabeçalhos de ordenação clicáveis
                    // convida o admin a agir sobre a lista antiga.
                    carregando && !primeiraCarga && "opacity-50 pointer-events-none"
                  )}
                >
                  <thead>
                    <tr>
                      {COLUNAS.map((coluna, i) => (
                        <th
                          key={coluna.rotulo === "" ? `acoes-${i}` : coluna.rotulo}
                          scope="col"
                          aria-sort={valorAriaSort(coluna.campo, ordenar, direcao)}
                          // `sticky top-0` fica na CÉLULA, não no <thead>: sticky
                          // em thead/tr só funciona nos navegadores mais novos, e
                          // a borda de um thead sticky não acompanha o scroll. O
                          // fundo precisa ser SÓLIDO — as linhas passam por baixo.
                          className={cn(
                            "sticky top-0 z-10 bg-slate-900 border-b border-slate-700/60",
                            "px-5 py-3.5 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap",
                            coluna.alinharDireita && "text-right"
                          )}
                        >
                          {coluna.campo ? (
                            <CabecalhoOrdenavel
                              rotulo={coluna.rotulo}
                              campo={coluna.campo}
                              campoAtivo={ordenar}
                              direcao={direcao}
                              onOrdenar={ordenarPor}
                            />
                          ) : coluna.rotulo === "" ? (
                            // Coluna de ações: cabeçalho vazio no visual (é só o
                            // link "Ver conta"), mas um <th> sem nome acessível
                            // deixa as células da coluna sem rótulo no leitor de
                            // tela. sr-only dá o nome sem ocupar pixel algum.
                            <span className="sr-only">Ações</span>
                          ) : (
                            coluna.rotulo
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  {primeiraCarga ? (
                    <EsqueletoTabela />
                  ) : (
                    // divide-y não funciona com border-separate (que o sticky
                    // exige para a borda do cabeçalho não sumir), então o
                    // separador vai como border-top em cada célula. O
                    // `:not(:first-child)` evita a linha dupla logo abaixo do
                    // cabeçalho, que já tem a borda dele.
                    <tbody className="[&>tr:not(:first-child)>td]:border-t [&>tr>td]:border-slate-800/60">
                      {usuarios.map((u) => {
                        // Campos novos com fallback para os antigos — ver comentário
                        // do topo do arquivo.
                        const nome = u.nome ?? u.name ?? null;
                        const planoUsuario = u.plano ?? u.subscription?.plan ?? null;
                        const statusUsuario = u.statusAssinatura ?? u.subscription?.status ?? null;
                        const criadoEm = u.criadoEm ?? u.createdAt ?? null;
                        const workspaces = numeroOuNulo(u.qtdWorkspaces) ?? 0;
                        // `?? 0` em cada parcela: a soma dos _count é o fallback de
                        // quando `qtdIntegracoes` não existe (API antiga).
                        const integracoes =
                          numeroOuNulo(u.qtdIntegracoes) ??
                          (numeroOuNulo(u._count?.metaConnections) ?? 0) +
                            (numeroOuNulo(u._count?.googleConnections) ?? 0);
                        const online = u.online === true;
                        // `ativo` ausente (API antiga) NÃO é tratado como inativo:
                        // apagar a linha inteira por falta de dado seria pior que
                        // mostrá-la normal.
                        const inativo = u.ativo === false;
                        const relativo = relativoDesde(u.ultimoAcesso);

                        return (
                          <tr
                            key={u.id}
                            // Só background-color na transição: com `transition-all`
                            // o hover animaria também cor de texto e largura, e a
                            // linha "borracharia" a cada passada do mouse.
                            className="group hover:bg-slate-800/50 transition-[background-color] duration-200"
                          >
                            {/* Usuário */}
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <Avatar nome={nome} email={u.email} apagado={inativo} />
                                {/* max-w fixo: sem ele o `truncate` não tem em que
                                    se apoiar dentro de <td> e um e-mail longo
                                    estoura a largura da coluna. */}
                                <div className="min-w-0 max-w-[260px]">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <p
                                      className={cn(
                                        // min-w-0: sem ele o item de flex não
                                        // encolhe abaixo do próprio texto e o
                                        // truncate nunca chega a cortar nada.
                                        "font-bold truncate min-w-0",
                                        inativo ? "text-slate-500" : "text-slate-100"
                                      )}
                                    >
                                      {nome ?? "Sem nome"}
                                    </p>
                                    {online && <PontoOnline />}
                                  </div>
                                  {/* slate-500 é o PISO de contraste do painel: o
                                      slate-600 que estava aqui fica em ~2,2:1
                                      sobre o vidro do card, ilegível em 11px. A
                                      conta inativa continua marcada pelo avatar
                                      apagado e pelo nome em slate-500 — apagar o
                                      registro até sumir não é diferenciar. */}
                                  <p className="text-[11px] text-slate-500 truncate">{u.email ?? "—"}</p>
                                </div>
                              </div>
                            </td>

                            {/* Perfil */}
                            <td className="px-5 py-3"><BadgePerfil role={u.role} /></td>

                            {/* Plano */}
                            <td className="px-5 py-3">
                              {planoUsuario ? (
                                <BadgePlano plano={planoUsuario} />
                              ) : (
                                <span className="text-[11px] text-slate-500">sem plano</span>
                              )}
                            </td>

                            {/* Status da assinatura */}
                            <td className="px-5 py-3">
                              {statusUsuario ? (
                                <BadgeStatus status={statusUsuario} />
                              ) : (
                                <span className="text-[11px] text-slate-500">—</span>
                              )}
                            </td>

                            {/* Workspaces */}
                            <td className="px-5 py-3 text-right">
                              <span
                                className={cn(
                                  "text-xs font-bold tabular-nums",
                                  workspaces > 0 ? (inativo ? "text-slate-500" : "text-slate-200") : "text-slate-500"
                                )}
                              >
                                {formatarNumero(workspaces)}
                              </span>
                            </td>

                            {/* Integrações */}
                            <td className="px-5 py-3 text-right">
                              <span
                                className={cn(
                                  "text-xs font-bold tabular-nums",
                                  integracoes > 0 ? (inativo ? "text-slate-500" : "text-slate-200") : "text-slate-500"
                                )}
                              >
                                {formatarNumero(integracoes)}
                              </span>
                            </td>

                            {/* Último acesso */}
                            <td className="px-5 py-3 whitespace-nowrap">
                              {relativo ? (
                                <>
                                  <p
                                    className={cn(
                                      "text-[11px] tabular-nums",
                                      inativo ? "text-slate-500" : "text-slate-400"
                                    )}
                                  >
                                    {formatarDataHora(u.ultimoAcesso)}
                                  </p>
                                  <p className={cn("text-[10px]", online ? "text-emerald-400 font-bold" : "text-slate-500")}>
                                    {online ? "online agora" : relativo}
                                  </p>
                                </>
                              ) : (
                                // null aqui é informação, não ausência de dado:
                                // a conta existe e nunca teve um único acesso.
                                <span className="text-[11px] text-slate-500 italic">nunca acessou</span>
                              )}
                            </td>

                            {/* Cadastro */}
                            <td className="px-5 py-3 text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                              {formatarData(criadoEm)}
                            </td>

                            {/* Ações */}
                            <td className="px-5 py-3 text-right">
                              {/* <Link> e não <a>: âncora crua recarrega a
                                  aplicação inteira só para abrir um detalhe. */}
                              <Link
                                href={`/admin/accounts/${u.id}`}
                                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[11px] font-bold text-slate-500 group-hover:text-blue-300 group-hover:bg-blue-500/10 transition-[background-color,color] duration-200 whitespace-nowrap"
                              >
                                Ver conta
                                <ChevronRight size={13} />
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  )}
                </table>
              </div>
            </div>
          )}

          <Paginacao
            pagina={pagina}
            totalPaginas={totalPaginas}
            total={total}
            porPagina={porPaginaApi}
            onMudar={setPagina}
          />
        </>
      )}
    </div>
  );
}
