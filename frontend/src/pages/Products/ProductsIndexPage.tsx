// import { products } from '../../data/products';
// import { ProductCard } from '../../components/products/ProductCard';
// import { PageHero } from '../../components/ui/PageHero';
// import bgPlaceholder from '../../assets/images/products/products-bg-placeholder.svg';

// export default function ProductsIndexPage() {
//   return (
//     <div className="bg-slate-50 min-h-screen">
//       <PageHero
//         title="Battery Storage Built for Intelligent Energy."
//         description="Discover the StorEDGE portfolio. Our Battery Energy Storage Systems (BESS) are engineered to integrate seamlessly with our advanced EMS, Solar generation, Grid power, and site loads."
//         bgImage={bgPlaceholder}
//         badge="StorEDGE Portfolio"
//       />
//       <div className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
//         <div className="grid md:grid-cols-2 gap-8">
//           {products.map(product => (
//             <ProductCard key={product.id} product={product} />
//           ))}
//         </div>
//       </div>
//     </div>
//   );
// }


import { products } from '../../data/products';
import { ProductCard } from '../../components/products/ProductCard';
import { motion } from 'framer-motion';
import { ArrowUpRight, Sparkles, Battery, Zap, Shield, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

// Inline SVG Component - Replaces bgPlaceholder import
const ProductsBgSVG = ({ className = "w-full h-full" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 800 600" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: '#f1f5f9' }} />
        <stop offset="100%" style={{ stopColor: '#e2e8f0' }} />
      </linearGradient>
      <linearGradient id="bgGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: '#3b82f6', stopOpacity: 0.3 }} />
        <stop offset="100%" style={{ stopColor: '#8b5cf6', stopOpacity: 0.3 }} />
      </linearGradient>
      <pattern id="gridPattern" width="40" height="40" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1" fill="#94a3b8" opacity="0.15" />
        <circle cx="22" cy="22" r="1" fill="#94a3b8" opacity="0.15" />
      </pattern>
    </defs>

    {/* Background */}
    <rect width="800" height="600" fill="url(#bgGrad1)" />
    <rect width="800" height="600" fill="url(#gridPattern)" />

    {/* Decorative Circles */}
    <circle cx="150" cy="120" r="80" fill="url(#bgGrad2)" filter="blur(40px)" />
    <circle cx="650" cy="480" r="100" fill="url(#bgGrad2)" filter="blur(40px)" />
    <circle cx="400" cy="300" r="120" fill="url(#bgGrad2)" opacity="0.2" filter="blur(60px)" />

    {/* Battery Icons Grid */}
    <g opacity="0.15">
      <rect x="100" y="80" width="40" height="60" rx="6" stroke="#94a3b8" strokeWidth="2" />
      <rect x="110" y="70" width="20" height="15" rx="3" fill="#94a3b8" />
      <rect x="110" y="95" width="20" height="30" rx="3" fill="#3b82f6" opacity="0.5" />

      <rect x="660" y="420" width="40" height="60" rx="6" stroke="#94a3b8" strokeWidth="2" />
      <rect x="670" y="410" width="20" height="15" rx="3" fill="#94a3b8" />
      <rect x="670" y="435" width="20" height="30" rx="3" fill="#8b5cf6" opacity="0.5" />

      <rect x="200" y="450" width="30" height="45" rx="4" stroke="#94a3b8" strokeWidth="1.5" />
      <rect x="207" y="442" width="15" height="10" rx="2" fill="#94a3b8" />
      <rect x="207" y="460" width="15" height="25" rx="2" fill="#3b82f6" opacity="0.4" />

      <rect x="570" y="80" width="30" height="45" rx="4" stroke="#94a3b8" strokeWidth="1.5" />
      <rect x="577" y="72" width="15" height="10" rx="2" fill="#94a3b8" />
      <rect x="577" y="90" width="15" height="25" rx="2" fill="#8b5cf6" opacity="0.4" />
    </g>

    {/* Floating Energy Particles */}
    <circle cx="300" cy="180" r="3" fill="#3b82f6" opacity="0.4">
      <animate attributeName="cy" values="180;160;180" dur="3s" repeatCount="indefinite" />
      <animate attributeName="opacity" values="0.4;0.8;0.4" dur="3s" repeatCount="indefinite" />
    </circle>
    <circle cx="500" cy="420" r="3" fill="#8b5cf6" opacity="0.4">
      <animate attributeName="cy" values="420;400;420" dur="3.5s" repeatCount="indefinite" />
      <animate attributeName="opacity" values="0.4;0.8;0.4" dur="3.5s" repeatCount="indefinite" />
    </circle>
    <circle cx="180" cy="350" r="2" fill="#3b82f6" opacity="0.3">
      <animate attributeName="cy" values="350;330;350" dur="4s" repeatCount="indefinite" />
      <animate attributeName="opacity" values="0.3;0.6;0.3" dur="4s" repeatCount="indefinite" />
    </circle>

    {/* Main Text */}
    <text x="400" y="380" fontFamily="Arial, sans-serif" fontSize="32" fontWeight="bold" fill="#94a3b8" textAnchor="middle" letterSpacing="8" opacity="0.3">
      ENERGY STORAGE
    </text>
    <text x="400" y="420" fontFamily="Arial, sans-serif" fontSize="18" fontWeight="normal" fill="#cbd5e1" textAnchor="middle" letterSpacing="12" opacity="0.3">
      SOLUTIONS
    </text>
  </svg>
);

// Stats Data
const stats = [
  { label: 'Products', value: '2', icon: Battery },
  { label: 'Total Capacity', value: '5.25 MWh', icon: Zap },
  { label: 'Use Cases', value: '9+', icon: Shield },
  { label: 'Efficiency', value: '98%', icon: TrendingUp },
];

export default function ProductsIndexPage() {
  return (
    <div className="bg-white min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-50 pt-16 pb-24 lg:pt-24 lg:pb-32">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -right-20 -top-20 w-96 h-96 bg-primary-100/20 rounded-full blur-3xl" />
          <div className="absolute -left-20 -bottom-20 w-96 h-96 bg-blue-100/20 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumbs */}
          <motion.nav
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 text-sm mb-8"
          >
            <Link to="/" className="text-slate-400 hover:text-slate-600 transition-colors">Home</Link>
            <span className="text-slate-300">/</span>
            <span className="text-slate-900 font-medium">Products</span>
          </motion.nav>

          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left - Text Content */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 bg-primary-50 px-4 py-2 rounded-full mb-6">
                <Sparkles className="w-4 h-4 text-primary-600" />
                <span className="text-xs font-semibold text-primary-700 uppercase tracking-wider">Our Products</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 mb-6">
                Energy Storage
                <span className="block bg-gradient-to-r from-primary-600 to-blue-600 bg-clip-text text-transparent">
                  Built for Tomorrow
                </span>
              </h1>

              <p className="text-lg text-slate-600 leading-relaxed mb-8 max-w-lg">
                Discover our range of high-performance BESS units, engineered for
                intelligent energy management and optimized for your specific needs.
              </p>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {stats.map((stat, index) => {
                  const Icon = stat.icon;
                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm text-center"
                    >
                      <Icon className="w-5 h-5 text-primary-600 mx-auto mb-1" />
                      <p className="text-lg font-bold text-slate-900">{stat.value}</p>
                      <p className="text-xs text-slate-500">{stat.label}</p>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>

            {/* Right - Visual */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              <div className="relative bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
                <ProductsBgSVG className="w-full h-auto aspect-square" />

                {/* Floating Cards */}
                <div className="absolute top-6 left-6 bg-white/90 backdrop-blur-sm rounded-xl p-3 shadow-lg border border-white/50">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                      <Battery className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Available</p>
                      <p className="text-sm font-bold text-slate-900">2 Models</p>
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-6 right-6 bg-white/90 backdrop-blur-sm rounded-xl p-3 shadow-lg border border-white/50">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <Zap className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Capacity Range</p>
                      <p className="text-sm font-bold text-slate-900">250 kWh - 5 MWh</p>
                    </div>
                  </div>
                </div>

                <div className="absolute top-6 right-6 bg-white/90 backdrop-blur-sm rounded-xl p-2 shadow-lg border border-white/50">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white text-xs font-semibold rounded-full">
                    <Sparkles className="w-3 h-3" />
                    EMS Ready
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Products Grid */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center max-w-3xl mx-auto mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Our <span className="bg-gradient-to-r from-primary-600 to-blue-600 bg-clip-text text-transparent">Product Line</span>
            </h2>
            <p className="text-lg text-slate-600">
              Choose the perfect BESS solution for your energy needs, backed by intelligent EMS integration.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8">
            {products.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15 }}
              >
                <ProductCard product={product} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
              Need Help Choosing the Right Solution?
            </h2>
            <p className="text-xl text-slate-300 mb-10 leading-relaxed">
              Our energy experts are ready to help you select the perfect BESS for your specific requirements.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 px-8 py-4 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300"
              >
                Talk to an Expert
                <ArrowUpRight className="w-4 h-4" />
              </Link>
              <Link
                to="/ems"
                className="inline-flex items-center gap-2 px-8 py-4 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-full border border-white/20 hover:border-white/30 transition-all duration-300 backdrop-blur-sm"
              >
                Learn About EMS
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}