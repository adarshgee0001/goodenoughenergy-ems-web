import { describe, it, expect } from 'vitest';
import {
  formatEnergyDisplay,
  formatPowerDisplay,
} from '../../../frontend/src/features/settings/settings.utils';
import type { EnergyUnit, PowerUnit } from '../../../frontend/src/features/settings/settings.types';
import type { DashboardBessAsset } from '../../../frontend/src/features/dashboard/dashboard.types';

describe('Phase 1: Apply Display & Unit Preferences Across Reports and BESS/Site Screens', () => {
  // --------------------------------------------------------------------------
  // 1. Reports charge-difference card switches from kWh to MWh correctly
  // --------------------------------------------------------------------------
  describe('1. Reports charge-difference card formatting', () => {
    it('formats charge difference in kWh and converts reactively to MWh with single scaling', () => {
      const canonicalChargeDiff = 1250; // Canonical kWh

      const kwhResult = formatEnergyDisplay(canonicalChargeDiff, 'kWh');
      expect(kwhResult).toEqual({ displayValue: '1250', unit: 'kWh' });
      expect(`${kwhResult.displayValue} ${kwhResult.unit}`).toBe('1250 kWh');

      const mwhResult = formatEnergyDisplay(canonicalChargeDiff, 'MWh');
      expect(mwhResult).toEqual({ displayValue: '1.25', unit: 'MWh' });
      expect(`${mwhResult.displayValue} ${mwhResult.unit}`).toBe('1.25 MWh');
    });

    it('preserves negative signs and zero values for charge difference', () => {
      const negVal = -350.5;
      expect(formatEnergyDisplay(negVal, 'kWh')).toEqual({ displayValue: '-350.5', unit: 'kWh' });
      expect(formatEnergyDisplay(negVal, 'MWh')).toEqual({ displayValue: '-0.35', unit: 'MWh' });

      const zeroVal = 0;
      expect(formatEnergyDisplay(zeroVal, 'kWh')).toEqual({ displayValue: '0', unit: 'kWh' });
      expect(formatEnergyDisplay(zeroVal, 'MWh')).toEqual({ displayValue: '0', unit: 'MWh' });
    });
  });

  // --------------------------------------------------------------------------
  // 2. Reports discharge-difference card switches from kWh to MWh correctly
  // --------------------------------------------------------------------------
  describe('2. Reports discharge-difference card formatting', () => {
    it('formats discharge difference in kWh and switches to MWh correctly', () => {
      const canonicalDischargeDiff = 500; // Canonical kWh

      const kwhResult = formatEnergyDisplay(canonicalDischargeDiff, 'kWh');
      expect(kwhResult).toEqual({ displayValue: '500', unit: 'kWh' });
      expect(`${kwhResult.displayValue} ${kwhResult.unit}`).toBe('500 kWh');

      const mwhResult = formatEnergyDisplay(canonicalDischargeDiff, 'MWh');
      expect(mwhResult).toEqual({ displayValue: '0.5', unit: 'MWh' });
      expect(`${mwhResult.displayValue} ${mwhResult.unit}`).toBe('0.5 MWh');
    });

    it('handles fractional precision without double rounding or double scaling', () => {
      const precisionVal = 1234.5678;
      const mwhResult = formatEnergyDisplay(precisionVal, 'MWh');
      // 1234.5678 / 1000 = 1.2345678 -> 1.23
      expect(mwhResult).toEqual({ displayValue: '1.23', unit: 'MWh' });
    });
  });

  // --------------------------------------------------------------------------
  // 3. BESSPage displays matching dynamic capacity headers and values
  // --------------------------------------------------------------------------
  describe('3. BESSPage dynamic capacity header and row values', () => {
    const assets: DashboardBessAsset[] = [
      { id: '1', name: 'Alpha 5.0', assetIdentifier: 'BESS-01', energyCapacity: 5000 },
      { id: '2', name: 'Beta 0.25', assetIdentifier: 'BESS-02', energyCapacity: 250 },
    ];

    it('matches dynamic table header with configured energyUnit preference', () => {
      const getHeader = (energyUnit: EnergyUnit) => `Capacity (${energyUnit})`;
      expect(getHeader('kWh')).toBe('Capacity (kWh)');
      expect(getHeader('MWh')).toBe('Capacity (MWh)');
    });

    it('formats asset capacity rows consistently with selected unit and thousands separators', () => {
      const formatCell = (val: number | null | undefined, unit: EnergyUnit) => {
        const formatted = formatEnergyDisplay(val, unit);
        return formatted.displayValue !== '--' ? Number(formatted.displayValue).toLocaleString() : '--';
      };

      // In kWh mode
      expect(formatCell(assets[0].energyCapacity, 'kWh')).toBe('5,000');
      expect(formatCell(assets[1].energyCapacity, 'kWh')).toBe('250');

      // In MWh mode
      expect(formatCell(assets[0].energyCapacity, 'MWh')).toBe('5');
      expect(formatCell(assets[1].energyCapacity, 'MWh')).toBe('0.25');
    });
  });

  // --------------------------------------------------------------------------
  // 4. BESS details format today\'s charge/discharge values independently
  // --------------------------------------------------------------------------
  describe('4. BESS details Today Charge/Discharge formatting', () => {
    it('formats today charge and discharge values independently with shared unit', () => {
      const telemetry = {
        todayChargeEnergy: 150,
        todayDischargeEnergy: 275,
      };

      const kwhCharge = formatEnergyDisplay(telemetry.todayChargeEnergy, 'kWh');
      const kwhDischarge = formatEnergyDisplay(telemetry.todayDischargeEnergy, 'kWh');
      const kwhDisplay = `${kwhCharge.displayValue} / ${kwhDischarge.displayValue} ${kwhCharge.unit}`;
      expect(kwhDisplay).toBe('150 / 275 kWh');

      const mwhCharge = formatEnergyDisplay(telemetry.todayChargeEnergy, 'MWh');
      const mwhDischarge = formatEnergyDisplay(telemetry.todayDischargeEnergy, 'MWh');
      const mwhDisplay = `${mwhCharge.displayValue} / ${mwhDischarge.displayValue} ${mwhCharge.unit}`;
      expect(mwhDisplay).toBe('0.15 / 0.28 MWh');
    });

    it('preserves independence when one value is missing', () => {
      const telemetryPartial = {
        todayChargeEnergy: 250,
        todayDischargeEnergy: undefined,
      };

      const chargeFmt = formatEnergyDisplay(telemetryPartial.todayChargeEnergy, 'kWh');
      const dischargeFmt = formatEnergyDisplay(telemetryPartial.todayDischargeEnergy, 'kWh');
      const display = `${chargeFmt.displayValue} / ${dischargeFmt.displayValue} ${chargeFmt.unit}`;
      expect(display).toBe('250 / -- kWh');
      expect(dischargeFmt.displayValue).toBe('--');
    });
  });

  // --------------------------------------------------------------------------
  // 5. BESS details format accumulated charge/discharge values independently
  // --------------------------------------------------------------------------
  describe('5. BESS details Accumulated Charge/Discharge formatting', () => {
    it('formats accumulated charge and discharge independently with high magnitude numbers', () => {
      const telemetry = {
        accChargeEnergy: 125000,
        accDischargeEnergy: 118450,
      };

      const kwhCharge = formatEnergyDisplay(telemetry.accChargeEnergy, 'kWh');
      const kwhDischarge = formatEnergyDisplay(telemetry.accDischargeEnergy, 'kWh');
      expect(`${kwhCharge.displayValue} / ${kwhDischarge.displayValue} ${kwhCharge.unit}`).toBe('125000 / 118450 kWh');

      const mwhCharge = formatEnergyDisplay(telemetry.accChargeEnergy, 'MWh');
      const mwhDischarge = formatEnergyDisplay(telemetry.accDischargeEnergy, 'MWh');
      expect(`${mwhCharge.displayValue} / ${mwhDischarge.displayValue} ${mwhCharge.unit}`).toBe('125 / 118.45 MWh');
    });

    it('retains missing value formatting when accChargeEnergy is null', () => {
      const telemetry = {
        accChargeEnergy: null,
        accDischargeEnergy: 95000,
      };

      const mwhCharge = formatEnergyDisplay(telemetry.accChargeEnergy, 'MWh');
      const mwhDischarge = formatEnergyDisplay(telemetry.accDischargeEnergy, 'MWh');
      expect(`${mwhCharge.displayValue} / ${mwhDischarge.displayValue} ${mwhCharge.unit}`).toBe('-- / 95 MWh');
    });
  });

  // --------------------------------------------------------------------------
  // 6. Site-level energy capacity and power rating format correctly
  // --------------------------------------------------------------------------
  describe('6. Site-level energy capacity and power rating formatting', () => {
    const totalEnergyKwh = 5250;
    const totalPowerKw = 2625;

    it('formats site KPIs in kWh and kW', () => {
      const energyFmt = formatEnergyDisplay(totalEnergyKwh, 'kWh');
      const powerFmt = formatPowerDisplay(totalPowerKw, 'kW');

      const energyDisplay = energyFmt.displayValue !== '--' ? `${Number(energyFmt.displayValue).toLocaleString()} ${energyFmt.unit}` : '--';
      const powerDisplay = powerFmt.displayValue !== '--' ? `${Number(powerFmt.displayValue).toLocaleString()} ${powerFmt.unit}` : '--';

      expect(energyDisplay).toBe('5,250 kWh');
      expect(powerDisplay).toBe('2,625 kW');
    });

    it('formats site KPIs dynamically when units are switched to MWh and MW', () => {
      const energyFmt = formatEnergyDisplay(totalEnergyKwh, 'MWh');
      const powerFmt = formatPowerDisplay(totalPowerKw, 'MW');

      const energyDisplay = energyFmt.displayValue !== '--' ? `${Number(energyFmt.displayValue).toLocaleString()} ${energyFmt.unit}` : '--';
      const powerDisplay = powerFmt.displayValue !== '--' ? `${Number(powerFmt.displayValue).toLocaleString()} ${powerFmt.unit}` : '--';

      expect(energyDisplay).toBe('5.25 MWh');
      expect(powerDisplay).toBe('2.63 MW');
    });
  });

  // --------------------------------------------------------------------------
  // 7. Connected BESS table rows retain individual capacities while units change
  // --------------------------------------------------------------------------
  describe('7. Connected BESS table rows and headers in SiteDetailsPage', () => {
    const assets: DashboardBessAsset[] = [
      { id: 'b1', name: 'Unit 1', assetIdentifier: 'B1', energyCapacity: 5000 },
      { id: 'b2', name: 'Unit 2', assetIdentifier: 'B2', energyCapacity: 250 },
    ];

    it('preserves individual asset rows without summing into row cells', () => {
      const renderCells = (unit: EnergyUnit) => {
        return assets.map(a => {
          const fmt = formatEnergyDisplay(a.energyCapacity, unit);
          return fmt.displayValue !== '--' ? Number(fmt.displayValue).toLocaleString() : '--';
        });
      };

      expect(renderCells('kWh')).toEqual(['5,000', '250']);
      expect(renderCells('MWh')).toEqual(['5', '0.25']);
    });
  });

  // --------------------------------------------------------------------------
  // 8. Single-BESS and multi-BESS aggregation results remain unchanged
  // --------------------------------------------------------------------------
  describe('8. Aggregation integrity for single-BESS and multi-BESS sites', () => {
    function computeSiteAggregates(assetList: DashboardBessAsset[]) {
      const hasAnyEnergyCapacity = assetList.some(a => a.energyCapacity !== null && a.energyCapacity !== undefined);
      const hasAnyPowerRating = assetList.some(a => a.powerRating !== null && a.powerRating !== undefined);

      const totalEnergyCapacity = hasAnyEnergyCapacity
        ? assetList.reduce((sum, a) => sum + (a.energyCapacity || 0), 0)
        : null;

      const totalPowerRating = hasAnyPowerRating
        ? assetList.reduce((sum, a) => sum + (a.powerRating || 0), 0)
        : null;

      return { totalEnergyCapacity, totalPowerRating };
    }

    it('computes single-BESS site aggregation canonically before presentation formatting', () => {
      const singleBess: DashboardBessAsset[] = [
        { id: 'b1', name: 'BESS 01', assetIdentifier: 'B01', energyCapacity: 250, powerRating: 125 },
      ];

      const agg = computeSiteAggregates(singleBess);
      expect(agg.totalEnergyCapacity).toBe(250);
      expect(agg.totalPowerRating).toBe(125);

      // Verify formatting does not mutate the aggregate
      const energyMwh = formatEnergyDisplay(agg.totalEnergyCapacity, 'MWh');
      expect(energyMwh).toEqual({ displayValue: '0.25', unit: 'MWh' });
      expect(agg.totalEnergyCapacity).toBe(250); // Canonical unchanged
    });

    it('computes multi-BESS site aggregation canonically without summing formatted strings', () => {
      const multiBess: DashboardBessAsset[] = [
        { id: 'b1', name: 'BESS 01', assetIdentifier: 'B01', energyCapacity: 5000, powerRating: 2500 },
        { id: 'b2', name: 'BESS 02', assetIdentifier: 'B02', energyCapacity: 250, powerRating: 125 },
      ];

      const agg = computeSiteAggregates(multiBess);
      expect(agg.totalEnergyCapacity).toBe(5250);
      expect(agg.totalPowerRating).toBe(2625);

      const energyMwh = formatEnergyDisplay(agg.totalEnergyCapacity, 'MWh');
      const powerMw = formatPowerDisplay(agg.totalPowerRating, 'MW');

      expect(energyMwh).toEqual({ displayValue: '5.25', unit: 'MWh' });
      expect(powerMw).toEqual({ displayValue: '2.63', unit: 'MW' });
    });

    it('resolves context-aware titles and subtitles: single-BESS shows Energy Capacity/Power Rating without subtitle or Total', () => {
      function getSiteDetailKpiCards(assetCount: number) {
        const isSingleBess = assetCount === 1;
        const isMultiBess = assetCount > 1;

        const energyCapacityTitle = isSingleBess ? 'Energy Capacity' : 'Total Energy Capacity';
        const powerRatingTitle = isSingleBess ? 'Power Rating' : 'Total Power Rating';

        const energyCapacitySubtitle = isMultiBess ? 'Sum of asset ratings' : undefined;
        const powerRatingSubtitle = isMultiBess ? 'Sum of asset ratings' : undefined;

        return {
          energyCapacityTitle,
          powerRatingTitle,
          energyCapacitySubtitle,
          powerRatingSubtitle,
        };
      }

      // 1. Single-BESS site (e.g. New Hercules Site with 1 BESS)
      const single = getSiteDetailKpiCards(1);
      expect(single.energyCapacityTitle).toBe('Energy Capacity');
      expect(single.powerRatingTitle).toBe('Power Rating');
      expect(single.energyCapacitySubtitle).toBeUndefined();
      expect(single.powerRatingSubtitle).toBeUndefined();

      // 2. Multi-BESS site
      const multi = getSiteDetailKpiCards(2);
      expect(multi.energyCapacityTitle).toBe('Total Energy Capacity');
      expect(multi.powerRatingTitle).toBe('Total Power Rating');
      expect(multi.energyCapacitySubtitle).toBe('Sum of asset ratings');
      expect(multi.powerRatingSubtitle).toBe('Sum of asset ratings');

      // 3. Zero / empty assets site
      const empty = getSiteDetailKpiCards(0);
      expect(empty.energyCapacityTitle).toBe('Total Energy Capacity');
      expect(empty.powerRatingTitle).toBe('Total Power Rating');
      expect(empty.energyCapacitySubtitle).toBeUndefined();
      expect(empty.powerRatingSubtitle).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // 9. Missing and zero values remain distinguishable
  // --------------------------------------------------------------------------
  describe('9. Missing vs zero value representation', () => {
    it('distinguishes genuine zero from null and undefined for energy', () => {
      const zeroFmt = formatEnergyDisplay(0, 'kWh');
      expect(zeroFmt).toEqual({ displayValue: '0', unit: 'kWh' });

      const nullFmt = formatEnergyDisplay(null, 'kWh');
      expect(nullFmt).toEqual({ displayValue: '--', unit: 'kWh' });

      const undefFmt = formatEnergyDisplay(undefined, 'MWh');
      expect(undefFmt).toEqual({ displayValue: '--', unit: 'MWh' });
    });

    it('distinguishes genuine zero from null and undefined for power', () => {
      const zeroFmt = formatPowerDisplay(0, 'kW');
      expect(zeroFmt).toEqual({ displayValue: '0', unit: 'kW' });

      const nullFmt = formatPowerDisplay(null, 'kW');
      expect(nullFmt).toEqual({ displayValue: '--', unit: 'kW' });

      const undefFmt = formatPowerDisplay(undefined, 'MW');
      expect(undefFmt).toEqual({ displayValue: '--', unit: 'MW' });
    });

    it('returns null aggregate if all assets have null/undefined capacity, preserving "--"', () => {
      const missingAssets: DashboardBessAsset[] = [
        { id: 'b1', name: 'B1', assetIdentifier: 'B1', energyCapacity: null, powerRating: undefined },
      ];

      const hasAnyEnergyCapacity = missingAssets.some(a => a.energyCapacity !== null && a.energyCapacity !== undefined);
      const totalEnergyCapacity = hasAnyEnergyCapacity
        ? missingAssets.reduce((sum, a) => sum + (a.energyCapacity || 0), 0)
        : null;

      expect(totalEnergyCapacity).toBeNull();
      const fmt = formatEnergyDisplay(totalEnergyCapacity, 'kWh');
      expect(fmt.displayValue).toBe('--');
    });

    it('preserves 0 aggregate if an asset has 0 capacity', () => {
      const zeroAssets: DashboardBessAsset[] = [
        { id: 'b1', name: 'B1', assetIdentifier: 'B1', energyCapacity: 0, powerRating: 0 },
      ];

      const hasAnyEnergyCapacity = zeroAssets.some(a => a.energyCapacity !== null && a.energyCapacity !== undefined);
      const totalEnergyCapacity = hasAnyEnergyCapacity
        ? zeroAssets.reduce((sum, a) => sum + (a.energyCapacity || 0), 0)
        : null;

      expect(totalEnergyCapacity).toBe(0);
      const fmt = formatEnergyDisplay(totalEnergyCapacity, 'kWh');
      expect(fmt.displayValue).toBe('0');
    });
  });

  // --------------------------------------------------------------------------
  // 10. Preference updates rerender affected components without requiring a page reload
  // --------------------------------------------------------------------------
  describe('10. Reactive preference state transitions', () => {
    it('updates formatters dynamically when preferences switch between kWh and MWh', () => {
      // Simulating reactive context switch
      let currentUnit: EnergyUnit = 'kWh';
      const format = (v: number) => formatEnergyDisplay(v, currentUnit);

      expect(format(5000)).toEqual({ displayValue: '5000', unit: 'kWh' });

      // User changes preference in Settings
      currentUnit = 'MWh';
      expect(format(5000)).toEqual({ displayValue: '5', unit: 'MWh' });

      // User changes back
      currentUnit = 'kWh';
      expect(format(5000)).toEqual({ displayValue: '5000', unit: 'kWh' });
    });

    it('updates power formatter dynamically when preferences switch between kW and MW', () => {
      let currentUnit: PowerUnit = 'kW';
      const format = (v: number) => formatPowerDisplay(v, currentUnit);

      expect(format(2500)).toEqual({ displayValue: '2500', unit: 'kW' });

      // User changes preference in Settings
      currentUnit = 'MW';
      expect(format(2500)).toEqual({ displayValue: '2.5', unit: 'MW' });
    });
  });

  // --------------------------------------------------------------------------
  // 11. PCS Operations Panel: Active Power card shows unsigned magnitude in user-selected power unit (kW / MW) with signed operating state
  // --------------------------------------------------------------------------
  describe('11. PCS Operations Panel Active Power card presentation', () => {
    function resolvePcsActivePowerCard(bessPower: number | undefined | null, powerUnit: PowerUnit = 'kW', pcsState?: string) {
      const activePowerFmt = formatPowerDisplay(
        bessPower !== undefined && bessPower !== null ? Math.abs(bessPower) : undefined,
        powerUnit,
        4
      );
      const activePowerDisplay = activePowerFmt.displayValue !== '--'
        ? `${activePowerFmt.displayValue} ${activePowerFmt.unit}`
        : '--';

      const stateLabel = bessPower !== undefined && bessPower !== null && bessPower > 0
        ? 'CHARGING ↑'
        : bessPower !== undefined && bessPower !== null && bessPower < 0
          ? 'DISCHARGING ↓'
          : 'IDLE';

      const stateBadgeClass = bessPower !== undefined && bessPower !== null && bessPower > 0
        ? 'bg-blue-100 text-blue-800'
        : bessPower !== undefined && bessPower !== null && bessPower < 0
          ? 'bg-amber-100 text-amber-800'
          : 'bg-slate-100 text-slate-800';

      return {
        heading: 'Active Power',
        activePowerDisplay,
        stateLabel,
        stateBadgeClass,
        stateText: `State: ${pcsState ?? '--'}`,
      };
    }

    it('renders Active Power magnitude "5 kW" without leading "+" alongside CHARGING ↑ when power is +5.0 in kW mode', () => {
      const card = resolvePcsActivePowerCard(5.0, 'kW', 'RUNNING');
      expect(card.heading).toBe('Active Power');
      expect(card.activePowerDisplay).toBe('5 kW');
      expect(card.activePowerDisplay).not.toContain('+');
      expect(card.activePowerDisplay).not.toContain('-');
      expect(card.stateLabel).toBe('CHARGING ↑');
      expect(card.stateBadgeClass).toBe('bg-blue-100 text-blue-800');
      expect(card.stateText).toBe('State: RUNNING');
    });

    it('renders Active Power magnitude "0.1 kW" without leading "-" alongside DISCHARGING ↓ when power is -0.1 in kW mode', () => {
      const card = resolvePcsActivePowerCard(-0.1, 'kW', '--');
      expect(card.heading).toBe('Active Power');
      expect(card.activePowerDisplay).toBe('0.1 kW');
      expect(card.activePowerDisplay).not.toContain('-');
      expect(card.activePowerDisplay).not.toContain('+');
      expect(card.stateLabel).toBe('DISCHARGING ↓');
      expect(card.stateBadgeClass).toBe('bg-amber-100 text-amber-800');
      expect(card.stateText).toBe('State: --');
    });

    it('converts canonical kW value to MW and displays "0.0001 MW" without sign alongside DISCHARGING ↓ in MW mode', () => {
      const card = resolvePcsActivePowerCard(-0.1, 'MW', '--');
      expect(card.heading).toBe('Active Power');
      expect(card.activePowerDisplay).toBe('0.0001 MW');
      expect(card.activePowerDisplay).not.toContain('-');
      expect(card.activePowerDisplay).not.toContain('+');
      expect(card.stateLabel).toBe('DISCHARGING ↓');
      expect(card.stateBadgeClass).toBe('bg-amber-100 text-amber-800');
      expect(card.stateText).toBe('State: --');
    });

    it('converts positive power to MW correctly (e.g. 5000 kW -> 5 MW) alongside CHARGING ↑', () => {
      const card = resolvePcsActivePowerCard(5000, 'MW', 'RUNNING');
      expect(card.heading).toBe('Active Power');
      expect(card.activePowerDisplay).toBe('5 MW');
      expect(card.stateLabel).toBe('CHARGING ↑');
      expect(card.stateBadgeClass).toBe('bg-blue-100 text-blue-800');
    });

    it('renders Active Power magnitude "0 kW" / "0 MW" alongside IDLE when power is 0.0', () => {
      const cardKw = resolvePcsActivePowerCard(0, 'kW');
      expect(cardKw.heading).toBe('Active Power');
      expect(cardKw.activePowerDisplay).toBe('0 kW');
      expect(cardKw.stateLabel).toBe('IDLE');
      expect(cardKw.stateBadgeClass).toBe('bg-slate-100 text-slate-800');

      const cardMw = resolvePcsActivePowerCard(0, 'MW');
      expect(cardMw.heading).toBe('Active Power');
      expect(cardMw.activePowerDisplay).toBe('0 MW');
      expect(cardMw.stateLabel).toBe('IDLE');
      expect(cardMw.stateBadgeClass).toBe('bg-slate-100 text-slate-800');
    });

    it('renders "--" when power is undefined or null in both kW and MW modes', () => {
      const cardUndefKw = resolvePcsActivePowerCard(undefined, 'kW');
      expect(cardUndefKw.heading).toBe('Active Power');
      expect(cardUndefKw.activePowerDisplay).toBe('--');
      expect(cardUndefKw.stateLabel).toBe('IDLE');
      expect(cardUndefKw.stateBadgeClass).toBe('bg-slate-100 text-slate-800');

      const cardNullMw = resolvePcsActivePowerCard(null, 'MW');
      expect(cardNullMw.heading).toBe('Active Power');
      expect(cardNullMw.activePowerDisplay).toBe('--');
      expect(cardNullMw.stateLabel).toBe('IDLE');
    });

    it('reactively switches between kW and MW upon preference changes', () => {
      let unit: PowerUnit = 'kW';
      const format = (v: number) => resolvePcsActivePowerCard(v, unit);

      // User has kW selected
      expect(format(-125).activePowerDisplay).toBe('125 kW');

      // User changes preference to MW in settings
      unit = 'MW';
      expect(format(-125).activePowerDisplay).toBe('0.125 MW');

      // User changes back to kW
      unit = 'kW';
      expect(format(-125).activePowerDisplay).toBe('125 kW');
    });

    it('applies identically across single-BESS and multi-BESS asset contexts', () => {
      // Single-BESS asset context (e.g. New Hercules Site with 1 connected BESS, discharging at -0.1 kW)
      const singleBessKw = resolvePcsActivePowerCard(-0.1, 'kW');
      expect(singleBessKw.activePowerDisplay).toBe('0.1 kW');
      expect(singleBessKw.stateLabel).toBe('DISCHARGING ↓');

      const singleBessMw = resolvePcsActivePowerCard(-0.1, 'MW');
      expect(singleBessMw.activePowerDisplay).toBe('0.0001 MW');
      expect(singleBessMw.stateLabel).toBe('DISCHARGING ↓');

      // Multi-BESS asset context (e.g. Albin Poly Main Site with multiple BESS assets)
      const multiBessKw = resolvePcsActivePowerCard(125, 'kW', 'RUNNING');
      expect(multiBessKw.activePowerDisplay).toBe('125 kW');
      expect(multiBessKw.stateLabel).toBe('CHARGING ↑');

      const multiBessMw = resolvePcsActivePowerCard(125, 'MW', 'RUNNING');
      expect(multiBessMw.activePowerDisplay).toBe('0.125 MW');
      expect(multiBessMw.stateLabel).toBe('CHARGING ↑');
    });
  });
});
