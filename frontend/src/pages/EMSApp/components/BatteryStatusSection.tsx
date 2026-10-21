import React from 'react';
import { Thermometer } from 'lucide-react';
import { evaluateSignalFreshness } from '../../../features/dashboard/freshness.utils';

export interface BatteryStatusSectionProps {
  batteryAmbientTemp?: number;
  batteryAmbientMeasuredAt?: string;
  packTemperatures?: Record<string, { avgTemp?: number; maxTemp?: number; measuredAt?: string }>;
  bessSocEval: {
    displayValue?: string;
    value?: number;
    isAvailable: boolean;
    isStale: boolean;
    subtitle?: string;
  };
}

const PACK_IDENTIFIERS = ['pack_01', 'pack_02', 'pack_03', 'pack_04', 'pack_05'] as const;

export const BatteryStatusSection: React.FC<BatteryStatusSectionProps> = ({
  batteryAmbientTemp,
  batteryAmbientMeasuredAt,
  packTemperatures,
  bessSocEval,
}) => {
  // Evaluate Battery Ambient Temperature freshness (componentType: 'tms')
  const ambientFreshness = evaluateSignalFreshness({
    value: batteryAmbientTemp,
    measuredAt: batteryAmbientMeasuredAt,
    componentType: 'tms',
    decimals: 1,
    defaultSubtitle: 'Cabinet sensor',
  });

  const ambientDisplayValue = ambientFreshness.isAvailable && !ambientFreshness.isStale
    ? `${ambientFreshness.displayValue} °C`
    : '-- °C';

  // Shared BESS SOC representation across all 5 rows
  const sharedSocDisplay = bessSocEval.isAvailable && !bessSocEval.isStale
    ? `${bessSocEval.displayValue} %`
    : '--';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      {/* Header with Title and Compact Battery Ambient Metric */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-base font-bold text-slate-900 tracking-wide uppercase">BATTERY STATUS</h3>
          <p className="text-xs text-slate-500 mt-0.5">Live battery pack temperatures and shared BESS state of charge</p>
        </div>

        {/* Separate Battery Ambient Measurement */}
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200/80 rounded-lg px-3.5 py-2 self-start sm:self-auto">
          <div className="w-8 h-8 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Thermometer className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">BATTERY AMBIENT</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold text-slate-900 tabular-nums">
                {ambientDisplayValue}
              </span>
              {ambientFreshness.subtitle && (
                <span className="text-[10px] text-slate-400">
                  {ambientFreshness.subtitle}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4-Column Compact Pack Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="border-b border-slate-200 bg-slate-50/75">
            <tr>
              <th className="px-4 py-2.5 font-semibold text-slate-700 text-xs uppercase tracking-wider">PACK NUMBER</th>
              <th className="px-4 py-2.5 font-semibold text-slate-700 text-xs uppercase tracking-wider text-right">AVERAGE TEMPERATURE (°C)</th>
              <th className="px-4 py-2.5 font-semibold text-slate-700 text-xs uppercase tracking-wider text-right">MAX TEMPERATURE (°C)</th>
              <th className="px-4 py-2.5 font-semibold text-slate-700 text-xs uppercase tracking-wider text-right">AVG SOC %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {PACK_IDENTIFIERS.map((packId) => {
              const packData = packTemperatures?.[packId];
              const packFreshness = evaluateSignalFreshness({
                value: packData?.avgTemp,
                measuredAt: packData?.measuredAt,
                componentType: 'bcms',
                decimals: 1,
              });
              const isPackFresh = packFreshness.isAvailable && !packFreshness.isStale;
              const avgDisplay = isPackFresh && packData?.avgTemp !== undefined ? packData.avgTemp.toFixed(1) : '--';
              const maxDisplay = isPackFresh && packData?.maxTemp !== undefined ? packData.maxTemp.toFixed(1) : '--';

              return (
                <tr key={packId} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-slate-900 font-mono text-xs">{packId}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-800">{avgDisplay}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-800">{maxDisplay}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-800">{sharedSocDisplay}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
