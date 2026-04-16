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

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      <HeroSection />
      <ProblemSection />
      <FeaturesSection />
      <UniqueFeaturesSection />
      <GridFeaturesSection />
      <BentoSection />
      <PricingSection />
      <FAQSection />
    </div>
  );
}
