"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Brain, CheckCircle2, ChevronLeft, Loader2, Play,
  Power, TriangleAlert, X,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { cn, formatCurrency } from "@/lib/utils";
import { AbasTrack } from "../../_components/abas";

interface WorkspaceRef { id: string; name: string }

interface Politica {
  enabled: boolean;
  targetCpa: number | null;
  targetRoas: number | null;
  maxBudgetChangePct: number;
  maxDailyBudgetCeiling: number | null;
  minConversionsForCpa: number;
  lookbackDays: number;
  disabledRules: string | null;
}

interface Varredura {
  runDate: string;
  geradas: number;
  finishedAt: string | null;
  erros: string | null;
}

const REGRAS = [
  { code: "GASTO_SEM_CONVERSAO", nome: "Gasto sem conversão", desc: "Palavra ou anúncio queimando verba sem trazer nada." },
  { code: "CPA_ACIMA_DA_META", nome: "CPA acima da meta", desc: "Campanha custando mais por conversão do que deveria." },
  { code: "TERMO_IRRELEVANTE", nome: "Termo de busca irrelevante", desc: "Gente chegando por busca que não tem a ver com o que você vende." },
  { code: "LIMITADA_POR_ORCAMENTO", nome: "Campanha boa sem orçamento", desc: "Está indo bem e perdendo impressão por falta de verba." },
  { code: "ANUNCIO_FRACO", nome: "Anúncio fraco", desc: "Criativo com metade do CTR dos irmãos do mesmo grupo." },
  { code: "SEM_VENDA_REAL", nome: "Leads sem nenhuma venda", desc: "Só existe por causa do Track: compara com o que fechou no WhatsApp." },
  { code: "CPA_REAL_ACIMA", nome: "Custo por venda real", desc: "Só existe por causa do Track: usa venda fechada, não conversão de tag." },
];

