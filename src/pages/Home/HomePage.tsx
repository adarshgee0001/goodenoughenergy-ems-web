import { Hero } from './components/Hero';
import { EMSIntroduction } from './components/EMSIntroduction';
import { EnergyIntelligence } from './components/EnergyIntelligence';
import { Capabilities } from './components/Capabilities';
import { ProductsPreview } from './components/ProductsPreview';
import { AnalyticsPreview } from './components/AnalyticsPreview';
import { CTASection } from './components/CTASection';
import { FAQSection } from '../../components/sections/FAQSection';
import { homeFaqs } from '../../data/faqs';
import { useScrollReveal } from '../../hooks/useScrollReveal';

function RevealSection({ children }: { children: React.ReactNode }) {
  const ref = useScrollReveal();
  return <div ref={ref}>{children}</div>;
}

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Hero />
      <RevealSection><EMSIntroduction /></RevealSection>
      <RevealSection><EnergyIntelligence /></RevealSection>
      <RevealSection><Capabilities /></RevealSection>
      <RevealSection><ProductsPreview /></RevealSection>
      <RevealSection><AnalyticsPreview /></RevealSection>
      <RevealSection><FAQSection items={homeFaqs} /></RevealSection>
      <RevealSection><CTASection /></RevealSection>
    </div>
  );
}
