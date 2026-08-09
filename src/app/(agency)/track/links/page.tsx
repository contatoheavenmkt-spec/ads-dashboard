"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check, Copy, Link2, Loader2, MessageSquare, MousePointerClick,
  Code, Plus, Power, Target, Trash2, TriangleAlert, Users, X,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/ui/skeleton";
import { AbasTrack } from "../_components/abas";

interface WorkspaceRef {
  id: string;
  name: string;
  slug: string;
}

interface TrackLink {
  id: string;
  slug: string;
  name: string;
  destinationPhone: string;
  messageTemplate: string;
  platform: string;
  active: boolean;
  clickCount: number;
  matchedCount: number;
  fallbackUrl: string | null;
  createdAt: string;
  workspace: WorkspaceRef;
}

/**
 * O que o cliente cola no campo "Modelo de acompanhamento" do Google Ads.
 * Sem isso o funil não quebra por campanha, porque o gclid sozinho não diz
 * de qual campanha veio sem uma chamada extra à API.
 */
const TRACKING_TEMPLATE =
  "{lpurl}?campaignid={campaignid}&adgroupid={adgroupid}&creative={creative}&keyword={keyword}&matchtype={matchtype}&device={device}&utm_source=google&utm_medium=cpc";

function formatPhone(digits: string): string {
  if (!digits.startsWith("55") || digits.length < 12) return digits;
  const ddd = digits.slice(2, 4);
  const rest = digits.slice(4);
  const meio = rest.length === 9 ? rest.slice(0, 5) : rest.slice(0, 4);
  const fim = rest.length === 9 ? rest.slice(5) : rest.slice(4);
  return `(${ddd}) ${meio}-${fim}`;
}

