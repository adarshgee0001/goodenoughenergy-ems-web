import React from 'react';
import { FileText, Info } from 'lucide-react';
import type { UserPreferences, ReportDateRange } from '../settings.types';

interface ReportPreferencesCardProps {
  preferences: UserPreferences;
  onUpdate: (updates: Partial<UserPreferences>) => void;
}

export const ReportPreferencesCard: React.FC<ReportPreferencesCardProps> = ({ preferences, onUpdate }) => {
  const dateRanges: ReportDateRange[] = ['Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days'];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Reports & Export Defaults</h2>
            <p className="text-xs text-slate-500">Choose how historical reports open by default</p>
          </div>
        </div>

        {/* Primary Control Section */}
        <div className="p-4 bg-slate-50/60 rounded-xl border border-slate-200/80">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <label
                htmlFor="default-reporting-range"
                className="text-xs font-semibold text-slate-700 uppercase tracking-wider block"
              >
                Default reporting range
              </label>
              <p className="text-xs text-slate-500 mt-1">
                Choose the initial date window for your reports.
              </p>
            </div>
            <div className="w-full md:w-52 shrink-0">
              <select
                id="default-reporting-range"
                value={preferences.defaultReportRange}
                onChange={(e) => onUpdate({ defaultReportRange: e.target.value as ReportDateRange })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all shadow-2xs cursor-pointer"
              >
                {dateRanges.map((range) => (
                  <option key={range} value={range}>
                    {range}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Supporting Information Footer */}
      <div className="mt-6 pt-4 border-t border-slate-100 bg-slate-50/70 -mx-6 -mb-6 p-4 rounded-b-xl">
        <div className="flex items-start gap-2.5 text-xs text-slate-500">
          <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <span className="leading-relaxed">
            This setting controls the initial date range only. You can choose another date range directly in Reports whenever needed.
          </span>
        </div>
      </div>
    </div>
  );
};


