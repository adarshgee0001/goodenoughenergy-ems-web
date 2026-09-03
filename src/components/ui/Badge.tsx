import type { ReactNode } from 'react';

export function Badge({ children, className = '' }: { children: ReactNode, className?: string }) {
  return (
    <span className={`px-3 py-1 bg-white border border-slate-200 text-slate-600 text-xs rounded-full font-medium ${className}`}>
      {children}
    </span>
  );
}
