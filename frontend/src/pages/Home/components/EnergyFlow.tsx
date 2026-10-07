
import { motion } from 'framer-motion';
import {
  Activity,
  BatteryCharging,
  BrainCircuit,
  Gauge,
  ShieldCheck,
  Sun,
  Zap,
} from 'lucide-react';

const metrics = [
  {
    label: 'Solar Generation',
    value: '74.6',
    unit: 'kW',
    icon: Sun,
    iconClass: 'bg-amber-100 text-amber-600',
    progress: 74,
  },
  {
    label: 'Battery State',
    value: '78',
    unit: '% SOC',
    icon: BatteryCharging,
    iconClass: 'bg-primary-100 text-primary-700',
    progress: 78,
  },
  {
    label: 'Grid Dependency',
    value: '22.4',
    unit: '%',
    icon: Zap,
    iconClass: 'bg-slate-100 text-slate-600',
    progress: 22,
  },
];

const decisions = [
  'Prioritizing available solar generation',
  'Maintaining battery reserve',
  'Reducing unnecessary grid demand',
];

export function EnergyFlow() {
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
        {/* Background */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                'linear-gradient(rgba(65,65,65,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(65,65,65,0.035) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />

          <motion.div
            className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary-400/10 blur-3xl"
            animate={{
              scale: [1, 1.15, 1],
              opacity: [0.35, 0.55, 0.35],
            }}
            transition={{
              duration: 5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        </div>

        {/* Header */}
        <div className="relative z-10 flex items-center justify-between border-b border-slate-100 px-6 py-5 sm:px-7">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
              <BrainCircuit size={20} strokeWidth={1.8} />
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                EMS Intelligence
              </p>

              <p className="mt-0.5 text-sm font-semibold text-slate-800">
                Real-time energy decisions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5">
            <motion.span
              className="h-1.5 w-1.5 rounded-full bg-primary-500"
              animate={{
                opacity: [0.4, 1, 0.4],
                scale: [1, 1.25, 1],
              }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />

            <span className="text-[9px] font-bold uppercase tracking-wider text-primary-800">
              Active
            </span>
          </div>
        </div>

        {/* Main Intelligence Panel */}
        <div className="relative z-10 p-5 sm:p-7">
          <div className="grid gap-4 sm:grid-cols-3">
            {metrics.map((metric, index) => {
              const Icon = metric.icon;

              return (
                <motion.div
                  key={metric.label}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{
                    duration: 0.5,
                    delay: index * 0.1,
                  }}
                  whileHover={{ y: -3 }}
                  className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-xl ${metric.iconClass}`}
                    >
                      <Icon size={17} strokeWidth={1.8} />
                    </div>

                    <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                      Live
                    </span>
                  </div>

                  <p className="mt-4 text-[10px] font-medium text-slate-500">
                    {metric.label}
                  </p>

                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-xl font-bold tabular-nums text-slate-900">
                      {metric.value}
                    </span>

                    <span className="text-[10px] font-medium text-slate-400">
                      {metric.unit}
                    </span>
                  </div>

                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <motion.div
                      className="h-full rounded-full bg-primary-500"
                      initial={{ width: 0 }}
                      whileInView={{
                        width: `${metric.progress}%`,
                      }}
                      viewport={{ once: true }}
                      transition={{
                        duration: 1,
                        delay: 0.2 + index * 0.1,
                        ease: 'easeOut',
                      }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Decision Engine */}
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-900 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-400/10 text-primary-300">
                  <Gauge size={20} strokeWidth={1.8} />
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    Decision Engine
                  </p>

                  <p className="mt-1 text-sm font-semibold text-white">
                    Optimizing site operation
                  </p>
                </div>
              </div>

              <Activity
                size={18}
                className="text-primary-400"
                strokeWidth={1.8}
              />
            </div>

            <div className="mt-5 space-y-3">
              {decisions.map((decision, index) => (
                <motion.div
                  key={decision}
                  initial={{ opacity: 0, x: -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{
                    duration: 0.4,
                    delay: 0.25 + index * 0.12,
                  }}
                  className="flex items-center gap-3"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-400/10">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary-400" />
                  </div>

                  <span className="text-xs text-slate-300">
                    {decision}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>

          {/* System Status */}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <ShieldCheck
                size={17}
                className="text-primary-600"
                strokeWidth={1.8}
              />

              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  System
                </p>
                <p className="text-xs font-semibold text-slate-700">
                  Stable
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <Activity
                size={17}
                className="text-primary-600"
                strokeWidth={1.8}
              />

              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Control
                </p>
                <p className="text-xs font-semibold text-slate-700">
                  Autonomous
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-6 py-3.5">
          <span className="text-[9px] font-medium text-slate-400">
            EMS continuously evaluates site conditions
          </span>

          <span className="text-[9px] font-bold text-primary-700">
            Optimizing
          </span>
        </div>
      </div>
    </div>
  );
}
