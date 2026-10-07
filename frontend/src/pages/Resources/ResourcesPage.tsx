import { BookOpen, FileText, Lightbulb, Zap, Download } from 'lucide-react';
import { Link } from 'react-router-dom';

import { PageHero } from '../../components/ui/PageHero';
import bgPlaceholder from '../../assets/images/resources/resources-bg-placeholder.svg';

export default function ResourcesPage() {
  const resources = [
    { category: 'EMS Knowledge', icon: <Zap className="w-6 h-6" />, items: ['Understanding Peak Shaving Algorithms', 'The Role of AI in Energy Dispatch', 'Integrating Solar with EMS'] },
    { category: 'BESS Knowledge', icon: <Battery className="w-6 h-6" />, items: ['Li-Ion vs. LFP Battery Chemistries', 'Sizing Your Battery Storage System', 'Thermal Management in BESS'] },
    { category: 'Energy Insights', icon: <Lightbulb className="w-6 h-6" />, items: ['Navigating Time-of-Use Tariffs', 'The Future of Decentralized Grids', 'ROI Analysis for Commercial Storage'] },
    { category: 'Technical Resources', icon: <BookOpen className="w-6 h-6" />, items: ['StorEDGE 0.25 Installation Guide', 'Modbus/TCP Integration Specs', 'Site Preparation Requirements'] },
    { category: 'Documentation', icon: <FileText className="w-6 h-6" />, items: ['API Documentation (v2.0)', 'Warranty Information', 'Safety Data Sheets (SDS)'] },
  ];

  return (
    <div className="bg-slate-50 min-h-screen pb-24">
      <PageHero
        title="Resource Hub"
        description="Explore guides, technical documentation, and industry insights to help you build a smarter energy system."
        bgImage={bgPlaceholder}
        badge="Learn"
      />

      {/* Resources */}
      <section className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {resources.map((res, i) => (
            <div key={i} className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
              <div className="flex items-center mb-6">
                <div className="w-12 h-12 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center mr-4">
                  {res.icon}
                </div>
                <h2 className="text-xl font-bold text-slate-900">{res.category}</h2>
              </div>
              <ul className="space-y-4 flex-grow">
                {res.items.map((item, j) => (
                  <li key={j} className="flex items-start">
                    <Download className="w-4 h-4 text-slate-400 mr-2 mt-1 flex-shrink-0" />
                    <Link to="#" className="text-slate-600 hover:text-primary-600 transition-colors">
                      {item}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// Ensure Battery icon is available
import { Battery } from 'lucide-react';
