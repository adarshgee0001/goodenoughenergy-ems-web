import React from 'react';
import {
  Thermometer,
  PauseCircle,
  RefreshCw,
  Snowflake,
  Flame,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react';
import { evaluateSignalFreshness } from '../../../features/dashboard/freshness.utils';

export interface TmsOperatingModeIndicatorProps {
  tmsOperatingMode?: number;
  tmsOperatingModeMeasuredAt?: string;
}

export const TmsOperatingModeIndicator: React.FC<TmsOperatingModeIndicatorProps> = ({
  tmsOperatingMode,
  tmsOperatingModeMeasuredAt,
}) => {
  // Validate discrete Operating Mode (0=STOP, 1=SELF-CIRCULATION, 2=COOLING, 3=HEATING, 4=FAULT)
  const isValidMode =
    tmsOperatingMode !== undefined &&
    tmsOperatingMode !== null &&
    Number.isInteger(Number(tmsOperatingMode)) &&
    Number(tmsOperatingMode) >= 0 &&
    Number(tmsOperatingMode) <= 4;

  const isUnsupported =
    tmsOperatingMode !== undefined &&
    tmsOperatingMode !== null &&
    (!Number.isInteger(Number(tmsOperatingMode)) || Number(tmsOperatingMode) < 0 || Number(tmsOperatingMode) > 4);

  const modeFreshness = evaluateSignalFreshness({
    value: isValidMode ? Number(tmsOperatingMode) : undefined,
    measuredAt: tmsOperatingModeMeasuredAt,
    componentType: 'tms',
    decimals: 0,
  });

  // Only highlight a card if the signal is available and valid
  const activeMode = modeFreshness.isAvailable && isValidMode ? Number(tmsOperatingMode) : null;
  const isLive = modeFreshness.isAvailable && !modeFreshness.isStale;

  const getStatusBadge = () => {
    if (isUnsupported) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
          <AlertCircle className="w-3 h-3 text-amber-600" />
          UNKNOWN ({String(tmsOperatingMode)})
        </span>
      );
    }
    if (isLive) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          LIVE
        </span>
      );
    }
    if (modeFreshness.isStale) {
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

  const MODES = [
    {
      code: 0,
      label: 'STOP',
      description: 'System offline / idle standby',
      icon: PauseCircle,
      activeContainer: 'bg-slate-100 border-slate-400 ring-2 ring-slate-400/40 shadow-sm',
      activeLabel: 'text-slate-900 font-bold',
      activeDesc: 'text-slate-600 font-medium',
      activeIconContainer: 'bg-slate-200 text-slate-800',
      activeBadge: 'bg-slate-200 text-slate-800 border-slate-300',
      activeDot: 'bg-slate-700',
    },
    {
      code: 1,
      label: 'SELF-CIRCULATION',
      description: 'Internal coolant loop active',
      icon: RefreshCw,
      activeContainer: 'bg-sky-50 border-sky-400 ring-2 ring-sky-400/40 shadow-sm',
      activeLabel: 'text-sky-950 font-bold',
      activeDesc: 'text-sky-800 font-medium',
      activeIconContainer: 'bg-sky-100 text-sky-800',
      activeBadge: 'bg-sky-100 text-sky-900 border-sky-300',
      activeDot: 'bg-sky-600',
    },
    {
      code: 2,
      label: 'COOLING',
      description: 'Active refrigeration / chiller loop',
      icon: Snowflake,
      activeContainer: 'bg-teal-50 border-teal-400 ring-2 ring-teal-400/40 shadow-sm',
      activeLabel: 'text-teal-950 font-bold',
      activeDesc: 'text-teal-800 font-medium',
      activeIconContainer: 'bg-teal-100 text-teal-800',
      activeBadge: 'bg-teal-100 text-teal-900 border-teal-300',
      activeDot: 'bg-teal-600',
    },
    {
      code: 3,
      label: 'HEATING',
      description: 'Coolant heater actively warming',
      icon: Flame,
      activeContainer: 'bg-amber-50 border-amber-400 ring-2 ring-amber-400/40 shadow-sm',
      activeLabel: 'text-amber-950 font-bold',
      activeDesc: 'text-amber-800 font-medium',
      activeIconContainer: 'bg-amber-100 text-amber-800',
      activeBadge: 'bg-amber-100 text-amber-900 border-amber-300',
      activeDot: 'bg-amber-600',
    },
    {
      code: 4,
      label: 'FAULT',
      description: 'Thermal system error condition',
      icon: AlertTriangle,
      activeContainer: 'bg-rose-50 border-rose-400 ring-2 ring-rose-400/40 shadow-sm',
      activeLabel: 'text-rose-950 font-bold',
      activeDesc: 'text-rose-800 font-medium',
      activeIconContainer: 'bg-rose-100 text-rose-800',
      activeBadge: 'bg-rose-100 text-rose-900 border-rose-300',
      activeDot: 'bg-rose-600',
    },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <Thermometer className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-wide uppercase">TMS OPERATING MODE</h3>
            <p className="text-[11px] text-slate-500">Thermal Management System operational status from telemetry</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge()}
        </div>
      </div>

      {/* 5 Operating Mode Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {MODES.map((mode) => {
          const isActive = activeMode === mode.code;
          const Icon = mode.icon;

          return (
            <div
              key={mode.code}
              className={`rounded-lg p-3 sm:p-3.5 flex flex-col justify-between border transition-colors duration-150 ease-out min-h-[105px] ${
                isActive
                  ? `${mode.activeContainer} ${isLive ? 'motion-safe:animate-pulse' : ''}`
                  : 'bg-slate-50/80 border-slate-200/90 opacity-80'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    isActive ? mode.activeIconContainer : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>

                {isActive ? (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border tracking-wider uppercase shrink-0 ${mode.activeBadge}`}
                  >
                    <span className="relative flex h-1.5 w-1.5">
                      {isLive && (
                        <span
                          className={`motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${mode.activeDot}`}
                        />
                      )}
                      <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${mode.activeDot}`} />
                    </span>
                    ACTIVE
                  </span>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium text-slate-600 bg-slate-100 border border-slate-200 tracking-wider uppercase shrink-0">
                    IDLE
                  </span>
                )}
              </div>

              <div className="mt-2.5">
                <div
                  className={`text-xs uppercase tracking-wider leading-tight transition-colors break-words ${
                    isActive ? mode.activeLabel : 'text-slate-700 font-semibold'
                  }`}
                >
                  {mode.label}
                </div>
                <div
                  className={`text-[10px] mt-0.5 leading-snug transition-colors line-clamp-2 ${
                    isActive ? mode.activeDesc : 'text-slate-500'
                  }`}
                >
                  {mode.description}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
