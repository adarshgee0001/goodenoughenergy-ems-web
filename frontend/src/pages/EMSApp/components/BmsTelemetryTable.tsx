import React from 'react';
import { Cpu } from 'lucide-react';
import { evaluateSignalFreshness } from '../../../features/dashboard/freshness.utils';

export interface BmsTelemetryTableProps {
  cellVMax?: number;
  cellVMaxMeasuredAt?: string;
  cellVMin?: number;
  cellVMinMeasuredAt?: string;
  cellTempMax?: number;
  cellTempMaxMeasuredAt?: string;
  cellTempMin?: number;
  cellTempMinMeasuredAt?: string;
  bmsDcVoltage?: number;
  bmsDcVoltageMeasuredAt?: string;
  bmsCurrent?: number;
  bmsCurrentMeasuredAt?: string;
}

export const BmsTelemetryTable: React.FC<BmsTelemetryTableProps> = ({
  cellVMax,
  cellVMaxMeasuredAt,
  cellVMin,
  cellVMinMeasuredAt,
  cellTempMax,
  cellTempMaxMeasuredAt,
  cellTempMin,
  cellTempMinMeasuredAt,
  bmsDcVoltage,
  bmsDcVoltageMeasuredAt,
  bmsCurrent,
  bmsCurrentMeasuredAt,
}) => {
  const cellVMaxFreshness = evaluateSignalFreshness({
    value: cellVMax,
    measuredAt: cellVMaxMeasuredAt,
    componentType: 'bcms',
    decimals: 3,
  });

  const cellVMinFreshness = evaluateSignalFreshness({
    value: cellVMin,
    measuredAt: cellVMinMeasuredAt,
    componentType: 'bcms',
    decimals: 3,
  });

  const tempMaxFreshness = evaluateSignalFreshness({
    value: cellTempMax,
    measuredAt: cellTempMaxMeasuredAt,
    componentType: 'bcms',
    decimals: 1,
  });

  const tempMinFreshness = evaluateSignalFreshness({
    value: cellTempMin,
    measuredAt: cellTempMinMeasuredAt,
    componentType: 'bcms',
    decimals: 1,
  });

  const dcVoltFreshness = evaluateSignalFreshness({
    value: bmsDcVoltage,
    measuredAt: bmsDcVoltageMeasuredAt,
    componentType: 'bcms',
    decimals: 1,
  });

  const currentFreshness = evaluateSignalFreshness({
    value: bmsCurrent,
    measuredAt: bmsCurrentMeasuredAt,
    componentType: 'bcms',
    decimals: 1,
  });

  const getStatusBadge = (freshness: typeof cellVMaxFreshness) => {
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

  const cellVMaxDisplay =
    cellVMaxFreshness.isAvailable && !cellVMaxFreshness.isStale && cellVMax !== undefined
      ? cellVMax.toFixed(3)
      : '--';

  const cellVMinDisplay =
    cellVMinFreshness.isAvailable && !cellVMinFreshness.isStale && cellVMin !== undefined
      ? cellVMin.toFixed(3)
      : '--';

  const tempMaxDisplay =
    tempMaxFreshness.isAvailable && !tempMaxFreshness.isStale && cellTempMax !== undefined
      ? cellTempMax.toFixed(1)
      : '--';

  const tempMinDisplay =
    tempMinFreshness.isAvailable && !tempMinFreshness.isStale && cellTempMin !== undefined
      ? cellTempMin.toFixed(1)
      : '--';

  const dcVoltDisplay =
    dcVoltFreshness.isAvailable && !dcVoltFreshness.isStale && bmsDcVoltage !== undefined
      ? bmsDcVoltage.toFixed(1)
      : '--';

  const currDisplay =
    currentFreshness.isAvailable && !currentFreshness.isStale && bmsCurrent !== undefined
      ? bmsCurrent.toFixed(1)
      : '--';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-wide uppercase">BMS TELEMETRY</h3>
            <p className="text-[11px] text-slate-500">Battery Management System parameters</p>
          </div>
        </div>
      </div>

      {/* 6-Row Compact Table */}
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
            {/* 1. Max Cell Voltage */}
            <tr className="hover:bg-slate-50/50 transition-colors">
              <td className="px-3 py-2.5 font-medium text-slate-800 text-xs">Max Cell Voltage</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 font-semibold text-xs">
                {cellVMaxDisplay} {cellVMaxDisplay !== '--' ? 'V' : ''}
              </td>
              <td className="px-3 py-2.5 text-right">{getStatusBadge(cellVMaxFreshness)}</td>
            </tr>

            {/* 2. Min Cell Voltage */}
            <tr className="hover:bg-slate-50/50 transition-colors">
              <td className="px-3 py-2.5 font-medium text-slate-800 text-xs">Min Cell Voltage</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 font-semibold text-xs">
                {cellVMinDisplay} {cellVMinDisplay !== '--' ? 'V' : ''}
              </td>
              <td className="px-3 py-2.5 text-right">{getStatusBadge(cellVMinFreshness)}</td>
            </tr>

            {/* 3. Max Cell Temperature */}
            <tr className="hover:bg-slate-50/50 transition-colors">
              <td className="px-3 py-2.5 font-medium text-slate-800 text-xs">Max Cell Temperature</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 font-semibold text-xs">
                {tempMaxDisplay} {tempMaxDisplay !== '--' ? '°C' : ''}
              </td>
              <td className="px-3 py-2.5 text-right">{getStatusBadge(tempMaxFreshness)}</td>
            </tr>

            {/* 4. Min Cell Temperature */}
            <tr className="hover:bg-slate-50/50 transition-colors">
              <td className="px-3 py-2.5 font-medium text-slate-800 text-xs">Min Cell Temperature</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 font-semibold text-xs">
                {tempMinDisplay} {tempMinDisplay !== '--' ? '°C' : ''}
              </td>
              <td className="px-3 py-2.5 text-right">{getStatusBadge(tempMinFreshness)}</td>
            </tr>

            {/* 5. DC Voltage */}
            <tr className="hover:bg-slate-50/50 transition-colors">
              <td className="px-3 py-2.5 font-medium text-slate-800 text-xs">DC Voltage</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 font-semibold text-xs">
                {dcVoltDisplay} {dcVoltDisplay !== '--' ? 'V' : ''}
              </td>
              <td className="px-3 py-2.5 text-right">{getStatusBadge(dcVoltFreshness)}</td>
            </tr>

            {/* 6. DC Current */}
            <tr className="hover:bg-slate-50/50 transition-colors">
              <td className="px-3 py-2.5 font-medium text-slate-800 text-xs">DC Current</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 font-semibold text-xs">
                {currDisplay} {currDisplay !== '--' ? 'A' : ''}
              </td>
              <td className="px-3 py-2.5 text-right">{getStatusBadge(currentFreshness)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
