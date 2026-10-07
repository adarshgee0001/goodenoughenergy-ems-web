import { Sun, BatteryMedium, Zap, Home } from 'lucide-react';

export function EnergyFlowPlaceholder() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col h-full">
      <h3 className="text-lg font-semibold text-slate-900 mb-6">Energy Flow Foundation</h3>
      
      <div className="flex-1 flex items-center justify-center relative min-h-[300px]">
        {/* Placeholder Nodes */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-500 border-2 border-amber-200 flex items-center justify-center mb-2 z-10">
            <Sun className="w-8 h-8" />
          </div>
          <span className="text-sm font-medium text-slate-600">Solar PV</span>
        </div>

        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-500 border-2 border-emerald-200 flex items-center justify-center mb-2 z-10">
            <BatteryMedium className="w-8 h-8" />
          </div>
          <span className="text-sm font-medium text-slate-600">BESS</span>
        </div>

        <div className="absolute left-0 top-1/2 -translate-y-1/2 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-500 border-2 border-blue-200 flex items-center justify-center mb-2 z-10">
            <Zap className="w-8 h-8" />
          </div>
          <span className="text-sm font-medium text-slate-600">Grid</span>
        </div>

        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-purple-50 text-purple-500 border-2 border-purple-200 flex items-center justify-center mb-2 z-10">
            <Home className="w-8 h-8" />
          </div>
          <span className="text-sm font-medium text-slate-600">Load</span>
        </div>

        {/* Placeholder Connection Lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ minWidth: '100%', minHeight: '100%' }}>
          <defs>
            <linearGradient id="flow-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#cbd5e1" stopOpacity="0.5" />
              <stop offset="50%" stopColor="#94a3b8" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#cbd5e1" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          <path d="M 50% 20% Q 30% 50% 20% 50%" fill="none" stroke="url(#flow-gradient)" strokeWidth="4" strokeDasharray="8 8" />
          <path d="M 50% 20% Q 70% 50% 80% 50%" fill="none" stroke="url(#flow-gradient)" strokeWidth="4" strokeDasharray="8 8" />
          <path d="M 20% 50% Q 30% 50% 50% 80%" fill="none" stroke="url(#flow-gradient)" strokeWidth="4" strokeDasharray="8 8" />
          <path d="M 50% 80% Q 70% 50% 80% 50%" fill="none" stroke="url(#flow-gradient)" strokeWidth="4" strokeDasharray="8 8" />
          <path d="M 20% 50% L 80% 50%" fill="none" stroke="url(#flow-gradient)" strokeWidth="4" strokeDasharray="8 8" />
          <path d="M 50% 20% L 50% 80%" fill="none" stroke="url(#flow-gradient)" strokeWidth="4" strokeDasharray="8 8" />
        </svg>

        {/* Central Hub Placeholder */}
        <div className="w-20 h-20 rounded-full bg-white shadow-lg border-4 border-slate-100 flex items-center justify-center z-20">
          <span className="text-xs font-bold text-slate-400">EMS HUB</span>
        </div>
      </div>
      
      <p className="text-xs text-center text-slate-400 mt-4">
        Visual placeholder only. Real-time energy flow to be implemented in future phase.
      </p>
    </div>
  );
}
