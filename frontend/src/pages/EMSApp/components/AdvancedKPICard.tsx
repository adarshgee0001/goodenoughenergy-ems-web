import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface AdvancedKPICardProps {
  title: string;
  /**
   * The numeric value (used for internal logic if needed). Optional.
   * For display, pass `displayValue`.
   */
  value?: string | number;
  /**
   * The string to render in the card. Defaults to String(value).
   * Pass '--' when no real data is available.
   */
  displayValue?: string;
  unit?: string;
  icon: ReactNode;
  delay?: number;
  statusColor?: 'slate' | 'emerald' | 'amber' | 'blue';
  /** Optional small subtitle shown below the value */
  subtitle?: string;
}

export const AdvancedKPICard = ({
  title,
  value,
  displayValue,
  unit,
  icon,
  delay = 0,
  statusColor = 'slate',
  subtitle,
}: AdvancedKPICardProps) => {
  const bgColors = {
    slate: 'bg-slate-100 text-slate-500',
    emerald: 'bg-emerald-100 text-emerald-600',
    amber: 'bg-amber-100 text-amber-600',
    blue: 'bg-blue-100 text-blue-600',
  };

  const rendered = displayValue !== undefined ? displayValue : value !== undefined ? String(value) : '--';
  const hasData = value !== undefined && value !== null && rendered !== '--';

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 hover:shadow-md transition-shadow relative overflow-hidden group"
    >
      {/* Subtle hover gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-white to-slate-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

      <div className="flex items-center justify-between mb-4 relative z-10">
        <h3 className="text-sm font-medium text-slate-500">{title}</h3>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${bgColors[statusColor]}`}>
          {icon}
        </div>
      </div>

      <div className="flex items-baseline gap-1 relative z-10">
        <span className={`text-3xl font-bold tracking-tight ${hasData ? 'text-slate-900' : 'text-slate-300'}`}>
          {rendered}
        </span>
        {unit && hasData && <span className="text-sm font-medium text-slate-500">{unit}</span>}
      </div>

      {subtitle && (
        <p className="text-xs text-slate-400 mt-1.5 relative z-10">{subtitle}</p>
      )}
    </motion.div>
  );
};
