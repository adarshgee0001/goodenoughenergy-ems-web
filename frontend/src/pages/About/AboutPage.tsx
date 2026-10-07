
import { PageHero } from '../../components/ui/PageHero';
import bgPlaceholder from '../../assets/images/about/about-bg-placeholder.svg';

export default function AboutPage() {
  return (
    <div className="bg-white min-h-screen pb-24">
      <PageHero
        title="Driving the Energy Transition."
        description="GoodEnough Energy is building the intelligent, reliable energy infrastructure required for a sustainable future."
        bgImage={bgPlaceholder}
        badge="Company"
      />

      {/* Story */}
      <section className="py-24 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="prose prose-lg prose-slate mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 mb-6">Technology-Driven Energy Optimization</h2>
          <p className="text-slate-600 leading-relaxed mb-8">
            The global energy landscape is undergoing a massive transformation. As renewable energy sources like solar and wind become dominant, the grid faces unprecedented challenges in balancing supply and demand. GoodEnough Energy was founded to solve this critical infrastructure gap through intelligent energy management and robust battery energy storage systems (BESS).
          </p>
          <p className="text-slate-600 leading-relaxed mb-8">
            Our approach combines heavy-duty industrial hardware with highly advanced, autonomous software. We don't just store energy; we optimize it. By continuously analyzing grid conditions, local generation, and site loads, our Energy Management System ensures that every kilowatt-hour is utilized efficiently, reducing carbon footprints while simultaneously driving down operational costs.
          </p>
          
          <div className="my-16 grid sm:grid-cols-2 gap-8">
            <div className="bg-slate-50 p-8 rounded-2xl border border-slate-100">
              <h3 className="text-xl font-semibold text-slate-900 mb-4">Our Mission</h3>
              <p className="text-slate-600">To accelerate the global transition to sustainable energy by providing intelligent, scalable, and reliable energy storage and management solutions.</p>
            </div>
            <div className="bg-slate-50 p-8 rounded-2xl border border-slate-100">
              <h3 className="text-xl font-semibold text-slate-900 mb-4">Our Vision</h3>
              <p className="text-slate-600">A decentralized, resilient energy grid where every commercial and industrial site actively optimizes its own energy footprint.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
