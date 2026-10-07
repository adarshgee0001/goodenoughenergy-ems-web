import { EnergyFlow } from './EnergyFlow';

export function EMSIntroduction() {
  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight sm:text-4xl mb-6">
              Energy Management, <span className="text-primary-600">Made Intelligent.</span>
            </h2>
            <p className="text-lg text-slate-600 mb-8 leading-relaxed">
              Our advanced Energy Management System (EMS) makes real-time, autonomous decisions for your site. It instantly determines:
            </p>
            <ul className="space-y-4 mb-8">
              {[
                'When to utilize solar generation',
                'When to charge or discharge the battery',
                'When to rely on grid power',
                'When to export excess energy',
                'How to balance critical loads',
              ].map((item, index) => (
                <li key={index} className="flex items-start">
                  <span className="flex-shrink-0 h-6 w-6 rounded-full bg-primary-100 flex items-center justify-center mr-3 mt-0.5">
                    <span className="w-2 h-2 bg-primary-600 rounded-full" />
                  </span>
                  <span className="text-slate-700">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-center lg:justify-end">
            <EnergyFlow />
          </div>
        </div>
      </div>
    </section>
  );
}
