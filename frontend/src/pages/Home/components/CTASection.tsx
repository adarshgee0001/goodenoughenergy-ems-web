import { Link } from 'react-router-dom';

export function CTASection() {
  return (
    <section className="py-24 bg-primary-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-4xl font-bold text-white tracking-tight sm:text-5xl mb-6">
          Build a Smarter Energy System.
        </h2>
        <p className="text-xl text-primary-50 max-w-2xl mx-auto mb-10 leading-relaxed">
          Connect renewable generation, battery storage, grid power and loads through intelligent energy management.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/ems"
            className="w-full sm:w-auto px-8 py-4 bg-white text-primary-700 hover:bg-slate-50 font-semibold rounded-full shadow-sm transition-colors text-lg"
          >
            Explore EMS
          </Link>
          <Link
            to="/products"
            className="w-full sm:w-auto px-8 py-4 bg-primary-700 border border-primary-500 hover:bg-primary-800 text-white font-semibold rounded-full shadow-sm transition-colors text-lg"
          >
            View StorEDGE
          </Link>
        </div>
      </div>
    </section>
  );
}
