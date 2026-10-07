

import { useParams, Link } from 'react-router-dom';
import { products } from '../../data/products';
import { EnergyFlow } from '../Home/components/EnergyFlow';
import { Battery, Zap, Settings, ArrowUpRight, Sparkles, CheckCircle, Shield, Gauge } from 'lucide-react';
import { FAQSection } from '../../components/sections/FAQSection';
import { storedge025Faqs, storedge50Faqs } from '../../data/faqs';
import { motion } from 'framer-motion';
import { useState } from 'react';

// Inline SVG Component - Replaces bgPlaceholder import
const ProductDetailBg = ({ className = "w-full h-full" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 800 600" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: '#f1f5f9' }} />
        <stop offset="100%" style={{ stopColor: '#e2e8f0' }} />
      </linearGradient>
      <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: '#3b82f6', stopOpacity: 0.4 }} />
        <stop offset="100%" style={{ stopColor: '#8b5cf6', stopOpacity: 0.4 }} />
      </linearGradient>
      <pattern id="pattern" width="60" height="60" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1.5" fill="#94a3b8" opacity="0.2" />
        <circle cx="32" cy="32" r="1.5" fill="#94a3b8" opacity="0.2" />
      </pattern>
    </defs>

    {/* Background */}
    <rect width="800" height="600" fill="url(#grad1)" />
    <rect width="800" height="600" fill="url(#pattern)" />

    {/* Glow Effects */}
    <circle cx="200" cy="150" r="200" fill="url(#grad2)" opacity="0.3" filter="blur(60px)" />
    <circle cx="600" cy="450" r="180" fill="url(#grad2)" opacity="0.2" filter="blur(60px)" />

    {/* Battery Illustration */}
    <g transform="translate(400, 280)">
      {/* Battery Body */}
      <rect x="-100" y="-140" width="200" height="240" rx="30" stroke="#94a3b8" strokeWidth="4" fill="white" opacity="0.6" />

      {/* Battery Top */}
      <rect x="-40" y="-175" width="80" height="45" rx="12" fill="#94a3b8" opacity="0.5" />
      <rect x="-30" y="-165" width="60" height="25" rx="8" fill="#cbd5e1" />

      {/* Battery Cells with Animation */}
      <rect x="-80" y="-110" width="45" height="180" rx="12" fill="#60a5fa" opacity="0.3">
        <animate attributeName="opacity" values="0.3;0.5;0.3" dur="3s" repeatCount="indefinite" />
      </rect>
      <rect x="-25" y="-110" width="45" height="180" rx="12" fill="#60a5fa" opacity="0.5">
        <animate attributeName="opacity" values="0.5;0.7;0.5" dur="3.5s" repeatCount="indefinite" />
      </rect>
      <rect x="30" y="-110" width="45" height="180" rx="12" fill="#60a5fa" opacity="0.7">
        <animate attributeName="opacity" values="0.7;0.9;0.7" dur="4s" repeatCount="indefinite" />
      </rect>

      {/* Glow Ring */}
      <rect x="-100" y="-140" width="200" height="240" rx="30" stroke="#3b82f6" strokeWidth="2" opacity="0">
        <animate attributeName="opacity" values="0;0.6;0" dur="2s" repeatCount="indefinite" />
        <animate attributeName="stroke-width" values="2;4;2" dur="2s" repeatCount="indefinite" />
      </rect>
    </g>

    {/* Floating Particles */}
    <circle cx="150" cy="120" r="4" fill="#3b82f6" opacity="0.3">
      <animate attributeName="cy" values="120;100;120" dur="4s" repeatCount="indefinite" />
      <animate attributeName="opacity" values="0.3;0.6;0.3" dur="4s" repeatCount="indefinite" />
    </circle>
    <circle cx="650" cy="100" r="3" fill="#8b5cf6" opacity="0.3">
      <animate attributeName="cy" values="100;80;100" dur="3.5s" repeatCount="indefinite" />
      <animate attributeName="opacity" values="0.3;0.6;0.3" dur="3.5s" repeatCount="indefinite" />
    </circle>
    <circle cx="680" cy="480" r="5" fill="#3b82f6" opacity="0.2">
      <animate attributeName="cy" values="480;460;480" dur="5s" repeatCount="indefinite" />
      <animate attributeName="opacity" values="0.2;0.5;0.2" dur="5s" repeatCount="indefinite" />
    </circle>

    {/* Text */}
    <text x="400" y="540" fontFamily="Arial, sans-serif" fontSize="20" fontWeight="bold" fill="#94a3b8" textAnchor="middle" letterSpacing="6" opacity="0.6">
      ENERGY STORAGE
    </text>
  </svg>
);