export default function IaConfig() {
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[]>([]);
  const [ws, setWs] = useState("");
  const [pol, setPol] = useState<Politica | null>(null);
  const [varredura, setVarredura] = useState<Varredura | null>(null);
  const [temGoogle, setTemGoogle] = useState(true);
  const [vendas, setVendas] = useState(0);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Campos do formulário
  const [cpa, setCpa] = useState("");
  const [roas, setRoas] = useState("");
  const [tetoPct, setTetoPct] = useState(20);
  const [tetoDiario, setTetoDiario] = useState("");
  const [minConv, setMinConv] = useState(10);
  const [janela, setJanela] = useState(14);
  const [desligadas, setDesligadas] = useState<string[]>([]);

  const carregar = useCallback(async (workspaceId: string) => {
    setLoading(true);
    try {
      const q = workspaceId ? `?workspaceId=${workspaceId}` : "";
      const res = await fetch(`/api/agency/ai/politica${q}`);
      const data = await res.json();
      setWorkspaces(data.workspaces ?? []);
      if (!workspaceId && data.workspaces?.[0]) {
        setWs(data.workspaces[0].id);
        return;
      }
      const p: Politica | null = data.politica;
      setPol(p);
      setVarredura(data.ultimaVarredura ?? null);
      setTemGoogle(data.temContaGoogle ?? false);
      setVendas(data.vendasCapturadas ?? 0);
      setCpa(p?.targetCpa ? String(p.targetCpa) : "");
      setRoas(p?.targetRoas ? String(p.targetRoas) : "");
      setTetoPct(p?.maxBudgetChangePct ?? 20);
      setTetoDiario(p?.maxDailyBudgetCeiling ? String(p.maxDailyBudgetCeiling) : "");
      setMinConv(p?.minConversionsForCpa ?? 10);
      setJanela(p?.lookbackDays ?? 14);
      try {
        setDesligadas(p?.disabledRules ? JSON.parse(p.disabledRules) : []);
      } catch {
        setDesligadas([]);
      }
    } catch {
      setErro("Não consegui carregar a configuração.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void carregar(ws); }, [carregar, ws]);

  async function salvar(ligarAgora?: boolean) {
    setSalvando(true);
    setErro(null);
    setOk(null);
    try {
      const res = await fetch("/api/agency/ai/politica", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: ws,
          enabled: ligarAgora ?? pol?.enabled ?? false,
          targetCpa: cpa ? Number(cpa) : null,
          targetRoas: roas ? Number(roas) : null,
          maxBudgetChangePct: tetoPct,
          maxDailyBudgetCeiling: tetoDiario ? Number(tetoDiario) : null,
          minConversionsForCpa: minConv,
          lookbackDays: janela,
          disabledRules: desligadas,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar");
      setPol(data.politica);
      setOk(
        data.politica.enabled
          ? "IA ligada. A primeira análise sai na próxima varredura (todo dia de manhã), ou clique em Analisar agora."
          : "Configuração salva.",
      );
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const ligada = pol?.enabled ?? false;
  const podeLigar = Boolean(cpa && Number(cpa) > 0 && temGoogle);

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <Header title="Track" subtitle="Ligar e calibrar a IA de campanhas" />
      <AbasTrack />

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        <Link href="/track/ia" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">
          <ChevronLeft size={13} /> Voltar para as sugestões
        </Link>

        {erro ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span className="flex-1">{erro}</span>
            <button onClick={() => setErro(null)}><X size={14} /></button>
          </div>
        ) : null}
        {ok ? (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
            <span className="flex-1">{ok}</span>
            <button onClick={() => setOk(null)}><X size={14} /></button>
          </div>
        ) : null}

        <select
          value={ws}
          onChange={(e) => setWs(e.target.value)}
          className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-300 focus:border-cyan-500/60 focus:outline-none"
        >
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>

        {loading ? (
          <div className="glass-panel rounded-2xl p-10 text-center">
            <Loader2 className="mx-auto animate-spin text-slate-600" size={20} />
          </div>
        ) : (
          <>
            {/* Estado atual, bem visível */}
            <div className="glass-panel rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Brain size={16} className={ligada ? "text-cyan-400" : "text-slate-600"} />
                    <h2 className="text-sm font-bold text-slate-200">
                      {ligada ? "IA ligada para este cliente" : "IA desligada"}
                    </h2>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {ligada
                      ? "Ela analisa as campanhas uma vez por dia e propõe ajustes. Nada é aplicado sem você aprovar."
                      : "Enquanto estiver desligada, nenhuma análise roda e nenhuma sugestão aparece."}
                  </p>
                  {varredura ? (
                    <p className="mt-2 text-[11px] text-slate-500">
                      Última varredura: {varredura.runDate} · {varredura.geradas} sugestão(ões)
                      {varredura.erros ? " · com avisos" : ""}
                    </p>
                  ) : null}
                </div>
                <button
                  onClick={() => salvar(!ligada)}
                  disabled={salvando || (!ligada && !podeLigar)}
                  title={!ligada && !podeLigar ? "Defina a meta de CPA e conecte o Google Ads primeiro" : ""}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                    ligada
                      ? "border border-slate-700 text-slate-300 hover:bg-slate-800"
                      : "bg-cyan-600 text-white hover:bg-cyan-500",
                  )}
                >
                  {salvando ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />}
                  {ligada ? "Desligar" : "Ligar IA"}
                </button>
              </div>

              {!temGoogle ? (
                <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                  <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                  Este cliente não tem conta do Google Ads ligada. Conecte em Integrações antes.
                </p>
              ) : null}
              {temGoogle && vendas === 0 ? (
                <p className="mt-3 text-[11px] text-slate-500">
                  O Track ainda não capturou nenhuma venda deste cliente. As cinco primeiras regras já
                  funcionam com os dados do Google, mas as duas que comparam gasto com faturamento real
                  só ganham sentido quando as vendas começarem a entrar.
                </p>
              ) : null}
            </div>

            {/* As metas: é o que faz a IA conseguir julgar */}
            <div className="glass-panel rounded-2xl p-5">
              <h3 className="text-sm font-bold text-slate-200">Metas do cliente</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                É o que transforma &quot;gastou R$3.000&quot; em &quot;gastou o triplo do que deveria&quot;.
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Campo
                  label="Meta de CPA"
                  ajuda="Quanto você aceita pagar por conversão. Obrigatório: sem isso a maior parte das regras não roda."
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">R$</span>
                    <input
                      value={cpa}
                      onChange={(e) => setCpa(e.target.value.replace(/[^\d.]/g, ""))}
                      inputMode="decimal"
                      placeholder="150"
                      className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:border-cyan-500/60 focus:outline-none"
                    />
                  </div>
                </Campo>

                <Campo label="Meta de ROAS (opcional)" ajuda="Retorno sobre o investimento. Ex: 4 significa R$4 de venda para cada R$1 gasto.">
                  <input
                    value={roas}
                    onChange={(e) => setRoas(e.target.value.replace(/[^\d.]/g, ""))}
                    inputMode="decimal"
                    placeholder="4"
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:border-cyan-500/60 focus:outline-none"
                  />
                </Campo>
              </div>
            </div>

            {/* Guarda-corpos */}
            <div className="glass-panel rounded-2xl p-5">
              <h3 className="text-sm font-bold text-slate-200">Limites</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Até onde a IA pode propor ir. Ela nunca aplica sozinha, mas propostas absurdas atrapalham
                mais do que ajudam.
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Campo label={`Mexer no orçamento no máximo ${tetoPct}%`} ajuda="Por sugestão, para cima ou para baixo.">
                  <input
                    type="range" min={5} max={50} step={5}
                    value={tetoPct}
                    onChange={(e) => setTetoPct(Number(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                </Campo>

                <Campo label="Teto de orçamento diário (opcional)" ajuda="A IA nunca vai propor passar disso.">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">R$</span>
                    <input
                      value={tetoDiario}
                      onChange={(e) => setTetoDiario(e.target.value.replace(/[^\d.]/g, ""))}
                      inputMode="decimal"
                      placeholder="sem teto"
                      className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:border-cyan-500/60 focus:outline-none"
                    />
                  </div>
                </Campo>

                <Campo
                  label={`Mínimo de ${minConv} conversões para julgar CPA`}
                  ajuda="Com amostra pequena o CPA oscila demais e a IA acusaria campanha boa."
                >
                  <input
                    type="range" min={3} max={50} step={1}
                    value={minConv}
                    onChange={(e) => setMinConv(Number(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                </Campo>

                <Campo label={`Analisar os últimos ${janela} dias`} ajuda="Janela curta reage rápido, janela longa é mais confiável.">
                  <input
                    type="range" min={7} max={90} step={7}
                    value={janela}
                    onChange={(e) => setJanela(Number(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                </Campo>
              </div>
            </div>

            {/* Quais regras rodam */}
            <div className="glass-panel rounded-2xl p-5">
              <h3 className="text-sm font-bold text-slate-200">O que a IA analisa</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Desligue o que não faz sentido para este cliente.
              </p>
              <div className="mt-4 space-y-2">
                {REGRAS.map((r) => {
                  const ativa = !desligadas.includes(r.code);
                  return (
                    <label
                      key={r.code}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2.5 hover:border-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={ativa}
                        onChange={(e) =>
                          setDesligadas((d) =>
                            e.target.checked ? d.filter((x) => x !== r.code) : [...d, r.code],
                          )
                        }
                        className="mt-0.5 h-3.5 w-3.5 rounded border-slate-700 bg-slate-900"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-xs font-semibold", ativa ? "text-slate-200" : "text-slate-500")}>
                          {r.nome}
                        </p>
                        <p className="text-[11px] text-slate-500">{r.desc}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pb-4">
              <button
                onClick={() => salvar()}
                disabled={salvando}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-40"
              >
                {salvando ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                Salvar
              </button>
              {ligada ? (
                <Link
                  href="/track/ia"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  <Play size={13} />
                  Ver sugestões
                </Link>
              ) : null}
              {cpa ? (
                <span className="text-[11px] text-slate-500">
                  Meta atual: {formatCurrency(Number(cpa))} por conversão
                </span>
              ) : null}
            </div>
          </>
        )}
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
      {ajuda ? <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{ajuda}</p> : null}
    </div>
  );
}
