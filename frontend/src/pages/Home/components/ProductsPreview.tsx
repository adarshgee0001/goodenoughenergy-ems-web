import { Link } from 'react-router-dom';
import { products } from '../../../data/products';
import { Battery, ArrowUpRight, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { motion } from 'framer-motion';

export function ProductsPreview() {
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const handleImageError = (productId: string) => {
    setImageErrors(prev => ({ ...prev, [productId]: true }));
  };

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: [0.22, 1, 0.36, 1] as const,
      },
    },
  };

  // Color mapping for different products
  const productColors: Record<string, { bg: string; gradient: string; icon: string }> = {
    'StorEDGE 0.25': {
      bg: 'from-amber-50 to-orange-50',
      gradient: 'from-amber-500 to-orange-500',
      icon: 'text-amber-600',
    },
    'StorEDGE 5.0': {
      bg: 'from-blue-50 to-indigo-50',
      gradient: 'from-blue-500 to-indigo-500',
      icon: 'text-blue-600',
    },
  };

  return (
    <section className="py-24 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 max-w-3xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 bg-primary-50 px-4 py-2 rounded-full mb-6">
            <Sparkles className="w-4 h-4 text-primary-600" />
            <span className="text-xs font-semibold text-primary-700 uppercase tracking-wider">
              Our Products
            </span>
          </div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight sm:text-4xl mb-6">
            Battery Storage Built for{' '}
            <span className="bg-gradient-to-r from-primary-600 to-blue-600 bg-clip-text text-transparent">
              Intelligent Energy
            </span>
          </h2>
          <p className="text-lg text-slate-600">
            Discover our high-performance StorEDGE BESS units, perfectly integrated with our advanced EMS for maximum efficiency.
          </p>
        </motion.div>

        {/* Products Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          className="grid md:grid-cols-2 gap-8"
        >
          {products.map((product) => {
            const hasError = imageErrors[product.id];
            const colors = productColors[product.name] || {
              bg: 'from-slate-50 to-slate-100',
              gradient: 'from-slate-500 to-slate-600',
              icon: 'text-slate-600',
            };

            return (
              <motion.div
                key={product.id}
                variants={itemVariants}
                className="bg-white rounded-3xl overflow-hidden border border-slate-100 flex flex-col group hover:shadow-2xl transition-all duration-500 hover:-translate-y-2"
              >
                {/* Image Container */}
                <div className={`relative h-80 bg-gradient-to-br ${colors.bg} flex items-center justify-center overflow-hidden`}>

                  {/* Decorative Background Elements */}
                  <div className="absolute inset-0 opacity-20">
                    <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-white/50 blur-3xl" />
                    <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full bg-white/50 blur-3xl" />
                  </div>

                  {/* Grid Pattern */}
                  <div
                    className="absolute inset-0 opacity-10"
                    style={{
                      backgroundImage: `radial-gradient(circle at 20px 20px, rgba(0,0,0,0.1) 1px, transparent 1px)`,
                      backgroundSize: '40px 40px',
                    }}
                  />

                  {/* Product Badge */}
                  {product.badge && (
                    <div className="absolute top-4 right-4 z-10">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-primary-600 to-blue-600 text-white text-xs font-semibold rounded-full shadow-lg">
                        <Sparkles className="w-3 h-3" />
                        {product.badge}
                      </span>
                    </div>
                  )}

                  {/* Product Image */}
                  {!hasError ? (
                    <img
                      src={product.image}
                      alt={product.imageAlt || product.name}
                      className="w-full h-full object-contain p-8 transition-transform duration-700 group-hover:scale-110 group-hover:rotate-2"
                      onError={() => handleImageError(product.id)}
                      loading="lazy"
                    />
                  ) : (
                    /* Elegant Fallback */
                    <div className="flex flex-col items-center justify-center p-8">
                      <div className={`w-32 h-32 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center mb-4 shadow-lg border border-white/50 ${colors.icon}`}>
                        <Battery className="w-20 h-20" strokeWidth={1.5} />
                      </div>
                      <span className="text-slate-400 font-medium tracking-widest uppercase text-sm">
                        {product.name}
                      </span>
                      <div className="mt-3 flex items-center gap-3">
                        <span className="px-3 py-1.5 bg-white/80 backdrop-blur-sm rounded-full text-xs font-medium text-slate-600 border border-slate-100">
                          {product.capacity}
                        </span>
                        <span className="px-3 py-1.5 bg-white/80 backdrop-blur-sm rounded-full text-xs font-medium text-slate-600 border border-slate-100">
                          {product.power}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Hover Overlay Effects */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-r from-primary-500/5 via-transparent to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

                  {/* Floating Animation Elements */}
                  <div className="absolute bottom-4 left-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                    <span className="px-2 py-1 bg-white/80 backdrop-blur-sm rounded-full text-[10px] font-medium text-slate-600">
                      🔋 BESS
                    </span>
                    <span className="px-2 py-1 bg-white/80 backdrop-blur-sm rounded-full text-[10px] font-medium text-slate-600">
                      ⚡ EMS Ready
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-8 flex-grow flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-2xl font-bold text-slate-900 group-hover:text-primary-700 transition-colors duration-300">
                        {product.name}
                      </h3>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-sm font-semibold text-primary-600 bg-primary-50 px-3 py-1 rounded-full">
                          {product.capacity}
                        </span>
                        <span className="text-slate-300">|</span>
                        <span className="text-sm text-slate-500 font-medium">
                          {product.power}
                        </span>
                      </div>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-primary-50 transition-colors duration-300">
                      <ArrowUpRight className="w-5 h-5 text-slate-400 group-hover:text-primary-600 group-hover:translate-x-1 group-hover:-translate-y-1 transition-all duration-300" />
                    </div>
                  </div>

                  <p className="text-slate-600 mb-6 flex-grow leading-relaxed">
                    {product.description}
                  </p>

                  {/* Use Cases */}
                  <div className="flex flex-wrap gap-2 mb-8">
                    {product.useCases.slice(0, 3).map((useCase, i) => (
                      <span
                        key={i}
                        className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 text-xs rounded-full font-medium hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700 transition-all duration-300 cursor-default"
                      >
                        {useCase}
                      </span>
                    ))}
                    {product.useCases.length > 3 && (
                      <span className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 text-xs rounded-full font-medium">
                        +{product.useCases.length - 3} more
                      </span>
                    )}
                  </div>

                  {/* CTA Button */}
                  <Link
                    to={product.route}
                    className="group/btn relative inline-flex justify-center items-center px-6 py-3.5 text-sm font-semibold rounded-full text-white bg-slate-900 hover:bg-primary-600 transition-all duration-300 w-full overflow-hidden"
                  >
                    <span className="relative z-10 flex items-center">
                      View Specifications
                      <ArrowUpRight className="w-4 h-4 ml-2 group-hover/btn:translate-x-1 group-hover/btn:-translate-y-1 transition-transform duration-300" />
                    </span>
                    {/* Shine Effect */}
                    <div className="absolute inset-0 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-16 text-center"
        >
          <Link
            to="/products"
            className="inline-flex items-center gap-2 text-primary-600 font-semibold hover:gap-3 transition-all duration-300 group"
          >
            View All Products
            <ArrowUpRight className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform duration-300" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}