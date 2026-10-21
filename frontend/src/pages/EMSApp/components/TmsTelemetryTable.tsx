import React from 'react';
import { Thermometer } from 'lucide-react';
import { evaluateSignalFreshness } from '../../../features/dashboard/freshness.utils';

export interface TmsTelemetryTableProps {
  tmsAmbientTemp?: number;
  tmsAmbientTempMeasuredAt?: string;
  tmsCoolantReturnTemp?: number;
  tmsCoolantReturnTempMeasuredAt?: string;
  tmsCoolantInletTemp?: number;
  tmsCoolantInletTempMeasuredAt?: string;
  tmsCoolantReturnPressure?: number;
  tmsCoolantReturnPressureMeasuredAt?: string;
  tmsCoolantInletPressure?: number;
  tmsCoolantInletPressureMeasuredAt?: string;
  tmsOperatingMode?: number;
  tmsOperatingModeMeasuredAt?: string;
}

export const TMS_OPERATING_MODES = [
  {
    code: 0,
    label: 'STOP',
    description: 'System offline / idle standby',
  },
  {
    code: 1,
    label: 'SELF-CIRCULATION',
    description: 'Internal coolant loop active',
  },
  {
    code: 2,
    label: 'COOLING',
    description: 'Active refrigeration / chiller loop',
  },
  {
    code: 3,
    label: 'HEATING',
    description: 'Coolant heater actively warming',
  },
  {
    code: 4,
    label: 'FAULT',
    description: 'Thermal system error condition',
  },
] as const;

