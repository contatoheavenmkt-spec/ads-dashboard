import { X, Check } from "lucide-react";

const comparisons = [
  {
    category: "Métricas",
    other: "Métricas erradas e dados inconsistentes que geram desconfiança no cliente",
    dashfy: "Dados precisos e atualizados via API oficial, com métricas confiáveis em tempo real",
  },
  {
    category: "Compartilhamento",
    other: "Links feios, embeds enormes e URLs gigantescas que parecem amadoras",
    dashfy: "Links limpos e profissionais ou portal com login exclusivo para cada cliente",
  },
  {
    category: "Integração",
    other: "Integração demorada e manual, configuração repetida para cada cliente novo",
    dashfy: "Conexão em 2 minutos via OAuth, dados importados automaticamente sem trabalho manual",
  },
  {
    category: "Design",
    other: "Visual amador, engessado e não responsivo. Horrível no celular do cliente",
    dashfy: "Design moderno, responsivo e white-label com a sua marca em todos os dispositivos",
  },
  {
    category: "Suporte",
    other: "Materiais confusos, suporte amador e pouca clareza no atendimento",
    dashfy: "Onboarding guiado, documentação clara e suporte dedicado especializado",
  },
  {
    category: "Valor Percebido",
    other: "Relatórios confusos com design amador que não transmite profissionalismo",
    dashfy: "Dashboards profissionais que elevam a percepção de valor do seu trabalho",
  },
];

export function BentoSection() {
  return (
    <section className="relative py-20 px-4 md:px-8 bg-[#0F172A] overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:60px_60px]" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-500/5 rounded-full blur-[140px]" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-[140px]" />

      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            Por que o Dashfy e não templates{" "}
            <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
              ou outras ferramentas?
            </span>
          </h2>
          <p className="text-base md:text-lg text-gray-400 max-w-2xl mx-auto">
            Compare as soluções tradicionais com uma plataforma pensada para gestores de tráfego.
          </p>
        </div>

        <div className="hidden md:grid grid-cols-[160px_1fr_1fr] gap-6 mb-8 px-4 max-w-5xl mx-auto">
          <div />
          <div className="text-center">
            <h3 className="text-lg md:text-xl font-bold text-red-400 mb-1">Outras soluções</h3>
            <p className="text-xs text-gray-500">Templates, planilhas e ferramentas genéricas</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center mb-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/lp/d50c50aac271cbe6e044e66df6490d9529d486a9.png" alt="Dashfy" className="h-7 w-auto" />
            </div>
            <p className="text-xs text-gray-500">Plataforma profissional e especializada</p>
          </div>
        </div>

        <div className="space-y-3 max-w-5xl mx-auto">
          {comparisons.map((item, index) => (
            <div key={index}>
              <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_1fr] gap-3 md:gap-4 items-stretch">
                <div className="flex items-center justify-center">
                  <div className="w-full rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-3 text-center">
                    <span className="text-sm font-semibold text-gray-200">{item.category}</span>
                  </div>
                </div>
                <div className="relative rounded-xl border border-red-500/15 bg-gradient-to-br from-red-950/40 to-red-900/20 p-4 transition-all duration-300 hover:border-red-500/30 min-h-[90px] flex items-center">
                  <div className="flex items-start gap-3 w-full">
                    <div className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-red-500/15 flex items-center justify-center">
                      <X className="w-3.5 h-3.5 text-red-400/80" />
                    </div>
                    <p className="text-xs md:text-sm text-gray-400 leading-relaxed">{item.other}</p>
                  </div>
                </div>
                <div className="relative rounded-xl border border-blue-500/25 bg-gradient-to-br from-blue-600/20 to-blue-700/10 p-4 transition-all duration-300 hover:border-blue-500/40 min-h-[90px] flex items-center shadow-lg shadow-blue-500/5">
                  <div className="flex items-start gap-3 w-full">
                    <div className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-blue-500/25 flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                    <p className="text-xs md:text-sm text-white/90 leading-relaxed font-medium">{item.dashfy}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
