import { HeroSection } from "./_components/hero-section";
import { ProblemSection } from "./_components/problem-section";
import { FeaturesSection } from "./_components/features-section";
import { UniqueFeaturesSection } from "./_components/unique-features-section";
import { GridFeaturesSection } from "./_components/grid-features-section";
import { BentoSection } from "./_components/bento-section";
import { PricingSection } from "./_components/pricing-section";
import { FAQSection } from "./_components/faq-section";

export const metadata = {
  title: "Dashfy — Relatórios automáticos de tráfego pago",
  description:
    "Automatize seus relatórios de Meta Ads, Google Ads e GA4. Economize tempo, impressione seus clientes e escale sua agência com o Dashfy.",
};

// `content-visibility: auto` faz o navegador pular layout/paint das seções
// que estão fora do viewport; `contain-intrinsic-size` reserva a altura
// estimada para a barra de rolagem não pular. Sem efeito visual — só evita
// que cada repaint durante a rolagem atravesse a página inteira.
// A seção de preços fica de fora: o canvas de partículas precisa medir a
// própria largura ao montar.
const deferred = "[content-visibility:auto] [contain-intrinsic-size:auto_900px]";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      <HeroSection />
      <ProblemSection />
      <div className={deferred}>
        <FeaturesSection />
      </div>
      <UniqueFeaturesSection />
      <div className={deferred}>
        <GridFeaturesSection />
      </div>
      <div className={deferred}>
        <BentoSection />
      </div>
      <PricingSection />
      <div className={deferred}>
        <FAQSection />
      </div>
    </div>
  );
}
