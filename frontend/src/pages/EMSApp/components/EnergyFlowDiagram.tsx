import { motion } from 'framer-motion';
import { Zap, BatteryMedium, Cpu } from 'lucide-react';
import type { DashboardTelemetryState } from '../../../features/dashboard/dashboard.types';

interface EnergyFlowDiagramProps {
  data: DashboardTelemetryState;
  /**
   * When true, the telemetry data is older than the freshness threshold.
   * Numeric values are masked to '--' and flow animations are suppressed.
   * Underlying data and sign semantics are unchanged.
   */
  isStale?: boolean;
}

const NodeCard = ({
  title,
  value,
  unit,
  stateText,
  icon: Icon,
  colorClass,
  borderClass,
  className = '',
}: any) => (
  <div className={`flex flex-col bg-white border border-slate-200 rounded-xl shadow-sm w-36 sm:w-44 overflow-hidden z-10 ${className}`}>
    <div className={`flex items-center justify-between px-4 py-2 border-b-2 bg-slate-50 ${borderClass}`}>
      <span className="font-semibold text-xs tracking-wider uppercase text-slate-700">{title}</span>
      <Icon className={`w-4 h-4 ${colorClass}`} />
    </div>
    <div className="p-4 text-center flex flex-col justify-center min-h-[80px]">
      <div className="text-xl sm:text-2xl font-bold text-slate-900 leading-none mb-1">
        {value} <span className="text-xs sm:text-sm text-slate-500 font-medium">{unit}</span>
      </div>
      <div className={`text-[10px] sm:text-xs uppercase tracking-wider font-bold ${colorClass}`}>{stateText}</div>
    </div>
  </div>
);

