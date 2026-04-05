import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sobre a Dashfy — Dashboard de Tráfego Pago",
  description: "Conheça a Dashfy, a plataforma que centraliza métricas de Meta Ads, Google Ads e GA4 em um dashboard unificado para agências de marketing digital.",
};

export default function AboutPage() {
  return (
    <div className="space-y-12">
      {/* Hero */}
      <div className="text-center space-y-4 py-6">
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
          O que é a Dashfy?
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed">
          Uma plataforma SaaS para agências e profissionais de marketing digital que centraliza
          métricas de anúncios em um único lugar — sem precisar acessar cada plataforma separadamente.
        </p>
      </div>

      {/* Para quem serve */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-4">
        <h2 className="text-xl font-bold text-white">Para quem é a Dashfy?</h2>
        <p className="text-slate-400 leading-relaxed">
          A Dashfy foi desenvolvida para <strong className="text-slate-200">agências de marketing digital</strong> e
          profissionais de tráfego pago que gerenciam múltiplas contas de anúncios e precisam
          de visibilidade consolidada sobre o desempenho de suas campanhas.
        </p>
        <ul className="space-y-2 text-slate-400">
          {[
            "Gestores de tráfego que atendem múltiplos clientes",
            "Agências digitais que precisam reportar resultados com agilidade",
            "Profissionais que trabalham com Meta Ads, Google Ads e Google Analytics 4",
            "Times de marketing que precisam de dashboards compartilháveis com clientes",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="text-blue-400 mt-0.5">→</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Como funciona */}
      <section className="space-y-6">
        <h2 className="text-xl font-bold text-white">Como funciona</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              step: "1",
              title: "Conecte suas contas",
              desc: "Autorize a Dashfy a acessar suas contas do Meta Ads, Google Ads e GA4 via OAuth seguro. Seus dados ficam protegidos e você pode revogar o acesso a qualquer momento.",
            },
            {
              step: "2",
              title: "Visualize as métricas",
              desc: "Todas as métricas das suas campanhas — gastos, impressões, cliques, conversões, ROAS — aparecem em dashboards visuais e atualizados em tempo real.",
            },
            {
              step: "3",
              title: "Compartilhe com clientes",
              desc: "Crie workspaces por cliente e compartilhe um link de acesso ao dashboard. O cliente visualiza os dados sem precisar de login ou acesso às plataformas de anúncios.",
            },
          ].map((card) => (
            <div key={card.step} className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-black text-sm">
                {card.step}
              </div>
              <h3 className="font-bold text-white">{card.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Plataformas integradas */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-4">
        <h2 className="text-xl font-bold text-white">Plataformas integradas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              name: "Meta Ads",
              icon: "/icon-meta.png",
              desc: "Facebook e Instagram Ads — campanhas, conjuntos de anúncios, criativos, dados demográficos e regiões.",
            },
            {
              name: "Google Ads",
              icon: "/icon-google-ads.webp",
              desc: "Search, Display e Performance Max — palavras-chave, campanhas, qualidade de anúncio e conversões.",
            },
            {
              name: "Google Analytics 4",
              icon: "/icon-ga4.png",
              desc: "Sessões, usuários, eventos, conversões, origem de tráfego e comportamento do visitante.",
            },
          ].map((p) => (
            <div key={p.name} className="flex items-start gap-3">
              <img src={p.icon} alt={p.name} className="w-8 h-8 object-contain shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-white text-sm">{p.name}</p>
                <p className="text-slate-400 text-xs leading-relaxed mt-1">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Segurança */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold text-white">Segurança e privacidade</h2>
        <p className="text-slate-400 leading-relaxed">
          A Dashfy acessa seus dados de anúncios exclusivamente com sua autorização explícita, via
          OAuth oficial das plataformas. Não armazenamos senhas das plataformas externas,
          não vendemos seus dados e você pode revogar o acesso a qualquer momento pelas configurações
          da sua conta ou diretamente nas plataformas (Facebook, Google).
        </p>
        <p className="text-slate-400 leading-relaxed">
          Para mais detalhes, consulte nossa{" "}
          <Link href="/privacy" className="text-blue-400 hover:text-blue-300 underline">Política de Privacidade</Link>{" "}
          e nossos{" "}
          <Link href="/terms" className="text-blue-400 hover:text-blue-300 underline">Termos de Uso</Link>.
        </p>
      </section>

      {/* CTA */}
      <div className="text-center py-6">
        <Link
          href="/cadastro"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all active:scale-95"
        >
          Criar conta grátis — 7 dias de trial
        </Link>
        <p className="text-slate-500 text-xs mt-3">Sem cartão de crédito para começar o trial.</p>
      </div>
    </div>
  );
}
