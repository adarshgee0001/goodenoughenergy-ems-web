
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import bgPlaceholder from '../../../assets/images/hero/wide view (GEE).png';

export function Hero() {
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: {
      opacity: 0,
      y: 24,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
        ease: 'easeOut',
      },
    },
  };

  return (
    // <section className="relative flex min-h-[85vh] w-full items-center overflow-hidden bg-slate-900 py-24 text-white lg:min-h-[88vh] lg:py-32">
    <section className="relative flex min-h-[68vh] w-full items-center overflow-hidden bg-slate-900 py-20 text-white lg:min-h-[72vh] lg:py-24">
      {/* Background Image */}

      <div className="absolute inset-0 z-0">
        <img
          src={bgPlaceholder}
          alt="GoodEnough Energy infrastructure"
          className="h-full w-full object-cover"
        />
      </div>

      {/* Main Dark Overlay */}
      <div className="absolute inset-0 z-[1] bg-slate-900/55" />

      {/* Bottom Gradient */}
      <div className="absolute inset-0 z-[2] bg-gradient-to-t from-slate-950 via-slate-900/25 to-slate-900/20" />

      {/* Subtle Side Gradient for Text Contrast */}
      <div className="absolute inset-0 z-[2] bg-gradient-to-r from-slate-950/75 via-slate-900/20 to-transparent" />

      {/* Hero Content */}
      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="mx-auto max-w-5xl text-center"
        >
          {/* Small Label */}
          <motion.div variants={itemVariants} className="mb-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold tracking-wide text-slate-100 backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-primary-400 shadow-[0_0_10px_rgba(191,215,48,0.8)]" />
              Intelligent Energy Management
            </span>
          </motion.div>

          {/* Main Heading */}
          <motion.h1
            variants={itemVariants}
            className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl"
          >
            Intelligent Energy.
            <span className="mt-2 block text-primary-400">
              Optimized Automatically.
            </span>
          </motion.h1>

          {/* Description */}
          <motion.p
            variants={itemVariants}
            className="mx-auto mt-8 max-w-3xl text-base leading-relaxed text-slate-200 sm:text-lg lg:text-xl"
          >
            GoodEnough Energy's EMS intelligently manages solar, battery
            storage, grid power, and loads to optimize energy consumption,
            improve operational efficiency, and reduce energy costs.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            variants={itemVariants}
            className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Link
              to="/ems"
              className="group w-full rounded-full bg-primary-500 px-8 py-4 text-center text-base font-bold text-slate-900 shadow-lg shadow-primary-500/20 transition-all duration-300 hover:-translate-y-1 hover:bg-primary-400 hover:shadow-xl hover:shadow-primary-500/30 sm:w-auto sm:min-w-[170px]"
            >
              <span className="flex items-center justify-center gap-2">
                Explore EMS
                <span className="transition-transform duration-300 group-hover:translate-x-1">
                  →
                </span>
              </span>
            </Link>

            <Link
              to="/products"
              className="group w-full rounded-full border border-white/40 bg-white/10 px-8 py-4 text-center text-base font-semibold text-white backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-white/60 hover:bg-white/15 sm:w-auto sm:min-w-[190px]"
            >
              <span className="flex items-center justify-center gap-2">
                Explore StorEDGE
                <span className="transition-transform duration-300 group-hover:translate-x-1">
                  →
                </span>
              </span>
            </Link>
          </motion.div>

          {/* Supporting Message */}
          <motion.div
            variants={itemVariants}
            className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-slate-300"
          >
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-400" />
              Solar Integration
            </span>

            <span className="hidden h-4 w-px bg-white/20 sm:block" />

            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-400" />
              Battery Storage
            </span>

            <span className="hidden h-4 w-px bg-white/20 sm:block" />

            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-400" />
              Grid Optimization
            </span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}