export const TmsTelemetryTable: React.FC<TmsTelemetryTableProps> = ({
  tmsAmbientTemp,
  tmsAmbientTempMeasuredAt,
  tmsCoolantReturnTemp,
  tmsCoolantReturnTempMeasuredAt,
  tmsCoolantInletTemp,
  tmsCoolantInletTempMeasuredAt,
  tmsCoolantReturnPressure,
  tmsCoolantReturnPressureMeasuredAt,
  tmsCoolantInletPressure,
  tmsCoolantInletPressureMeasuredAt,
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

  const isUnsupportedMode =
    tmsOperatingMode !== undefined &&
    tmsOperatingMode !== null &&
    (!Number.isInteger(Number(tmsOperatingMode)) || Number(tmsOperatingMode) < 0 || Number(tmsOperatingMode) > 4);

  const modeFreshness = evaluateSignalFreshness({
    value: isValidMode ? Number(tmsOperatingMode) : undefined,
    measuredAt: tmsOperatingModeMeasuredAt,
    componentType: 'tms',
    decimals: 0,
  });

  const activeModeCode = modeFreshness.isAvailable && !modeFreshness.isStale && isValidMode
    ? Number(tmsOperatingMode)
    : null;

  const currentModeInfo = isValidMode ? TMS_OPERATING_MODES[Number(tmsOperatingMode)] : undefined;

  const ambientFreshness = evaluateSignalFreshness({
    value: tmsAmbientTemp,
    measuredAt: tmsAmbientTempMeasuredAt,
    componentType: 'tms',
    decimals: 1,
  });

  const coolantReturnTempFreshness = evaluateSignalFreshness({
    value: tmsCoolantReturnTemp,
    measuredAt: tmsCoolantReturnTempMeasuredAt,
    componentType: 'tms',
    decimals: 1,
  });

  const coolantInletTempFreshness = evaluateSignalFreshness({
    value: tmsCoolantInletTemp,
    measuredAt: tmsCoolantInletTempMeasuredAt,
    componentType: 'tms',
    decimals: 1,
  });

  const coolantReturnPressureFreshness = evaluateSignalFreshness({
    value: tmsCoolantReturnPressure,
    measuredAt: tmsCoolantReturnPressureMeasuredAt,
    componentType: 'tms',
    decimals: 2,
  });

  const coolantInletPressureFreshness = evaluateSignalFreshness({
    value: tmsCoolantInletPressure,
    measuredAt: tmsCoolantInletPressureMeasuredAt,
    componentType: 'tms',
    decimals: 2,
  });

  const getStatusBadge = (freshness: typeof ambientFreshness) => {
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

  const getOperatingModeStatusBadge = () => {
    if (isUnsupportedMode) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
          UNKNOWN
        </span>
      );
    }
    if (modeFreshness.isAvailable && !modeFreshness.isStale) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700">
          LIVE
        </span>
      );
    }
    if (modeFreshness.isStale) {
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


  const ambientDisplay =
    ambientFreshness.isAvailable && !ambientFreshness.isStale && tmsAmbientTemp !== undefined
      ? tmsAmbientTemp.toFixed(1)
      : '--';

  const returnTempDisplay =
    coolantReturnTempFreshness.isAvailable && !coolantReturnTempFreshness.isStale && tmsCoolantReturnTemp !== undefined
      ? tmsCoolantReturnTemp.toFixed(1)
      : '--';

  const inletTempDisplay =
    coolantInletTempFreshness.isAvailable && !coolantInletTempFreshness.isStale && tmsCoolantInletTemp !== undefined
      ? tmsCoolantInletTemp.toFixed(1)
      : '--';

  const returnPressureDisplay =
    coolantReturnPressureFreshness.isAvailable && !coolantReturnPressureFreshness.isStale && tmsCoolantReturnPressure !== undefined
      ? tmsCoolantReturnPressure.toFixed(2)
      : '--';

  const inletPressureDisplay =
    coolantInletPressureFreshness.isAvailable && !coolantInletPressureFreshness.isStale && tmsCoolantInletPressure !== undefined
      ? tmsCoolantInletPressure.toFixed(2)
      : '--';

  const currentModeDisplay = () => {
    if (isUnsupportedMode) {
      return `UNKNOWN (${String(tmsOperatingMode)})`;
    }
    if (modeFreshness.isAvailable && !modeFreshness.isStale && currentModeInfo) {
      return currentModeInfo.label;
    }
    return '--';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <Thermometer className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-wide uppercase">TMS TELEMETRY</h3>
            <p className="text-[11px] text-slate-500">Thermal Management System parameters</p>
          </div>
        </div>
      </div>

      {/* Table */}
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
            {/* 1. Operating Mode */}
            <tr className="hover:bg-slate-50/50 transition-colors">
              <td className="px-3 py-2.5 font-medium text-slate-800 text-xs">
                <div>Operating Mode</div>
                {activeModeCode !== null && currentModeInfo && (
                  <div className="text-[10px] text-slate-500 font-normal">{currentModeInfo.description}</div>
                )}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 font-semibold text-xs">
                {currentModeDisplay()}
              </td>
              <td className="px-3 py-2.5 text-right">{getOperatingModeStatusBadge()}</td>
            </tr>

            {/* 2. Ambient Temperature */}
            <tr className="hover:bg-slate-50/50 transition-colors">
              <td className="px-3 py-2.5 font-medium text-slate-800 text-xs">Ambient Temperature</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 font-semibold text-xs">
                {ambientDisplay} {ambientDisplay !== '--' ? '°C' : ''}
              </td>
              <td className="px-3 py-2.5 text-right">{getStatusBadge(ambientFreshness)}</td>
            </tr>

            {/* 3. Battery Coolant Return Temperature */}
            <tr className="hover:bg-slate-50/50 transition-colors">
              <td className="px-3 py-2.5 font-medium text-slate-800 text-xs">Battery Coolant Return Temperature</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 font-semibold text-xs">
                {returnTempDisplay} {returnTempDisplay !== '--' ? '°C' : ''}
              </td>
              <td className="px-3 py-2.5 text-right">{getStatusBadge(coolantReturnTempFreshness)}</td>
            </tr>

            {/* 4. Battery Coolant Inlet Temperature */}
            <tr className="hover:bg-slate-50/50 transition-colors">
              <td className="px-3 py-2.5 font-medium text-slate-800 text-xs">Battery Coolant Inlet Temperature</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 font-semibold text-xs">
                {inletTempDisplay} {inletTempDisplay !== '--' ? '°C' : ''}
              </td>
              <td className="px-3 py-2.5 text-right">{getStatusBadge(coolantInletTempFreshness)}</td>
            </tr>

            {/* 5. Coolant Return Pressure */}
            <tr className="hover:bg-slate-50/50 transition-colors">
              <td className="px-3 py-2.5 font-medium text-slate-800 text-xs">Coolant Return Pressure</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 font-semibold text-xs">
                {returnPressureDisplay} {returnPressureDisplay !== '--' ? 'bar' : ''}
              </td>
              <td className="px-3 py-2.5 text-right">{getStatusBadge(coolantReturnPressureFreshness)}</td>
            </tr>

            {/* 6. Coolant Inlet Pressure */}
            <tr className="hover:bg-slate-50/50 transition-colors">
              <td className="px-3 py-2.5 font-medium text-slate-800 text-xs">Coolant Inlet Pressure</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 font-semibold text-xs">
                {inletPressureDisplay} {inletPressureDisplay !== '--' ? 'bar' : ''}
              </td>
              <td className="px-3 py-2.5 text-right">{getStatusBadge(coolantInletPressureFreshness)}</td>
            </tr>

          </tbody>
        </table>
      </div>
    </div>
  );
};
