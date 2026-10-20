import React from 'react';
import { Activity, PauseCircle, ArrowDownRight, Zap, HelpCircle } from 'lucide-react';
import { evaluateSignalFreshness } from '../../../features/dashboard/freshness.utils';

export interface CabinetStateIndicatorProps {
  cabinetState?: number;
  cabinetStateMeasuredAt?: string;
}

export const CabinetStateIndicator: React.FC<CabinetStateIndicatorProps> = ({
  cabinetState,
  cabinetStateMeasuredAt,
}) => {
  // Validate discrete Cabinet State (0 = STANDBY, 1 = DISCHARGING, 2 = CHARGING)
  const isValidState =
    cabinetState !== undefined &&
    cabinetState !== null &&
    Number.isInteger(Number(cabinetState)) &&
    (Number(cabinetState) === 0 || Number(cabinetState) === 1 || Number(cabinetState) === 2);

  const isUnsupported =
    cabinetState !== undefined &&
    cabinetState !== null &&
    (!Number.isInteger(Number(cabinetState)) || (Number(cabinetState) < 0 || Number(cabinetState) > 2));

  const stateFreshness = evaluateSignalFreshness({
    value: isValidState ? Number(cabinetState) : undefined,
    measuredAt: cabinetStateMeasuredAt,
    componentType: 'bcms',
    decimals: 0,
  });

  // Only activate a state box if the signal is available and valid
  const activeState = stateFreshness.isAvailable && isValidState ? Number(cabinetState) : null;

  const getStatusBadge = () => {
    if (isUnsupported) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
          <HelpCircle className="w-3 h-3 text-slate-500" />
          UNKNOWN ({String(cabinetState)})
        </span>
      );
    }
    if (stateFreshness.isAvailable && !stateFreshness.isStale) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          LIVE
        </span>
      );
    }
    if (stateFreshness.isStale) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          STALE
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
        NO DATA
      </span>
    );
  };

  const STATES = [
    {
      id: 0,
      label: 'STANDBY',
      description: 'System idle / awaiting dispatch',
      icon: PauseCircle,
      activeContainer: 'bg-slate-100/90 border-slate-400 ring-2 ring-slate-400/40 shadow-sm',
      activeLabel: 'text-slate-900 font-bold',
      activeDesc: 'text-slate-600 font-medium',
      activeIconContainer: 'bg-slate-200 text-slate-800',
      activeBadge: 'bg-slate-200 text-slate-800 border-slate-300',
      activeDot: 'bg-slate-700 text-slate-700',
    },
    {
      id: 1,
      label: 'DISCHARGING',
      description: 'Power supplying grid / load',
      icon: ArrowDownRight,
      activeContainer: 'bg-amber-50 border-amber-500 ring-2 ring-amber-400/40 shadow-sm',
      activeLabel: 'text-amber-950 font-bold',
      activeDesc: 'text-amber-800 font-medium',
      activeIconContainer: 'bg-amber-100 text-amber-800',
      activeBadge: 'bg-amber-100 text-amber-900 border-amber-300',
      activeDot: 'bg-amber-600 text-amber-600',
    },
    {
      id: 2,
      label: 'CHARGING',
      description: 'Battery absorbing energy',
      icon: Zap,
      activeContainer: 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-400/40 shadow-sm',
      activeLabel: 'text-emerald-950 font-bold',
      activeDesc: 'text-emerald-800 font-medium',
      activeIconContainer: 'bg-emerald-100 text-emerald-800',
      activeBadge: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      activeDot: 'bg-emerald-600 text-emerald-600',
    },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-wide uppercase">CABINET STATE</h3>
            <p className="text-[11px] text-slate-500">Real-time operating mode from BCMS telemetry</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge()}
        </div>
      </div>

      {/* 3 State Boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {STATES.map((state) => {
          const isActive = activeState === state.id;
          const Icon = state.icon;

          return (
            <div
              key={state.id}
              className={`rounded-lg p-3.5 sm:p-4 flex items-center justify-between border transition-colors duration-150 ease-out ${
                isActive
                  ? state.activeContainer
                  : 'bg-slate-50/80 border-slate-200/90 opacity-80'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    isActive ? state.activeIconContainer : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <div
                    className={`text-xs uppercase tracking-wider transition-colors ${
                      isActive ? state.activeLabel : 'text-slate-700 font-semibold'
                    }`}
                  >
                    {state.label}
                  </div>
                  <div
                    className={`text-[11px] mt-0.5 transition-colors ${
                      isActive ? state.activeDesc : 'text-slate-500'
                    }`}
                  >
                    {state.description}
                  </div>
                </div>
              </div>

              <div>
                {isActive ? (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border tracking-wider uppercase ${state.activeBadge}`}
                  >
                    <span className="relative flex h-2 w-2">
                      <span
                        className={`motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${state.activeDot}`}
                      />
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${state.activeDot}`} />
                    </span>
                    ACTIVE
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-slate-600 bg-slate-100 border border-slate-200 tracking-wider uppercase">
                    INACTIVE
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
