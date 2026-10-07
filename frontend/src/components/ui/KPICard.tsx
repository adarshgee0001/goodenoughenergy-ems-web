import { motion } from 'framer-motion';

interface KPICardProps {
  title: string;
  value: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  icon?: React.ReactNode;
}

export function KPICard({ title, value, icon }: KPICardProps) {
  // Simple heuristic to extract percentage if it exists for the decorative meter
  const hasPercentage = value.includes('%');
  const percentageValue = hasPercentage ? parseInt(value.replace(/\D/g, '')) || 70 : 100;
  
  // Use a pseudo-random looking width based on title length for non-percentage metrics
  const decorativeWidth = hasPercentage ? `${percentageValue}%` : `${60 + (title.length % 40)}%`;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="group relative bg-white p-6 rounded-2xl border border-slate-200 hover:border-primary-300 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between overflow-hidden"
    >
      {/* Background subtle gradient on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary-50/0 to-primary-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      {/* Top row */}
      <div className="relative flex justify-between items-center mb-6">
        <div className="flex items-center gap-2.5">
          {icon && (
            <div className="text-slate-400 group-hover:text-primary-600 transition-colors duration-300">
              {icon}
            </div>
          )}
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{title}</h3>
        </div>
        
        {/* LIVE indicator */}
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500"></span>
          </span>
          <span className="text-[10px] font-bold text-slate-400 tracking-wider">LIVE</span>
        </div>
      </div>

      {/* Main value */}
      <div className="relative">
        <p className="text-4xl font-extrabold text-slate-900 tracking-tight tabular-nums">
          {value}
        </p>
      </div>

      {/* Visual Indicator (Subtle Meter) */}
      <div className="relative mt-6">
        <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            whileInView={{ width: decorativeWidth }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            className="h-full bg-gradient-to-r from-slate-300 via-primary-400 to-primary-500 rounded-full origin-left"
          />
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-[10px] text-slate-400 font-medium tracking-wide">Current telemetry</span>
          <span className="text-[10px] text-slate-400 font-medium tracking-wide opacity-0 group-hover:opacity-100 transition-opacity duration-300">System optimal</span>
        </div>
      </div>
    </motion.div>
  );
}
