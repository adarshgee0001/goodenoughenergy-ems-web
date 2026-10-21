import React from 'react';
import { Zap } from 'lucide-react';
import { evaluateSignalFreshness } from '../../../features/dashboard/freshness.utils';

export interface PcsTelemetryTableProps {
  pcsTemperature?: number;
  pcsTemperatureMeasuredAt?: string;
  pcsLineVoltage?: number;
  pcsLineVoltageMeasuredAt?: string;
  pcsAcCurrent?: number;
  pcsAcCurrentMeasuredAt?: string;
  ambientTemp?: number;
  ambientTempMeasuredAt?: string;
  tmsAmbientTemp?: number;
  tmsAmbientTempMeasuredAt?: string;
}

export const PcsTelemetryTable: React.FC<PcsTelemetryTableProps> = ({
  pcsTemperature,
  pcsTemperatureMeasuredAt,
  pcsLineVoltage,
  pcsLineVoltageMeasuredAt,
  pcsAcCurrent,
  pcsAcCurrentMeasuredAt,
  ambientTemp,
  ambientTempMeasuredAt,
  tmsAmbientTemp,
  tmsAmbientTempMeasuredAt,
}) => {
  const effectiveAmbientTemp = tmsAmbientTemp ?? ambientTemp;
  const effectiveAmbientMeasuredAt = tmsAmbientTempMeasuredAt ?? ambientTempMeasuredAt;

  const tempFreshness = evaluateSignalFreshness({
    value: pcsTemperature,
    measuredAt: pcsTemperatureMeasuredAt,
    componentType: 'pcs',
    decimals: 1,
  });

  const voltFreshness = evaluateSignalFreshness({
    value: pcsLineVoltage,
    measuredAt: pcsLineVoltageMeasuredAt,
    componentType: 'pcs',
    decimals: 1,
  });

  const currFreshness = evaluateSignalFreshness({
    value: pcsAcCurrent,
    measuredAt: pcsAcCurrentMeasuredAt,
    componentType: 'pcs',
    decimals: 1,
  });

  const ambientFreshness = evaluateSignalFreshness({
    value: effectiveAmbientTemp,
    measuredAt: effectiveAmbientMeasuredAt,
    componentType: 'tms',
    decimals: 1,
  });

  const tempDisplay = tempFreshness.isAvailable && !tempFreshness.isStale && pcsTemperature !== undefined
    ? pcsTemperature.toFixed(1)
    : '--';

  const voltDisplay = voltFreshness.isAvailable && !voltFreshness.isStale && pcsLineVoltage !== undefined
    ? pcsLineVoltage.toFixed(1)
    : '--';

  const currDisplay = currFreshness.isAvailable && !currFreshness.isStale && pcsAcCurrent !== undefined
    ? pcsAcCurrent.toFixed(1)
    : '--';

  const ambientDisplay = ambientFreshness.isAvailable && !ambientFreshness.isStale && effectiveAmbientTemp !== undefined
    ? effectiveAmbientTemp.toFixed(1)
    : '--';

  const getStatusBadge = (freshness: typeof tempFreshness) => {
    if (freshness.isAvailable && !freshness.isStale) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700">
          LIVE
        </span>
      );
    }
    if (freshness.isStale) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700">
          STALE
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500">
        NO DATA
      </span>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-wide uppercase">PCS TELEMETRY</h3>
            <p className="text-[11px] text-slate-500">Power Conversion System parameters</p>
          </div>
        </div>
      </div>

      {/* 4-Row Compact Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="border-b border-slate-200 bg-slate-50/75">
            <tr>
              <th className="px-3 py-2 font-semibold text-slate-700 text-xs uppercase tracking-wider">FIELD</th>
              <th className="px-3 py-2 font-semibold text-slate-700 text-xs uppercase tracking-wider text-right">VALUE</th>
              <th className="px-3 py-2 font-semibold text-slate-700 text-xs uppercase tracking-wider text-right">STATUS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr className="hover:bg-slate-50/50 transition-colors">
              <td className="px-3 py-2.5 font-medium text-slate-800 text-xs">PCS Temperature</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 font-semibold text-xs">
                {tempDisplay} {tempDisplay !== '--' ? '°C' : ''}
              </td>
              <td className="px-3 py-2.5 text-right">{getStatusBadge(tempFreshness)}</td>
            </tr>
            <tr className="hover:bg-slate-50/50 transition-colors">
              <td className="px-3 py-2.5 font-medium text-slate-800 text-xs">Line Voltage</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 font-semibold text-xs">
                {voltDisplay} {voltDisplay !== '--' ? 'V' : ''}
              </td>
              <td className="px-3 py-2.5 text-right">{getStatusBadge(voltFreshness)}</td>
            </tr>
            <tr className="hover:bg-slate-50/50 transition-colors">
              <td className="px-3 py-2.5 font-medium text-slate-800 text-xs">AC Current</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 font-semibold text-xs">
                {currDisplay} {currDisplay !== '--' ? 'A' : ''}
              </td>
              <td className="px-3 py-2.5 text-right">{getStatusBadge(currFreshness)}</td>
            </tr>
            <tr className="hover:bg-slate-50/50 transition-colors">
              <td className="px-3 py-2.5 font-medium text-slate-800 text-xs">Ambient Temperature</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 font-semibold text-xs">
                {ambientDisplay} {ambientDisplay !== '--' ? '°C' : ''}
              </td>
              <td className="px-3 py-2.5 text-right">{getStatusBadge(ambientFreshness)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
