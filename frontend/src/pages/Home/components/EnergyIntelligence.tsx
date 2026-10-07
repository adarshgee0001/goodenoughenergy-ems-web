import { motion } from 'framer-motion';
import { useRef } from 'react';
import {
  Sun,
  BatteryCharging,
  Zap,
  TrendingUp,
  ShieldCheck,
  ArrowUpRight,
  Sparkles,
  Cpu,
  Gauge,
  Clock,
} from 'lucide-react';

// Enhanced decision data with metrics
const decisions = [
  {
    icon: Sun,
    title: 'Solar First',
    description: 'Prioritize available renewable energy before drawing from the grid.',
    metric: 'Up to 40% savings',
    badge: 'Optimized',
    gradient: 'from-amber-500 to-orange-500',
  },
  {
    icon: BatteryCharging,
    title: 'Smart Battery',
    description: 'Intelligent charge/discharge based on demand patterns and price signals.',
    metric: '2x Battery Life',
    badge: 'Intelligent',
    gradient: 'from-emerald-500 to-teal-500',
  },
  {
    icon: Zap,
    title: 'Grid Optimization',
    description: 'Reduce grid dependency and manage peak demand with predictive algorithms.',
    metric: '30% Peak Reduction',
    badge: 'Predictive',
    gradient: 'from-blue-500 to-indigo-500',
  },
  {
    icon: TrendingUp,
    title: 'Energy Optimization',
    description: 'Real-time balancing of generation, storage, and consumption.',
    metric: '99.9% Uptime',
    badge: 'Autonomous',
    gradient: 'from-violet-500 to-purple-500',
  },
];

const metrics = [
  { label: 'Response Time', value: '< 100ms', icon: Gauge },
  { label: 'Predictive Accuracy', value: '98.7%', icon: Sparkles },
  { label: 'Decision Points', value: '50+/sec', icon: Cpu },
  { label: 'Real-time Updates', value: 'Instant', icon: Clock },
];

export function EnergyIntelligence() {
  const sectionRef = useRef(null);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: [0.22, 1, 0.36, 1] as const,
      },
    },
  };

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50/50 py-24 sm:py-32"
    >
      {/* Animated Background Elements */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-20 -top-20 h-[600px] w-[600px] rounded-full bg-primary-100/20 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-[500px] w-[500px] rounded-full bg-blue-100/20 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-100/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={containerVariants}
          className="mb-20 text-center lg:mb-24"
        >


          <motion.h2 variants={itemVariants} className="mx-auto max-w-4xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Intelligent Energy Decisions
            <span className="block bg-gradient-to-r from-primary-600 to-blue-600 bg-clip-text text-transparent">
              in Real-Time
            </span>
          </motion.h2>

          <motion.p variants={itemVariants} className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            Our EMS continuously monitors and optimizes your energy ecosystem, making
            autonomous decisions across solar, battery, grid, and loads.
          </motion.p>
        </motion.div>

        {/* Main Grid */}
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 xl:gap-20">
          {/* Left - Decision Cards */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={containerVariants}
            className="space-y-4"
          >
            {decisions.map((decision) => {
              const Icon = decision.icon;

              return (
                <motion.div
                  key={decision.title}
                  variants={itemVariants}
                  whileHover={{ scale: 1.02, x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  className="group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-xl hover:shadow-slate-200/50"
                >
                  {/* Gradient Accent */}
                  <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${decision.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-5`} />

                  <div className="relative flex items-start gap-5">
                    {/* Icon Container with Gradient */}
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${decision.gradient} p-2.5 text-white shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:shadow-xl`}>
                      <Icon className="h-6 w-6" strokeWidth={1.5} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-bold text-slate-900">
                          {decision.title}
                        </h3>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700">
                            {decision.badge}
                          </span>
                          <ArrowUpRight className="h-4 w-4 text-slate-300 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary-600" />
                        </div>
                      </div>

                      <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                        {decision.description}
                      </p>

                      {/* Metric Badge */}
                      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
                        {decision.metric}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Right - Visualization & Metrics */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] as const }}
            className="flex flex-col gap-6"
          >
            {/* Energy Flow Visualization */}
            <div className="relative rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-8 shadow-sm">
              <div className="mb-6 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-700">Live Energy Flow</h4>
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-500" />
                  </span>
                  <span className="text-xs text-slate-500">Active</span>
                </div>
              </div>

              {/* Interactive Energy Flow Representation */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Solar', value: 65, color: 'from-amber-400 to-orange-400' },
                  { label: 'Battery', value: 80, color: 'from-emerald-400 to-teal-400' },
                  { label: 'Grid', value: 25, color: 'from-blue-400 to-indigo-400' },
                  { label: 'Load', value: 45, color: 'from-violet-400 to-purple-400' },
                ].map((item) => (
                  <div key={item.label} className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-600">{item.label}</span>
                      <span className="font-semibold text-slate-900">{item.value}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <motion.div
                        initial={{ width: 0 }}
                        whileInView={{ width: `${item.value}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 1.2, delay: 0.3 }}
                        className={`h-full rounded-full bg-gradient-to-r ${item.color}`}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-center gap-6 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Optimizing
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Monitoring
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  Balancing
                </span>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-3">
              {metrics.map((metric, index) => {
                const Icon = metric.icon;

                return (
                  <motion.div
                    key={metric.label}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
                    whileHover={{ scale: 1.03 }}
                    className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm transition-all duration-300 hover:shadow-md"
                  >
                    <Icon className="mx-auto h-5 w-5 text-primary-600" />
                    <div className="mt-2 text-lg font-bold text-slate-900">{metric.value}</div>
                    <div className="text-xs text-slate-500">{metric.label}</div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </div>

        {/* Bottom CTA Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-20 rounded-3xl bg-gradient-to-r from-primary-600 to-blue-600 p-8 shadow-xl shadow-primary-600/20 sm:p-10"
        >
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="text-center sm:text-left">
              <div className="flex items-center justify-center gap-3 sm:justify-start">
                <ShieldCheck className="h-6 w-6 text-white/80" />
                <h4 className="text-lg font-semibold text-white">
                  Autonomous Energy Decisions
                </h4>
              </div>
              <p className="mt-1.5 text-sm text-white/80">
                One intelligent layer coordinating your complete energy ecosystem.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-medium uppercase tracking-wider text-white/70">
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
                Solar
              </span>
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
                Battery
              </span>
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
                Grid
              </span>
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
                Load
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}