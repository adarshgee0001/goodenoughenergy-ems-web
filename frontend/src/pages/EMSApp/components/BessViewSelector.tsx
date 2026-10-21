/**
 * BessViewSelector
 *
 * A small accessible selector that lets a multi-BESS client choose which
 * view to display on the EMS Dashboard:
 *
 *   - null  → "All BESS — Site Overview" (aggregated site data, default)
 *   - string → bessAssetId of the selected individual BESS
 *
 * Rendered only when `bessAssets.length > 1`. Never shown on single-BESS sites.
 * Uses a native <select> for full keyboard support, mobile compatibility, and
 * zero extra dependencies. Styled consistently with the existing application.
 */

import type { DashboardBessAsset } from '../../../features/dashboard/dashboard.types';

interface BessViewSelectorProps {
  bessAssets: DashboardBessAsset[];
  selectedBessId: string | null;
  onSelect: (bessId: string | null) => void;
}

export function BessViewSelector({ bessAssets, selectedBessId, onSelect }: BessViewSelectorProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    onSelect(val === '' ? null : val);
  };

  return (
    <div className="flex items-center gap-2 mt-1">
      <label
        htmlFor="bess-view-selector"
        className="text-xs font-medium text-slate-500 whitespace-nowrap"
      >
        Viewing BESS:
      </label>
      <select
        id="bess-view-selector"
        value={selectedBessId ?? ''}
        onChange={handleChange}
        className="text-sm text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 cursor-pointer transition-colors duration-150 ease-out hover:border-slate-300"
        aria-label="Select BESS view"
      >
        <option value="">All BESS — Site Overview</option>
        {bessAssets.map((bess) => (
          <option key={bess.id} value={bess.id}>
            {bess.name}
          </option>
        ))}
      </select>
    </div>
  );
}