export default function TrackPage() {
  const [links, setLinks] = useState<TrackLink[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[]>([]);
  const [baseUrl, setBaseUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroWs, setFiltroWs] = useState<string>("all");
  const [criando, setCriando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agency/track/links");
      if (!res.ok) throw new Error("Não foi possível carregar os links");
      const data = await res.json();
      setLinks(data.links ?? []);
      setWorkspaces(data.workspaces ?? []);
      // Em dev o env pode não estar definido: cai para a origem do navegador.
      setBaseUrl(data.baseUrl || window.location.origin);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const visiveis = useMemo(
    () => (filtroWs === "all" ? links : links.filter((l) => l.workspace.id === filtroWs)),
    [links, filtroWs],
  );

  const totais = useMemo(() => {
    const cliques = visiveis.reduce((s, l) => s + l.clickCount, 0);
    const casados = visiveis.reduce((s, l) => s + l.matchedCount, 0);
    return {
      links: visiveis.length,
      ativos: visiveis.filter((l) => l.active).length,
      cliques,
      casados,
      taxa: cliques > 0 ? (casados / cliques) * 100 : 0,
    };
  }, [visiveis]);

  async function copiar(texto: string, id: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(id);
      setTimeout(() => setCopiado((c) => (c === id ? null : c)), 1800);
    } catch {
      setErro("O navegador bloqueou a cópia. Selecione e copie na mão.");
    }
  }

  async function alternarAtivo(link: TrackLink) {
    const res = await fetch(`/api/agency/track/links/${link.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !link.active }),
    });
    if (res.ok) {
      const { link: novo } = await res.json();
      setLinks((ls) => ls.map((l) => (l.id === novo.id ? { ...l, ...novo } : l)));
    } else {
      setErro("Não foi possível alterar o link");
    }
  }

  async function remover(link: TrackLink) {
    const aviso =
      link.clickCount > 0
        ? `"${link.name}" já recebeu ${link.clickCount} clique(s). Ele será desativado em vez de apagado, para o histórico de atribuição não se perder. Continuar?`
        : `Apagar o link "${link.name}"?`;
    if (!confirm(aviso)) return;

    const res = await fetch(`/api/agency/track/links/${link.id}`, { method: "DELETE" });
    if (!res.ok) {
      setErro("Não foi possível remover o link");
      return;
    }
    const data = await res.json();
    if (data.desativado) {
      setLinks((ls) => ls.map((l) => (l.id === link.id ? { ...l, active: false } : l)));
    } else {
      setLinks((ls) => ls.filter((l) => l.id !== link.id));
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header
        title="Track"
        subtitle="Links de rastreio: a URL final que vai no anúncio"
      />
      <AbasTrack />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {erro ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span className="flex-1">{erro}</span>
            <button onClick={() => setErro(null)} className="text-red-400 hover:text-red-200">
              <X size={14} />
            </button>
          </div>
        ) : null}

        <div className="grid gap-3 sm:gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <MetricBox label="Links ativos" value={`${totais.ativos}/${totais.links}`} accent="text-blue-400" />
          <MetricBox label="Cliques" value={String(totais.cliques)} accent="text-cyan-400" />
          <MetricBox label="Viraram conversa" value={String(totais.casados)} accent="text-emerald-400" />
          <MetricBox
            label="Taxa de casamento"
            value={totais.cliques > 0 ? `${totais.taxa.toFixed(0)}%` : "—"}
            accent={totais.taxa >= 50 || totais.cliques === 0 ? "text-emerald-400" : "text-amber-400"}
          />
        </div>

        {/* Muito clique e pouca conversa quase sempre significa que a pessoa
            apaga o texto pré-preenchido antes de enviar. */}
        {totais.cliques >= 10 && totais.taxa < 40 ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <p>
              Só {totais.taxa.toFixed(0)}% dos cliques viraram conversa rastreada. Em geral isso
              acontece quando a pessoa apaga a mensagem pronta antes de enviar. Uma mensagem mais
              curta costuma resolver, porque dá menos vontade de apagar.
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-slate-500" />
            <select
              value={filtroWs}
              onChange={(e) => setFiltroWs(e.target.value)}
              className="px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-lg text-xs font-medium text-slate-300 focus:outline-none focus:border-blue-500/60"
            >
              <option value="all">Todos os clientes</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          <div className="flex-1" />

          <button
            onClick={() => setCriando(true)}
            disabled={workspaces.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={14} />
            Novo link
          </button>
        </div>

        {loading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : visiveis.length === 0 ? (
          <VazioInicial temWorkspace={workspaces.length > 0} onCriar={() => setCriando(true)} />
        ) : (
          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-800 bg-slate-900/40">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Link</th>
                    <th className="px-4 py-3">Destino</th>
                    <th className="px-4 py-3 text-right">Cliques</th>
                    <th className="px-4 py-3 text-right">Conversas</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {visiveis.map((link) => {
                    const url = `${baseUrl}/r/${link.slug}`;
                    const taxa = link.clickCount > 0 ? (link.matchedCount / link.clickCount) * 100 : 0;
                    return (
                      <tr key={link.id} className={cn("hover:bg-slate-900/40", !link.active && "opacity-45")}>
                        <td className="px-4 py-3 text-slate-400">{link.workspace.name}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-200">{link.name}</p>
                          <button
                            onClick={() => copiar(url, link.id)}
                            className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-[11px] text-blue-400 hover:text-blue-300"
                            title="Copiar para usar como URL final do anúncio"
                          >
                            {copiado === link.id ? <Check size={11} /> : <Copy size={11} />}
                            /r/{link.slug}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 text-slate-300">
                            <MessageSquare size={11} className="text-emerald-500" />
                            {formatPhone(link.destinationPhone)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-200">{link.clickCount}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-emerald-400">{link.matchedCount}</span>
                          {link.clickCount > 0 ? (
                            <span className={cn("ml-1.5 text-[10px]", taxa >= 50 ? "text-slate-500" : "text-amber-500")}>
                              {taxa.toFixed(0)}%
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => alternarAtivo(link)}
                              className={cn(
                                "p-1.5 rounded transition-colors",
                                link.active
                                  ? "text-emerald-500 hover:bg-emerald-500/10"
                                  : "text-slate-600 hover:bg-slate-800 hover:text-slate-400",
                              )}
                              title={link.active ? "Desativar link" : "Ativar link"}
                            >
                              <Power size={12} />
                            </button>
                            <button
                              onClick={() => remover(link)}
                              className="p-1.5 rounded text-slate-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
                              title="Remover"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {visiveis.length > 0 ? (
          <ComoUsar
            template={TRACKING_TEMPLATE}
            onCopiar={copiar}
            copiado={copiado}
            baseUrl={baseUrl}
            primeiroSlug={visiveis.find((l) => l.active)?.slug ?? visiveis[0]?.slug ?? null}
          />
        ) : null}
      </div>

      {criando ? (
        <ModalNovoLink
          workspaces={workspaces}
          onFechar={() => setCriando(false)}
          onCriado={(link) => {
            setLinks((ls) => [link, ...ls]);
            setCriando(false);
          }}
        />
      ) : null}
    </div>
  );
}

function MetricBox({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="glass-panel rounded-xl p-4">
      <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-1">{label}</p>
      <p className={cn("text-2xl font-bold", accent)}>{value}</p>
    </div>
  );
}

function VazioInicial({ temWorkspace, onCriar }: { temWorkspace: boolean; onCriar: () => void }) {
  return (
    <div className="glass-panel rounded-2xl p-12 text-center">
      <Link2 size={28} className="mx-auto mb-3 text-slate-600" />
      {temWorkspace ? (
        <>
          <p className="text-sm text-slate-300">Nenhum link de rastreio ainda.</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            Um link de rastreio entra como URL final do anúncio. Quem clica vai para o WhatsApp com
            um código na mensagem, e é esse código que liga a venda de volta à campanha que a gerou.
          </p>
          <button
            onClick={onCriar}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500"
          >
            <Plus size={14} />
            Criar o primeiro
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-300">Você ainda não tem clientes cadastrados.</p>
          <p className="mt-1 text-xs text-slate-500">Crie um workspace antes de gerar links de rastreio.</p>
        </>
      )}
    </div>
  );
}

function ComoUsar({
  template,
  onCopiar,
  copiado,
  baseUrl,
  primeiroSlug,
}: {
  template: string;
  onCopiar: (t: string, id: string) => void;
  copiado: string | null;
  baseUrl: string;
  primeiroSlug: string | null;
}) {
  const snippet = primeiroSlug
    ? `<script src="${baseUrl}/track.js" data-track="${primeiroSlug}" defer></script>`
    : null;

  return (
    <div className="space-y-4">
    <div className="glass-panel rounded-2xl p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-200">
        <Target size={14} className="text-cyan-400" />
        Como ligar no Google Ads
      </h2>
      <ol className="mt-3 space-y-2.5 text-xs text-slate-400">
        <li>
          <span className="font-semibold text-slate-300">1.</span> Copie o link acima e cole no campo
          <span className="text-slate-300"> URL final</span> do anúncio.
        </li>
        <li>
          <span className="font-semibold text-slate-300">2.</span> Em Configurações da conta, cole o
          modelo de acompanhamento abaixo. É ele que traz campanha, grupo e palavra-chave junto do
          clique, sem gastar chamada de API.
          <button
            onClick={() => onCopiar(template, "template")}
            className="mt-2 flex w-full items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-left font-mono text-[10px] leading-relaxed text-cyan-300 transition-colors hover:border-cyan-500/40"
          >
            {copiado === "template" ? (
              <Check size={12} className="mt-0.5 shrink-0 text-emerald-400" />
            ) : (
              <Copy size={12} className="mt-0.5 shrink-0 text-slate-500" />
            )}
            <span className="break-all">{template}</span>
          </button>
        </li>
        <li>
          <span className="font-semibold text-slate-300">3.</span> Confirme que a
          <span className="text-slate-300"> marcação automática</span> está ligada na conta. Sem ela
          o Google não gera o gclid, e sem gclid nenhuma venda consegue voltar para a campanha.
        </li>
      </ol>
      <p className="mt-4 flex items-start gap-1.5 border-t border-slate-800 pt-3 text-[11px] text-slate-500">
        <MousePointerClick size={12} className="mt-0.5 shrink-0" />
        A coluna Conversas mostra quantos cliques viraram conversa rastreada. Quando essa taxa cai,
        costuma ser gente apagando a mensagem pronta antes de enviar.
      </p>
    </div>

    {/* O caso em que o anúncio leva ao SITE antes do WhatsApp. Sem o script,
        o gclid chega na página e se perde no caminho até o botão, e a venda
        não tem como voltar para a campanha. */}
    <div className="glass-panel rounded-2xl p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-200">
        <Code size={14} className="text-cyan-400" />
        Se o anúncio leva ao site antes do WhatsApp
      </h2>
      <p className="text-xs leading-relaxed text-slate-400">
        Nesse caso a URL final do anúncio continua sendo o site, não o link acima. Cole este trecho
        no <span className="text-slate-300">&lt;head&gt;</span> do site: ele guarda o identificador
        da campanha na chegada e passa adiante quando a pessoa clica no botão de WhatsApp, mesmo que
        ela navegue por várias páginas antes.
      </p>
      {snippet ? (
        <button
          onClick={() => onCopiar(snippet, "snippet")}
          className="mt-3 flex w-full items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-left font-mono text-[10px] leading-relaxed text-cyan-300 transition-colors hover:border-cyan-500/40"
        >
          {copiado === "snippet" ? (
            <Check size={12} className="mt-0.5 shrink-0 text-emerald-400" />
          ) : (
            <Copy size={12} className="mt-0.5 shrink-0 text-slate-500" />
          )}
          <span className="break-all">{snippet}</span>
        </button>
      ) : (
        <p className="mt-3 text-[11px] text-slate-500">Crie um link acima para gerar o trecho.</p>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        Ele reescreve sozinho os links de <span className="font-mono">wa.me</span> da página,
        inclusive os de widget flutuante que aparecem depois. Para botão feito em JavaScript, use
        <span className="font-mono text-slate-400"> window.dashfysTrack.url()</span> no lugar de
        montar o link na mão.
      </p>
    </div>
    </div>
  );
}

function ModalNovoLink({
  workspaces,
  onFechar,
  onCriado,
}: {
  workspaces: WorkspaceRef[];
  onFechar: () => void;
  onCriado: (link: TrackLink) => void;
}) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [template, setTemplate] = useState("Olá! Vim pelo anúncio. Código {code}");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const semPlaceholder = !template.includes("{code}");

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/agency/track/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name,
          destinationPhone: phone,
          messageTemplate: template,
          platform: "google",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível criar o link");
      onCriado(data.link);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onFechar}>
      <div
        className="glass-panel w-full max-w-lg rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-white">Novo link de rastreio</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Use como URL final do anúncio que manda para o WhatsApp.
            </p>
          </div>
          <button onClick={onFechar} className="text-slate-500 hover:text-slate-300">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <Campo label="Cliente">
            <select
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 focus:border-blue-500/60 focus:outline-none"
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </Campo>

          <Campo label="Nome do link" ajuda="Só para você se achar. Ex: Campanha Implante Search">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Campanha Implante Search"
              className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:border-blue-500/60 focus:outline-none"
            />
          </Campo>

          <Campo label="WhatsApp de destino" ajuda="Com DDD. É o número que vai atender.">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 98765-4321"
              inputMode="tel"
              className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:border-blue-500/60 focus:outline-none"
            />
          </Campo>

          <Campo
            label="Mensagem pronta"
            ajuda="Quanto mais curta, menos gente apaga antes de enviar. O {code} é o que liga a venda à campanha."
          >
            <textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 focus:border-blue-500/60 focus:outline-none"
            />
            {semPlaceholder ? (
              <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-400">
                <TriangleAlert size={11} className="mt-0.5 shrink-0" />
                Sem {"{code}"} na mensagem, o código entra no fim automaticamente. Prefira escolher
                onde ele aparece.
              </p>
            ) : null}
          </Campo>

          {erro ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {erro}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onFechar}
            className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando || !name.trim() || !phone.trim() || !workspaceId}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Criar link
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({
  label,
  ajuda,
  children,
}: {
  label: string;
  ajuda?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </label>
      {children}
      {ajuda ? <p className="mt-1 text-[11px] text-slate-500">{ajuda}</p> : null}
    </div>
  );
}
