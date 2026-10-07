import { SectionHeader } from '../../components/ui/SectionHeader';
import { solutions } from '../../data/solutions';

import { PageHero } from '../../components/ui/PageHero';
import bgPlaceholder from '../../assets/images/solutions/solutions-bg-placeholder.svg';
import { FAQSection } from '../../components/sections/FAQSection';
import { solutionsFaqs } from '../../data/faqs';

export default function SolutionsPage() {
  return (
    <div className="bg-white min-h-screen pb-24">
      <PageHero
        title="Energy Solutions Built Around Your Needs."
        description="Discover how GoodEnough Energy's integrated EMS and StorEDGE systems solve real-world industrial and commercial energy challenges."
        bgImage={bgPlaceholder}
        badge="Use Cases"
      />

      {/* Solutions List */}
      <section className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader title="Operational & Financial Solutions" subtitle="Practical use cases powered by intelligent energy management." />
        
        <div className="space-y-12">
          {solutions.map((solution, idx) => (
            <div key={solution.id} className="bg-slate-50 rounded-3xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div className="grid md:grid-cols-12">
                <div className="md:col-span-4 bg-slate-100 p-8 flex flex-col justify-center border-b md:border-b-0 md:border-r border-slate-200">
                  <div className="text-sm font-semibold text-primary-600 tracking-wider uppercase mb-2">Solution {idx + 1}</div>
                  <h2 className="text-2xl font-bold text-slate-900">{solution.title}</h2>
                </div>
                <div className="md:col-span-8 p-8 grid md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">The Problem</h3>
                    <p className="text-slate-600 leading-relaxed">{solution.problem}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-primary-600 uppercase tracking-wider mb-2">Our Approach</h3>
                    <p className="text-slate-600 leading-relaxed mb-4">{solution.approach}</p>
                    <div className="bg-white p-4 rounded-xl border border-slate-200">
                      <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Expected Benefit</span>
                      <span className="text-slate-900 font-medium">{solution.benefit}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <FAQSection items={solutionsFaqs} />
    </div>
  );
}
