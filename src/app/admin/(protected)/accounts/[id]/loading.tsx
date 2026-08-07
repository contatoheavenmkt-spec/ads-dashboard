import { ArrowLeft } from "lucide-react";

import { Skeleton } from "../../../_components/admin-ui";

/**
 * Esqueleto de /admin/accounts/[id] — mesmas regras do loading.tsx do
 * Financeiro. Aqui quase tudo é dado (nome, badges, e-mail, campos do
 * formulário), então quase tudo vira bloco cinza; o que sobra de chrome fixo
 * é a seta de voltar e a moldura das abas. Geometria de page.tsx:
 * `p-6 space-y-5 max-w-4xl`, abas em `p-1` e painel `p-6` com grade
 * `sm:grid-cols-2` de campos.
 */
export default function CarregandoConta() {
  return (
    <div className="p-6 space-y-5 max-w-4xl">
      {/* Cabeçalho: seta decorativa (o link real só existe com a página) +
          nome, dois badges e e-mail — todos dinâmicos. */}
      <div className="flex items-start gap-4">
        <span aria-hidden className="text-slate-600 mt-0.5">
          <ArrowLeft size={18} />
        </span>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3.5 w-56 max-w-full" />
        </div>
      </div>

      {/* Abas: cinco pílulas na moldura real. Os rótulos são fixos no código,
          mas cada botão muda de cor com a aba ativa — bloco é mais honesto. */}
      <div className="flex gap-1 bg-slate-900/60 border border-slate-800/60 rounded-xl p-1 flex-wrap">
        {["w-20", "w-24", "w-32", "w-24", "w-32"].map((largura, i) => (
          <Skeleton key={i} className={`h-8 ${largura} rounded-lg`} />
        ))}
      </div>

      {/* Conteúdo da aba inicial (Perfil): título de seção, grade de quatro
          campos rotulados e o botão de salvar. */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-6 space-y-5">
        <Skeleton className="h-3 w-44" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          ))}
        </div>
        <Skeleton className="h-10 w-36 rounded-xl" />
      </div>
    </div>
  );
}
