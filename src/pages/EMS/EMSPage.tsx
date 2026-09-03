import { Link } from 'react-router-dom';
import { EnergyFlow } from '../Home/components/EnergyFlow';
import { EnergyChart } from '../../components/charts/EnergyChart';
import { BatterySOCChart } from '../../components/charts/BatterySOCChart';
import { KPICard } from '../../components/ui/KPICard';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { mockTelemetry } from '../../data/mockTelemetry';
import { Zap, TrendingDown, Battery, Sun, Network, Settings, Activity } from 'lucide-react';
import { useScrollReveal } from '../../hooks/useScrollReveal';

import { PageHero } from '../../components/ui/PageHero';
import emsBgPlaceholder from '../../assets/images/ems/ems-bg-placeholder.svg';
import { FAQSection } from '../../components/sections/FAQSection';
import { emsFaqs } from '../../data/faqs';

function RevealSection({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  const ref = useScrollReveal();
  return <section ref={ref} className={className}>{children}</section>;
}

export default function EMSPage() {
  const capabilities = [
    { title: 'Energy Optimization', desc: 'Holistic management to maximize efficiency.', icon: <Zap className="w-6 h-6" /> },
    { title: 'Peak Shaving', desc: 'Reduce grid demand during peak periods.', icon: <TrendingDown className="w-6 h-6" /> },
    { title: 'Battery Optimization', desc: 'Extend lifespan and maximize ROI.', icon: <Battery className="w-6 h-6" /> },
    { title: 'Solar Integration', desc: 'Seamlessly incorporate PV generation.', icon: <Sun className="w-6 h-6" /> },
    { title: 'Grid Management', desc: 'Smooth export and import in compliance.', icon: <Network className="w-6 h-6" /> },
    { title: 'Load Management', desc: 'Balance and control critical site loads.', icon: <Settings className="w-6 h-6" /> },
    { title: 'Real-Time Monitoring', desc: 'Granular visibility into every asset.', icon: <Activity className="w-6 h-6" /> },
  ];

  return (
    <div className="bg-slate-50 min-h-screen relative">
      {/* Subtle background pattern for EMS page body */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.02]" style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      
      {/* Hero */}
      <PageHero
        title="Intelligent Energy Management"
        description="Our EMS coordinates energy generation, storage, consumption, and grid interaction to optimize how your energy is used in real-time."
        badge="Platform"
        bgImage={emsBgPlaceholder}
      />

      {/* What is EMS */}
      <RevealSection className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 mb-6">The Brain of Your Energy System</h2>
            <p className="text-lg text-slate-600 mb-8 leading-relaxed">
              An intelligent EMS eliminates guesswork. It constantly analyzes grid tariffs, solar production, and site load, autonomously deciding:
            </p>
            <div className="grid sm:grid-cols-2 gap-6">
              {[
                'When to use solar',
                'When to charge BESS',
                'When to discharge BESS',
                'When to use grid power',
                'When to export energy',
                'How to balance loads',
                'How to optimize usage',
              ].map((item, idx) => (
                <div key={idx} className="flex items-center">
                  <div className="flex-shrink-0 h-2 w-2 rounded-full bg-primary-600 mr-3" />
                  <span className="text-slate-700 font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-center bg-slate-50 p-8 rounded-3xl border border-slate-100">
            <EnergyFlow />
          </div>
        </div>
      </RevealSection>

      {/* Operating Scenarios */}
      <RevealSection className="py-24 bg-slate-50 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader title="Intelligent Operating Scenarios" subtitle="How our EMS responds to real-world conditions automatically." />
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-6 flex items-center">
                <Sun className="w-6 h-6 text-primary-600 mr-3" /> Solar Surplus
              </h3>
              <div className="space-y-4 text-slate-600">
                <p>Solar generates more energy than current load.</p>
                <div className="pl-4 border-l-2 border-primary-200 space-y-2 text-sm font-medium">
                  <p>&rarr; Load supplied</p>
                  <p>&rarr; Excess energy</p>
                  <p>&rarr; BESS charging</p>
                  <p>&rarr; Battery full</p>
                  <p>&rarr; Potential grid export</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-6 flex items-center">
                <TrendingDown className="w-6 h-6 text-amber-500 mr-3" /> Peak Demand
              </h3>
              <div className="space-y-4 text-slate-600">
                <p>Site demand increases during expensive peak periods.</p>
                <div className="pl-4 border-l-2 border-amber-200 space-y-2 text-sm font-medium">
                  <p>&rarr; Higher Load</p>
                  <p>&rarr; EMS detects demand</p>
                  <p>&rarr; BESS discharges</p>
                  <p>&rarr; Grid demand reduced</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-6 flex items-center">
                <Zap className="w-6 h-6 text-blue-500 mr-3" /> Low-Cost Grid
              </h3>
              <div className="space-y-4 text-slate-600">
                <p>Grid energy is inexpensive (e.g., overnight).</p>
                <div className="pl-4 border-l-2 border-blue-200 space-y-2 text-sm font-medium">
                  <p>&rarr; Grid</p>
                  <p>&rarr; EMS</p>
                  <p>&rarr; BESS charging</p>
                  <p>&rarr; Stored energy available later</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </RevealSection>

      {/* Analytics Preview */}
      <RevealSection className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader title="Real-Time Analytics" subtitle="Comprehensive visibility into your energy flow, powered by granular data." />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
            <KPICard title="Battery SOC" value="82%" icon={<Battery className="w-5 h-5" />} />
            <KPICard title="Solar Gen" value="184 kW" icon={<Sun className="w-5 h-5" />} />
            <KPICard title="Site Load" value="142 kW" icon={<Zap className="w-5 h-5" />} />
            <KPICard title="Grid Import/Export" value="0 kW" icon={<Network className="w-5 h-5" />} />
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            <EnergyChart data={mockTelemetry} />
            <BatterySOCChart data={mockTelemetry} />
          </div>
        </div>
      </RevealSection>

      {/* Capabilities */}
      <RevealSection className="py-24 bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader title="EMS Capabilities" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {capabilities.map((cap, i) => (
              <div key={i} className="bg-slate-800 p-6 rounded-2xl border border-slate-700 hover:border-slate-600 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-primary-900/50 text-primary-400 flex items-center justify-center mb-4">
                  {cap.icon}
                </div>
                <h3 className="text-lg font-semibold mb-2">{cap.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{cap.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </RevealSection>

      <RevealSection>
        <FAQSection items={emsFaqs} />
      </RevealSection>

      {/* CTA */}
      <RevealSection className="py-24 bg-white text-center px-4 max-w-3xl mx-auto">
        <h2 className="text-3xl font-bold text-slate-900 mb-6">Connect Your Assets</h2>
        <p className="text-lg text-slate-600 mb-10">Pair our EMS with the StorEDGE portfolio for maximum efficiency.</p>
        <Link to="/products" className="px-8 py-4 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-full shadow-sm transition-colors text-lg">
          Explore Products
        </Link>
      </RevealSection>
    </div>
  );
}