export const EnergyFlowDiagram = ({ data, isStale = false }: EnergyFlowDiagramProps) => {
  // Grid — real source: pmg.ai_sum_p → gridPower
  const gridPower = data.gridPower;
  const isGridImporting = !isStale && gridPower !== undefined && gridPower > 0;
  const isGridExporting = !isStale && gridPower !== undefined && gridPower < 0;
  const gridDisplay = isStale ? '--' : (gridPower !== undefined ? `${Math.abs(gridPower)}` : '--');

  // BESS — real source: pcs.ai_p → bessPower
  // Sign semantics: positive = Charging, negative = Discharging, zero = Idle
  // Math.abs() is ONLY used for display magnitude; sign logic below is preserved.
  const bessPower = data.bessPower;
  const isBessCharging = !isStale && bessPower !== undefined && bessPower > 0;
  const isBessDischarging = !isStale && bessPower !== undefined && bessPower < 0;
  const bessDisplay = isStale ? '--' : (bessPower !== undefined ? `${bessPower}` : '--');

  // SOC — no confirmed source in Phase 14C; omitted from UI

  // Solar — confirmed source: pinv.ai_op_p → solarPower (Step 1)
  // Sign convention: always positive (generation). No BESS sign semantics.
  const solarPower = data.solarPower;
  const isSolarActive = !isStale && solarPower !== undefined && solarPower > 0;
  const solarDisplay = isStale ? '--' : (solarPower !== undefined ? `${solarPower}` : '--');

  const flowTransition = {
    duration: 1.5,
    repeat: Infinity,
    ease: 'linear' as const,
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col h-full w-full overflow-hidden">
      <div className="flex justify-between items-center mb-6 z-10">
        <h3 className="text-lg font-semibold text-slate-900">Energy Flow</h3>
        {isStale ? (
          <span className="text-xs font-medium px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full flex items-center gap-1.5 border border-amber-100">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Stale Data
          </span>
        ) : (
          <span className="text-xs font-medium px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full flex items-center gap-1.5 border border-emerald-100">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live System
          </span>
        )}
      </div>

      <div className="flex-1 relative w-full h-full min-h-[440px] flex items-center justify-center">
        {/* SVG Flow Lines layer */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" preserveAspectRatio="none">
          {/* Base static lines */}
          <g stroke="#e2e8f0" strokeWidth="3" fill="none" strokeLinecap="round">
            {/* Solar → Bus vertical */}
            <path d="M 50% 22% L 50% 46%" />
            {/* Grid → Bus horizontal */}
            <path d="M 16% 62% L 50% 62%" />
            {/* Bus → BESS horizontal */}
            <path d="M 50% 62% L 84% 62%" />
          </g>

          {/* Animated active lines */}
          <g strokeWidth="3" fill="none" strokeLinecap="round">
            {isSolarActive && (
              <motion.path d="M 50% 22% L 50% 46%" stroke="#f59e0b" strokeDasharray="8 8"
                initial={{ strokeDashoffset: 16 }} animate={{ strokeDashoffset: 0 }} transition={flowTransition} />
            )}
            {isGridImporting && (
              <motion.path d="M 16% 62% L 50% 62%" stroke="#f59e0b" strokeDasharray="8 8"
                initial={{ strokeDashoffset: 16 }} animate={{ strokeDashoffset: 0 }} transition={flowTransition} />
            )}
            {isGridExporting && (
              <motion.path d="M 50% 62% L 16% 62%" stroke="#f59e0b" strokeDasharray="8 8"
                initial={{ strokeDashoffset: 16 }} animate={{ strokeDashoffset: 0 }} transition={flowTransition} />
            )}
            {isBessDischarging && (
              <motion.path d="M 84% 62% L 50% 62%" stroke="#3b82f6" strokeDasharray="8 8"
                initial={{ strokeDashoffset: 16 }} animate={{ strokeDashoffset: 0 }} transition={flowTransition} />
            )}
            {isBessCharging && (
              <motion.path d="M 50% 62% L 84% 62%" stroke="#3b82f6" strokeDasharray="8 8"
                initial={{ strokeDashoffset: 16 }} animate={{ strokeDashoffset: 0 }} transition={flowTransition} />
            )}
          </g>
        </svg>

        {/* Layout: Solar top-centre, Grid/Bus/BESS bottom row */}
        <div className="w-full h-full relative z-10 flex flex-col items-center justify-center gap-6 max-w-4xl mx-auto">

          {/* Top row — Solar PV */}
          <div className="flex justify-center">
            <div className="flex flex-col bg-white border border-slate-200 rounded-xl shadow-sm w-36 sm:w-44 overflow-hidden z-10">
              <div className={`flex items-center justify-between px-4 py-2 border-b-2 bg-slate-50 ${isSolarActive ? 'border-amber-400' : 'border-slate-200'}`}>
                <span className="font-semibold text-xs tracking-wider uppercase text-slate-700">Solar PV</span>
                {/* Sun icon via inline SVG — no new import required */}
                <svg viewBox="0 0 24 24" className={`w-4 h-4 ${isSolarActive ? 'text-amber-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              </div>
              <div className="p-4 text-center flex flex-col justify-center min-h-[80px]">
                <div className="text-xl sm:text-2xl font-bold text-slate-900 leading-none mb-1">
                  {solarDisplay} <span className="text-xs sm:text-sm text-slate-500 font-medium">{(!isStale && solarPower !== undefined) ? 'kW' : ''}</span>
                </div>
                <div className={`text-[10px] sm:text-xs uppercase tracking-wider font-bold ${isSolarActive ? 'text-amber-500' : 'text-slate-400'}`}>
                  {isStale ? 'Stale' : (solarPower !== undefined ? (isSolarActive ? 'Generating' : 'Idle') : 'No Data')}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom row — Grid / Bus / BESS */}
          <div className="grid grid-cols-3 gap-2 sm:gap-6 w-full place-items-center">
            {/* Grid */}
            <div className="col-start-1">
              <NodeCard
                title="Grid"
                value={gridDisplay}
                unit={(!isStale && gridPower !== undefined) ? 'kW' : ''}
                stateText={
                  isStale
                    ? 'Stale'
                    : gridPower !== undefined && gridPower !== 0 ? 'Active' : gridPower === 0 ? 'Idle' : 'No Data'
                }
                icon={Zap}
                borderClass={(!isStale && gridPower !== undefined && gridPower !== 0) ? 'border-amber-500' : 'border-slate-200'}
                colorClass={(!isStale && gridPower !== undefined && gridPower !== 0) ? 'text-amber-600' : 'text-slate-400'}
              />
            </div>

            {/* Bus */}
            <div className="col-start-2">
              <div className="flex flex-col items-center justify-center bg-slate-900 border-2 border-slate-700 rounded-xl p-4 sm:p-5 shadow-lg w-32 sm:w-40 text-center">
                <Cpu className="w-8 h-8 sm:w-10 sm:h-10 text-slate-100 mb-2" />
                <span className="text-white font-bold tracking-widest text-xs sm:text-sm">ENERGY BUS</span>
                <span className="text-emerald-400 text-[9px] sm:text-[10px] uppercase font-bold tracking-wider mt-1">System Active</span>
              </div>
            </div>

            {/* BESS */}
            <div className="col-start-3">
              <div className="flex flex-col bg-white border border-slate-200 rounded-xl shadow-sm w-36 sm:w-44 overflow-hidden z-10">
                <div className={`flex items-center justify-between px-4 py-2 border-b-2 bg-slate-50 ${(!isStale && bessPower !== undefined && bessPower !== 0) ? 'border-blue-500' : 'border-slate-200'}`}>
                  <span className="font-semibold text-xs tracking-wider uppercase text-slate-700">BESS</span>
                  <BatteryMedium className={`w-4 h-4 ${(!isStale && bessPower !== undefined && bessPower !== 0) ? 'text-blue-600' : 'text-slate-400'}`} />
                </div>
                <div className="p-4 text-center flex flex-col justify-center min-h-[80px]">
                  <div className="text-xl sm:text-2xl font-bold text-slate-900 leading-none mb-1">
                    {bessDisplay} <span className="text-xs sm:text-sm text-slate-500 font-medium">{(!isStale && bessPower !== undefined) ? 'kW' : ''}</span>
                  </div>
                  <div className={`text-[10px] sm:text-xs uppercase tracking-wider font-bold mb-2 ${(!isStale && bessPower !== undefined && bessPower !== 0) ? 'text-blue-600' : 'text-slate-400'}`}>
                    {isStale ? 'Stale' : (isBessDischarging ? 'Discharging' : isBessCharging ? 'Charging' : bessPower === 0 ? 'Idle' : 'No Data')}
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
