import React, { useState } from 'react';
import { Zap, Check, Globe } from 'lucide-react';
import type { UserPreferences, PowerUnit, EnergyUnit, TimeFormat, DateFormat, TimezoneMode } from '../settings.types';
import type { DashboardBessAsset } from '../../dashboard/dashboard.types';
import {
  resolveBessPreview,
  formatDateTimeCustom,
  getTimezoneLabel,
  getBrowserTimezone,
} from '../settings.utils';
import { useUserSettings } from '../hooks/useUserSettings';

interface DisplayPreferencesCardProps {
  preferences: UserPreferences;
  onUpdate: (updates: Partial<UserPreferences>) => void;
  bessAssets?: DashboardBessAsset[] | null;
}

export const DisplayPreferencesCard: React.FC<DisplayPreferencesCardProps> = ({
  preferences,
  onUpdate,
  bessAssets,
}) => {
  const { activeSiteTimezone, resolvedTimezone } = useUserSettings();
  const [illustrativePreset, setIllustrativePreset] = useState<'storedge-025' | 'storedge-50'>('storedge-025');

  const browserTz = getBrowserTimezone();
  const effectiveLabel = getTimezoneLabel(resolvedTimezone);

  // Contextual BESS preview calculation
  const bessPreview = resolveBessPreview({
    bessAssets,
    powerUnit: preferences.powerUnit,
    energyUnit: preferences.energyUnit,
    fallbackPresetId: illustrativePreset,
  });

  const sampleDate = new Date();
  const dateTimePreview = formatDateTimeCustom(
    sampleDate,
    preferences.dateFormat,
    preferences.timeFormat,
    false,
    resolvedTimezone
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Display & Unit Preferences</h2>
            <p className="text-xs text-slate-500">Configure how power, energy, and timestamps are displayed</p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Power Unit Toggle */}
          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-2">
              Power Display Unit
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(['kW', 'MW'] as PowerUnit[]).map((unit) => {
                const isSelected = preferences.powerUnit === unit;
                return (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => onUpdate({ powerUnit: unit })}
                    className={`flex items-center justify-between px-3 sm:px-4 py-2.5 rounded-lg border text-xs sm:text-sm font-medium transition-all ${
                      isSelected
                        ? 'border-primary-600 bg-primary-50 text-primary-900 shadow-xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">{unit === 'kW' ? 'Kilowatts (kW)' : 'Megawatts (MW)'}</span>
                    {isSelected && <Check className="w-4 h-4 text-primary-600" />}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Telemetry remains stored in kW; presentation scales automatically.</p>
          </div>

          {/* Energy Unit Toggle */}
          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-2">
              Energy Display Unit
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(['kWh', 'MWh'] as EnergyUnit[]).map((unit) => {
                const isSelected = preferences.energyUnit === unit;
                return (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => onUpdate({ energyUnit: unit })}
                    className={`flex items-center justify-between px-3 sm:px-4 py-2.5 rounded-lg border text-xs sm:text-sm font-medium transition-all ${
                      isSelected
                        ? 'border-primary-600 bg-primary-50 text-primary-900 shadow-xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">{unit === 'kWh' ? 'Kilowatt-hours (kWh)' : 'Megawatt-hours (MWh)'}</span>
                    {isSelected && <Check className="w-4 h-4 text-primary-600" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Timezone Display Mode Toggle */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
                Timezone Display Mode
              </label>
              <span className="text-[11px] font-medium text-slate-500 inline-flex items-center gap-1">
                <Globe className="w-3 h-3 text-slate-400" />
                {preferences.timezoneMode === 'site' ? 'Site Time' : 'Browser Time'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(['site', 'browser'] as TimezoneMode[]).map((mode) => {
                const isSelected = preferences.timezoneMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onUpdate({ timezoneMode: mode })}
                    className={`flex items-center justify-between px-3 sm:px-4 py-2.5 rounded-lg border text-xs sm:text-sm font-medium transition-all text-left ${
                      isSelected
                        ? 'border-primary-600 bg-primary-50 text-primary-900 shadow-xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <span className="block font-semibold truncate text-xs sm:text-sm">
                        {mode === 'site' ? 'Site Timezone' : 'Browser Timezone'}
                      </span>
                      <span className="text-[11px] text-slate-500 block truncate">
                        {mode === 'site'
                          ? activeSiteTimezone ? activeSiteTimezone : 'Site Default'
                          : browserTz}
                      </span>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-primary-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {preferences.timezoneMode === 'site'
                ? activeSiteTimezone
                  ? `Timestamps rendered in ${activeSiteTimezone} (selected site's facility timezone).`
                  : `Site timezone not configured; defensively displaying in browser timezone (${browserTz}).`
                : `Timestamps rendered in ${browserTz} (your local device timezone).`}
            </p>
          </div>

          {/* Time Format */}
          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-2">
              Time Format
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(['12h', '24h'] as TimeFormat[]).map((format) => {
                const isSelected = preferences.timeFormat === format;
                return (
                  <button
                    key={format}
                    type="button"
                    onClick={() => onUpdate({ timeFormat: format })}
                    className={`flex items-center justify-between px-3 sm:px-4 py-2.5 rounded-lg border text-xs sm:text-sm font-medium transition-all ${
                      isSelected
                        ? 'border-primary-600 bg-primary-50 text-primary-900 shadow-xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">{format === '12h' ? '12-Hour (02:30 PM)' : '24-Hour (14:30)'}</span>
                    {isSelected && <Check className="w-4 h-4 text-primary-600" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date Format */}
          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-2">
              Date Format
            </label>
            <select
              value={preferences.dateFormat}
              onChange={(e) => onUpdate({ dateFormat: e.target.value as DateFormat })}
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            >
              <option value="DD MMM YYYY">DD MMM YYYY (e.g. 14 Oct 2026)</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD (e.g. 2026-10-14)</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY (e.g. 10/14/2026)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Live Preview Box */}
      <div className="mt-6 pt-5 border-t border-slate-100 bg-slate-50/70 -mx-6 -mb-6 p-4 rounded-b-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Live Format Preview
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                bessPreview.source === 'configured'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              {bessPreview.contextBadge}
            </span>
          </div>

          {/* If illustrative fallback, allow toggling between official GoodEnough Energy product presets */}
          {bessPreview.source === 'illustrative' && (
            <div className="flex items-center gap-1 self-start sm:self-auto">
              <span className="text-[10px] text-slate-400 mr-1">Preset:</span>
              <button
                type="button"
                onClick={() => setIllustrativePreset('storedge-025')}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                  illustrativePreset === 'storedge-025'
                    ? 'bg-primary-600 text-white shadow-2xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                StorEDGE 0.25
              </button>
              <button
                type="button"
                onClick={() => setIllustrativePreset('storedge-50')}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                  illustrativePreset === 'storedge-50'
                    ? 'bg-primary-600 text-white shadow-2xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                StorEDGE 5.0
              </button>
            </div>
          )}
        </div>

        {/* Asset / Model Context Line */}
        <div className="flex items-center justify-between text-xs mb-2.5 px-0.5">
          <span className="text-slate-600 truncate font-medium">
            <span className="text-slate-400">Previewing: </span>
            <span className="text-slate-800 font-semibold">{bessPreview.assetName}</span>
            {bessPreview.modelName && bessPreview.modelName !== '--' && bessPreview.modelName !== bessPreview.assetName && (
              <span className="text-slate-500 font-normal"> ({bessPreview.modelName})</span>
            )}
          </span>
          {bessPreview.contextDescription && (
            <span className="text-[10px] text-slate-400 hidden md:inline truncate ml-2" title={bessPreview.contextDescription}>
              {bessPreview.contextDescription}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-white p-2.5 rounded-md border border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 block text-[10px]">Power Rating</span>
              {bessPreview.isApparentPower && (
                <span className="text-[9px] font-medium text-amber-600 bg-amber-50 px-1 rounded">
                  Apparent (kVA/MVA)
                </span>
              )}
            </div>
            <span className="font-bold text-slate-800 text-sm">
              {bessPreview.powerRating.displayValue} {bessPreview.powerRating.unit}
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-md border border-slate-200">
            <span className="text-slate-400 block text-[10px]">Energy Capacity</span>
            <span className="font-bold text-slate-800 text-sm">
              {bessPreview.energyCapacity.displayValue} {bessPreview.energyCapacity.unit}
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-md border border-slate-200">
            <span className="text-slate-400 block text-[10px]">Timestamp Format</span>
            <span className="font-medium text-slate-800 text-xs truncate block" title={dateTimePreview}>
              {dateTimePreview}
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-md border border-slate-200">
            <span className="text-slate-400 block text-[10px]">Active Timezone</span>
            <span className="font-medium text-slate-800 text-xs truncate block" title={effectiveLabel}>
              {effectiveLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
