import { motion, useInView } from 'framer-motion';
import { useRef, useState } from 'react';
import {
  Zap,
  TrendingDown,
  Settings,
  Battery,
  Sun,
  Network,
  DollarSign,
  Activity,
  ArrowUpRight,
  Sparkles,
  Gauge,
  Shield,
  Cpu,
} from 'lucide-react';

export function Capabilities() {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.1 });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const capabilities = [
    {
      title: 'Energy Optimization',
      desc: 'Holistic management of all energy sources to maximize efficiency.',
      icon: Zap,
      gradient: 'from-amber-500 to-orange-500',
      metric: '98.7% Efficiency',
      tag: 'Core',
    },
    {
      title: 'Peak Shaving',
      desc: 'Automatically reduce grid demand during expensive peak tariff periods.',
      icon: TrendingDown,
      gradient: 'from-blue-500 to-indigo-500',
      metric: '40% Peak Reduction',
      tag: 'Savings',
    },
    {
      title: 'Load Management',
      desc: 'Intelligently balance and control critical site loads in real-time.',
      icon: Settings,
      gradient: 'from-emerald-500 to-teal-500',
      metric: 'Real-time Control',
      tag: 'Smart',
    },
    {
      title: 'Battery Optimization',
      desc: 'Extend lifespan and maximize ROI with advanced BESS management.',
      icon: Battery,
      gradient: 'from-violet-500 to-purple-500',
      metric: '2x Battery Life',
      tag: 'ROI',
    },
    {
      title: 'Solar Integration',
      desc: 'Seamlessly incorporate PV generation without grid instability.',
      icon: Sun,
      gradient: 'from-yellow-500 to-amber-500',
      metric: '100% Renewable',
      tag: 'Green',
    },
    {
      title: 'Grid Management',
      desc: 'Ensure smooth export and import in compliance with utility limits.',
      icon: Network,
      gradient: 'from-cyan-500 to-blue-500',
      metric: '99.9% Uptime',
      tag: 'Reliable',
    },
    {
      title: 'Cost Optimization',
      desc: 'Leverage time-of-use tariffs for intelligent energy arbitrage.',
      icon: DollarSign,
      gradient: 'from-green-500 to-emerald-500',
      metric: '35% Cost Saving',
      tag: 'Economy',
    },
    {
      title: 'Real-Time Monitoring',
      desc: 'Granular visibility into every asset on your energy network.',
      icon: Activity,
      gradient: 'from-rose-500 to-pink-500',
      metric: '<100ms Response',
      tag: 'Live',
    },
  ];

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30, scale: 0.95 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.6,
        ease: [0.22, 1, 0.36, 1] as const,
      },
    },
  };

  // Floating particles for background
  const particles = [
    { icon: Sparkles, x: '10%', y: '20%', size: 24, delay: 0 },
    { icon: Gauge, x: '85%', y: '15%', size: 20, delay: 1 },
    { icon: Shield, x: '5%', y: '70%', size: 28, delay: 2 },
    { icon: Cpu, x: '90%', y: '80%', size: 22, delay: 3 },
  ];

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50 py-24 sm:py-28 lg:py-32"
    >
      {/* Animated Background Elements */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-32 -top-32 h-[600px] w-[600px] rounded-full bg-primary-100/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-[500px] w-[500px] rounded-full bg-blue-100/20 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-100/10 blur-3xl" />

        {/* Floating Particles */}
        {particles.map((particle, index) => {
          const Icon = particle.icon;
          return (
            <motion.div
              key={index}
              className="absolute hidden text-primary-200/30 lg:block"
              style={{ left: particle.x, top: particle.y }}
              animate={{
                y: [0, -20, 0],
                x: [0, 15, 0],
                rotate: [0, 180, 360],
              }}
              transition={{
                duration: 8,
                delay: particle.delay,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            >
              <Icon size={particle.size} />
            </motion.div>
          );
        })}
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center lg:mb-20"
        >
          {/* <div className="mb-6 inline-flex items-center gap-3 rounded-full bg-primary-50 px-4 py-2">
            <Sparkles className="h-4 w-4 text-primary-600" />
            <span className="text-xs font-semibold uppercase tracking-wider text-primary-700">
              Our Capabilities
            </span>
          </div> */}

          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
            Comprehensive Energy
            <span className="block bg-gradient-to-r from-primary-600 to-blue-600 bg-clip-text text-transparent">
              Management Capabilities
            </span>
          </h2>

          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Everything you need to optimize, monitor, and control your energy ecosystem
            with intelligent automation.
          </p>
        </motion.div>

        {/* Capabilities Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
        >
          {capabilities.map((cap, index) => {
            const Icon = cap.icon;
            const isHovered = hoveredIndex === index;

            return (
              <motion.div
                key={index}
                variants={itemVariants}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                whileHover={{
                  y: -8,
                  transition: { duration: 0.3 }
                }}
                className="group relative rounded-2xl bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-xl hover:shadow-slate-200/50"
              >
                {/* Background Gradient Effect */}
                <div
                  className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${cap.gradient} opacity-0 transition-opacity duration-500 group-hover:opacity-5`}
                />

                {/* Glow Effect on Hover */}
                <div
                  className={`absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
                  style={{
                    boxShadow: `inset 0 0 60px -15px var(--tw-gradient-from)`,
                    background: `radial-gradient(circle at 30% 30%, var(--tw-gradient-from), transparent 70%)`,
                  }}
                />

                <div className="relative">
                  {/* Icon with Gradient */}
                  <div className={`mb-4 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${cap.gradient} p-3 text-white shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:shadow-xl`}>
                    <Icon className="h-7 w-7" strokeWidth={1.5} />
                  </div>

                  {/* Tag Badge */}
                  <div className="absolute right-4 top-4">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 transition-all duration-300 group-hover:bg-primary-100 group-hover:text-primary-700">
                      {cap.tag}
                    </span>
                  </div>

                  {/* Content */}
                  <h3 className="mb-2 text-lg font-bold text-slate-900 group-hover:text-primary-700 transition-colors">
                    {cap.title}
                  </h3>

                  <p className="text-sm leading-relaxed text-slate-600">
                    {cap.desc}
                  </p>

                  {/* Metric Badge */}
                  <div className="mt-4 flex items-center justify-between">
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 transition-all duration-300 group-hover:bg-primary-50 group-hover:text-primary-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
                      {cap.metric}
                    </div>

                    <ArrowUpRight
                      className={`h-4 w-4 text-slate-300 transition-all duration-300 ${isHovered ? 'translate-x-1 -translate-y-1 text-primary-600' : ''
                        }`}
                    />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Bottom Stats Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {[
            { label: 'Energy Optimized', value: '2.4M+', unit: 'kWh' },
            { label: 'Carbon Saved', value: '1.2M', unit: 'kg' },
            { label: 'Cost Reduction', value: '35%', unit: 'avg' },
            { label: 'Uptime', value: '99.9', unit: '%' },
          ].map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={isInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.5, delay: 0.7 + index * 0.1 }}
              whileHover={{ scale: 1.05 }}
              className="rounded-2xl bg-white p-6 text-center shadow-sm transition-all duration-300 hover:shadow-md hover:shadow-primary-100/50"
            >
              <div className="text-2xl font-bold text-slate-900">
                {stat.value}
                <span className="text-sm font-normal text-slate-500"> {stat.unit}</span>
              </div>
              <div className="mt-1 text-xs font-medium text-slate-500">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}