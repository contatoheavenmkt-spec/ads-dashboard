"use client";
import { useState } from "react";

interface FeatureCardProps {
  title: string;
  description: string;
  image: string;
  badge?: string;
  comingSoon?: boolean;
}

const ImageWithFallback = ({
  src,
  alt,
  className,
  comingSoon,
}: {
  src: string;
  alt: string;
  className: string;
  comingSoon?: boolean;
}) => {
  const [error, setError] = useState(false);

  if (error || comingSoon) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
        <svg className="w-16 h-16 text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
        <span className="text-gray-500 text-sm font-medium">Em breve</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} onError={() => setError(true)} />
  );
};

const FeatureCard = ({ title, description, image, badge, comingSoon }: FeatureCardProps) => (
  <div className="group relative">
    <div className={`absolute top-0 left-0 w-20 h-1 ${comingSoon ? "bg-gray-700" : "bg-gradient-to-r from-blue-500 to-cyan-400"}`} />
    <div className={`h-full rounded-2xl border p-6 transition-all duration-300 ${
      comingSoon
        ? "border-white/5 bg-gradient-to-br from-gray-900/40 to-gray-800/20"
        : "border-white/10 bg-gradient-to-br from-gray-900/50 to-gray-800/30 hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-500/20"
    }`}>
      <div className="relative mb-6 overflow-hidden rounded-xl bg-gradient-to-br from-gray-800/60 to-gray-900/60 border border-white/5" style={{ height: "160px" }}>
        {comingSoon ? (
          <div className="h-full w-full flex flex-col items-center justify-center gap-2">
            <svg className="w-7 h-7 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <span className="text-xs text-gray-600 font-medium tracking-wide">Em breve</span>
          </div>
        ) : (
          <>
            <ImageWithFallback
              src={image}
              alt={title}
              className="w-full h-full object-cover object-top opacity-90 group-hover:scale-105 group-hover:opacity-100 transition-all duration-500"
            />
            <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-gray-900/70 to-transparent pointer-events-none" />
          </>
        )}
        {badge && !comingSoon && (
          <div className="absolute top-2.5 right-2.5">
            <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-500 shadow-md">
              ★ {badge}
            </span>
          </div>
        )}
        {comingSoon && (
          <div className="absolute top-2.5 right-2.5">
            <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-gray-500 bg-gray-800/90 border border-gray-700/50">
              Em breve
            </span>
          </div>
        )}
      </div>
      <h3 className={`mb-3 text-xl font-bold ${comingSoon ? "text-gray-500" : "bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent"}`}>
        {title}
      </h3>
      <p className={`text-sm leading-relaxed ${comingSoon ? "text-gray-600" : "text-gray-300"}`}>
        {description.split("**").map((part, index) =>
          index % 2 === 1 ? (
            <span key={index} className={comingSoon ? "text-gray-600 font-semibold" : "text-cyan-400 font-semibold"}>{part}</span>
          ) : (
            <span key={index}>{part}</span>
          )
        )}
      </p>
    </div>
  </div>
);

const features: FeatureCardProps[] = [
  {
    title: "Dashboard Meta Ads",
    description: "Integração **oficial via API do Meta** para puxar dados de Facebook Ads e Instagram Ads em tempo real, com todas as métricas atualizadas automaticamente.",
    image: "/lp/meta-ads-dashboard.png",
  },
  {
    title: "Dashboard Google Ads",
    description: "Conexão **direta com a API oficial do Google Ads** trazendo campanhas, palavras-chave, conversões e performance completa em um painel unificado.",
    image: "/lp/google-ads-dashboard.png",
  },
  {
    title: "Dashboard Google Analytics 4",
    description: "Integrado com **API oficial do GA4** para análise de sessões, usuários, comportamento e eventos em tempo real direto no seu dashboard.",
    image: "",
    comingSoon: true,
  },
  {
    title: "Visão Geral Consolidada",
    description: "Painel único que **unifica todos os dados** de Meta Ads, Google Ads e GA4, mostrando performance geral com métricas comparativas e ROI consolidado.",
    image: "/lp/visao-geral.png",
  },
  {
    title: "Acesso para Cliente Final",
    description: "Seus clientes recebem **login e senha exclusivos** para acessar o dashboard quando quiserem, sem te ligar toda hora perguntando resultados.",
    image: "/lp/client-access.png",
  },
  {
    title: "Compartilhamento via Link",
    description: "Envie dashboards via **link protegido por senha** sem necessidade de criar login, perfeito para apresentações e reuniões rápidas.",
    image: "/lp/share-link.png",
  },
  {
    title: "App Android e iOS",
    description: "Aplicativo nativo para **celulares e tablets** permitindo que seus clientes acompanhem as métricas de qualquer lugar, a qualquer hora.",
    image: "",
    comingSoon: true,
  },
  {
    title: "Notificações Push",
    description: "Cliente recebe **alertas automáticos no celular** quando metas são batidas, orçamento atinge limites ou performance muda significativamente.",
    image: "",
    comingSoon: true,
  },
  {
    title: "Dashboard White Label",
    description: "Personalize com **sua marca, logo e cores**. O cliente vê tudo como se fosse uma plataforma exclusiva da sua agência.",
    image: "",
    comingSoon: true,
  },
  {
    title: "Domínio Personalizado",
    description: "Use **seu próprio domínio** (ex: relatorios.suaagencia.com) para entregar dashboards com aparência 100% profissional e personalizada.",
    image: "",
    comingSoon: true,
  },
];

export function UniqueFeaturesSection() {
  return (
    <section className="relative py-20 px-6 bg-[#0F172A] overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,black,transparent)]" />
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            Tudo que você precisa{" "}
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              em uma só plataforma
            </span>
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 [&>*:nth-last-child(1):nth-child(3n+1)]:lg:col-start-2">
          {features.map((feature, index) => (
            <FeatureCard key={index} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
}