export default function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const product = products.find(p => p.id === productId);
  const [imageError, setImageError] = useState(false);

  if (!product) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="min-h-screen flex items-center justify-center bg-white"
      >
        <div className="text-center max-w-md px-4">
          <Battery className="w-20 h-20 text-slate-300 mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Product Not Found</h1>
          <p className="text-slate-600 mb-8">The product you're looking for doesn't exist or has been removed.</p>
          <Link to="/products" className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-full font-semibold hover:bg-primary-700 transition-colors">
            Return to Products
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </motion.div>
    );
  }

  // Benefits data
  const benefits = [
    {
      icon: Zap,
      title: 'Peak Shaving',
      description: 'Discharge during peak tariff periods to drastically reduce demand charges and save up to 40% on energy costs.',
      color: 'from-amber-500 to-orange-500',
    },
    {
      icon: Settings,
      title: 'EMS Integration',
      description: 'Native integration with GoodEnough Energy\'s EMS for autonomous dispatch and real-time optimization.',
      color: 'from-blue-500 to-indigo-500',
    },
    {
      icon: Shield,
      title: 'Reliable Backup',
      description: 'Ensure critical loads remain powered during grid outages with seamless transition and zero downtime.',
      color: 'from-emerald-500 to-teal-500',
    },
    {
      icon: Gauge,
      title: 'Performance Monitoring',
      description: 'Real-time visibility into battery health, efficiency, and performance metrics with detailed analytics.',
      color: 'from-violet-500 to-purple-500',
    },
  ];

  const specifications = [
    { label: 'Capacity', value: product.capacity },
    { label: 'Power Rating', value: product.power },
    { label: 'Use Cases', value: product.useCases.join(', ') },
    { label: 'Integration', value: 'EMS Ready' },
  ];

  const productFaqs = productId === 'storedge-025' ? storedge025Faqs : storedge50Faqs;

  return (
    <div className="bg-white min-h-screen">
      {/* Hero Section with Product Image */}
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
            <Link to="/products" className="text-slate-400 hover:text-slate-600 transition-colors">Products</Link>
            <span className="text-slate-300">/</span>
            <span className="text-slate-900 font-medium">{product.name}</span>
          </motion.nav>

          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left - Product Info */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              {/* Badge */}
              {product.badge && (
                <div className="inline-flex items-center gap-2 bg-primary-50 px-4 py-2 rounded-full mb-6">
                  <Sparkles className="w-4 h-4 text-primary-600" />
                  <span className="text-xs font-semibold text-primary-700 uppercase tracking-wider">{product.badge}</span>
                </div>
              )}

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 mb-4">
                {product.name}
              </h1>

              <div className="flex items-center gap-4 mb-6">
                <span className="text-2xl font-bold text-primary-600 bg-primary-50 px-4 py-2 rounded-full">
                  {product.capacity}
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-xl text-slate-600 font-medium">
                  {product.power}
                </span>
              </div>

              <p className="text-lg text-slate-600 leading-relaxed mb-8">
                {product.description}
              </p>

              {/* Key Specs */}
              <div className="grid grid-cols-2 gap-4 mb-8">
                {specifications.map((spec, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm"
                  >
                    <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">{spec.label}</p>
                    <p className="text-sm font-medium text-slate-900 mt-1">{spec.value}</p>
                  </motion.div>
                ))}
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-wrap gap-4">
                <Link
                  to="/contact"
                  className="inline-flex items-center gap-2 px-8 py-4 bg-slate-900 hover:bg-primary-600 text-white font-semibold rounded-full transition-all duration-300 shadow-lg hover:shadow-xl"
                >
                  Request Quote
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
                <Link
                  to="#benefits"
                  className="inline-flex items-center gap-2 px-8 py-4 bg-white border-2 border-slate-200 hover:border-primary-600 text-slate-700 hover:text-primary-600 font-semibold rounded-full transition-all duration-300"
                >
                  Learn More
                </Link>
              </div>
            </motion.div>

            {/* Right - Product Image */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              <div className="relative bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
                {/* Product Image */}
                {!imageError ? (
                  <img
                    src={product.image}
                    alt={product.imageAlt || product.name}
                    className="w-full h-auto aspect-square object-contain p-8 transition-transform duration-700 hover:scale-105"
                    onError={() => setImageError(true)}
                    loading="lazy"
                  />
                ) : (
                  <ProductDetailBg className="w-full h-auto aspect-square" />
                )}

                {/* Floating Stats */}
                <div className="absolute bottom-6 left-6 right-6 grid grid-cols-3 gap-3">
                  <div className="bg-white/90 backdrop-blur-sm rounded-xl p-3 text-center shadow-lg border border-white/50">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">Capacity</p>
                    <p className="text-sm font-bold text-slate-900">{product.capacity}</p>
                  </div>
                  <div className="bg-white/90 backdrop-blur-sm rounded-xl p-3 text-center shadow-lg border border-white/50">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">Power</p>
                    <p className="text-sm font-bold text-slate-900">{product.power}</p>
                  </div>
                  <div className="bg-white/90 backdrop-blur-sm rounded-xl p-3 text-center shadow-lg border border-white/50">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">Status</p>
                    <p className="text-sm font-bold text-emerald-600 flex items-center justify-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                      Available
                    </p>
                  </div>
                </div>
              </div>

              {/* Decorative Elements */}
              <div className="absolute -top-6 -right-6 w-24 h-24 bg-primary-100/30 rounded-full blur-2xl" />
              <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-blue-100/30 rounded-full blur-2xl" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Applications & Benefits */}
      <section id="benefits" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center max-w-3xl mx-auto mb-16"
          >
            <div className="inline-flex items-center gap-2 bg-primary-50 px-4 py-2 rounded-full mb-6">
              <Sparkles className="w-4 h-4 text-primary-600" />
              <span className="text-xs font-semibold text-primary-700 uppercase tracking-wider">Key Benefits</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Why Choose <span className="bg-gradient-to-r from-primary-600 to-blue-600 bg-clip-text text-transparent">{product.name}</span>
            </h2>
            <p className="text-lg text-slate-600">
              Engineered for intelligent energy optimization and reliability across all use cases.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {benefits.map((benefit, index) => {
              const Icon = benefit.icon;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ y: -8 }}
                  className="group bg-white rounded-2xl p-8 border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-300"
                >
                  <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${benefit.color} text-white shadow-lg mb-4 transition-transform group-hover:scale-110`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{benefit.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{benefit.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl font-bold text-slate-900 tracking-tight mb-6">
                Perfect for{' '}
                <span className="bg-gradient-to-r from-primary-600 to-blue-600 bg-clip-text text-transparent">
                  Your Application
                </span>
              </h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                The {product.name} is designed to excel across multiple use cases, providing flexibility and performance for any energy strategy.
              </p>
              <div className="flex flex-wrap gap-3">
                {product.useCases.map((useCase, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-full text-sm font-medium shadow-sm hover:border-primary-300 hover:text-primary-700 transition-all duration-300"
                  >
                    <CheckCircle className="w-4 h-4 text-primary-500" />
                    {useCase}
                  </motion.span>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-white rounded-3xl p-8 border border-slate-100 shadow-lg"
            >
              <EnergyFlow />
            </motion.div>
          </div>
        </div>
      </section>

      {/* EMS Integration Section */}
      <section className="py-24 bg-white border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto text-center"
          >
            <div className="inline-flex items-center gap-2 bg-primary-50 px-4 py-2 rounded-full mb-6">
              <Sparkles className="w-4 h-4 text-primary-600" />
              <span className="text-xs font-semibold text-primary-700 uppercase tracking-wider">Intelligent Control</span>
            </div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight mb-6">
              Powered by{' '}
              <span className="bg-gradient-to-r from-primary-600 to-blue-600 bg-clip-text text-transparent">
                Intelligent EMS
              </span>
            </h2>
            <p className="text-lg text-slate-600 mb-8 leading-relaxed">
              The {product.name} is not just a battery; it's a critical node in your intelligent energy network.
              Controlled by our EMS, it charges when energy is cheap or abundant, and discharges when it's most valuable.
            </p>
            <Link
              to="/ems"
              className="inline-flex items-center gap-3 px-8 py-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-full transition-all duration-300 shadow-lg hover:shadow-xl"
            >
              Learn More About EMS
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* FAQ Section */}
      <FAQSection items={productFaqs} />

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
              Ready to Optimize Your Site?
            </h2>
            <p className="text-xl text-slate-300 mb-10 leading-relaxed">
              Get in touch with our engineering team to discuss how the {product.name} fits your energy strategy.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                to="/contact"
                className="px-8 py-4 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 text-lg"
              >
                Contact Sales
              </Link>
              <Link
                to="/products"
                className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-full border border-white/20 hover:border-white/30 transition-all duration-300 text-lg backdrop-blur-sm"
              >
                View All Products
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}