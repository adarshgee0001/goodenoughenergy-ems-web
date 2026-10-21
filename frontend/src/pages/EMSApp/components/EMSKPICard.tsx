import type { ReactNode } from 'react';

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: ReactNode;
  trend?: {
    value: string;
    isPositive: boolean;
  };
}

export function KPICard({ title, value, subtitle, icon, trend }: KPICardProps) {
  const isLongValue = typeof value === 'string' && value.length > 16;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 min-w-0 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-500 truncate" title={title}>{title}</h3>
        <div className="p-2 bg-primary-50 rounded-lg text-primary-600 shrink-0">
          {icon}
        </div>
      </div>
      <div className="min-w-0">
        <p
          className={`${isLongValue ? 'text-lg sm:text-xl' : 'text-2xl'} font-bold text-slate-900 break-words [overflow-wrap:anywhere] [word-break:break-word] tracking-tight`}
          title={typeof value === 'string' ? value : undefined}
        >
          {value}
        </p>
        <div className="flex items-center gap-2 mt-1 text-sm">
          {trend && (
            <span className={trend.isPositive ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}>
              {trend.value}
            </span>
          )}
          {subtitle && <span className="text-slate-500 truncate">{subtitle}</span>}
        </div>
      </div>
    </div>
  );
}
