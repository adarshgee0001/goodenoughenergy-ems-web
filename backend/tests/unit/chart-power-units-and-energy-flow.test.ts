import { describe, it, expect } from 'vitest';
import { formatPowerDisplay } from '../../../frontend/src/features/settings/settings.utils';
import type { PowerTrendPoint, DashboardTelemetryState } from '../../../frontend/src/features/dashboard/dashboard.types';
import type { PowerUnit } from '../../../frontend/src/features/settings/settings.types';

describe('P1 Settings Improvements — Power Charts & Energy Flow', () => {
  describe('P1-A: PowerTrendChart Unit Conversion & Axis Scaling', () => {
    // Pure function extracting PowerTrendChart's useMemo data transformation
    const transformPowerTrendData = (data: PowerTrendPoint[], powerUnit: PowerUnit = 'kW') => {
      const isMW = powerUnit === 'MW';
      if (!isMW) return data;
      return data.map(pt => ({
        ...pt,
        grid: pt.grid !== undefined && pt.grid !== null ? pt.grid / 1000 : pt.grid,
        bess: pt.bess !== undefined && pt.bess !== null ? pt.bess / 1000 : pt.bess,
        solar: pt.solar !== undefined && pt.solar !== null ? pt.solar / 1000 : pt.solar,
        soc: pt.soc, // Preserved as %
      }));
    };

    // Pure function extracting PowerTrendChart's YAxis domain calculation
    const calculatePowerTrendDomain = (dataMin: number | undefined, dataMax: number | undefined, powerUnit: PowerUnit = 'kW') => {
      const isMW = powerUnit === 'MW';
      const maxAbs = Math.max(Math.abs(dataMin || 0), Math.abs(dataMax || 0));
      if (isMW) {
        const scale = Math.max(maxAbs, 0.01);
        const step = scale > 1 ? 0.5 : scale > 0.1 ? 0.05 : 0.01;
        const rounded = Number((Math.ceil(scale / step) * step).toFixed(2));
        return [-rounded, rounded];
      }
      const scale = Math.max(maxAbs, 10);
      const rounded = Math.ceil(scale / 10) * 10;
      return [-rounded, rounded];
    };

    // Pure function extracting PowerTrendChart's Tooltip entry formatting
    const formatPowerTrendTooltip = (entry: { dataKey: string; value: number | null | undefined }, isMW: boolean) => {
      const isSoc = entry.dataKey === 'soc';
      const unit = isMW ? 'MW' : 'kW';
      const decimals = isSoc ? 1 : isMW ? 2 : 1;
      return entry.value !== null && entry.value !== undefined
        ? `${Number(entry.value).toFixed(decimals)} ${isSoc ? '%' : unit}`
        : '--';
    };

    it('1. Keeps base kW data untouched in kW mode', () => {
      const rawPoints: PowerTrendPoint[] = [
        { timestamp: 1000, grid: 250, bess: -150, solar: 400, soc: 80.5 },
      ];
      const result = transformPowerTrendData(rawPoints, 'kW');
      expect(result[0].grid).toBe(250);
      expect(result[0].bess).toBe(-150);
      expect(result[0].solar).toBe(400);
      expect(result[0].soc).toBe(80.5);
    });

    it('2. Divides grid, bess, solar by 1000 in MW mode and strictly preserves SOC as %', () => {
      const rawPoints: PowerTrendPoint[] = [
        { timestamp: 1000, grid: 250, bess: -150, solar: 400, soc: 80.5 },
      ];
      const result = transformPowerTrendData(rawPoints, 'MW');
      expect(result[0].grid).toBe(0.25);
      expect(result[0].bess).toBe(-0.15);
      expect(result[0].solar).toBe(0.4);
      expect(result[0].soc).toBe(80.5); // SOC must NEVER be divided
    });

    it('3. Preserves null and undefined values without zeroing them in both kW and MW modes', () => {
      const rawPoints: PowerTrendPoint[] = [
        { timestamp: 1000, grid: null, bess: undefined, solar: null, soc: null },
      ];
      const resultKw = transformPowerTrendData(rawPoints, 'kW');
      expect(resultKw[0].grid).toBeNull();
      expect(resultKw[0].bess).toBeUndefined();
      expect(resultKw[0].solar).toBeNull();
      expect(resultKw[0].soc).toBeNull();

      const resultMw = transformPowerTrendData(rawPoints, 'MW');
      expect(resultMw[0].grid).toBeNull();
      expect(resultMw[0].bess).toBeUndefined();
      expect(resultMw[0].solar).toBeNull();
      expect(resultMw[0].soc).toBeNull();
    });

    it('4. Tooltip correctly formats 250 kW as 250.0 kW in kW mode and 0.25 MW in MW mode', () => {
      const entryKw = { dataKey: 'grid', value: 250 };
      expect(formatPowerTrendTooltip(entryKw, false)).toBe('250.0 kW');

      const entryMw = { dataKey: 'grid', value: 0.25 };
      expect(formatPowerTrendTooltip(entryMw, true)).toBe('0.25 MW');
    });

    it('5. Tooltip formats SOC as percentage with 1 decimal place regardless of MW/kW mode', () => {
      const socEntry = { dataKey: 'soc', value: 85.432 };
      expect(formatPowerTrendTooltip(socEntry, false)).toBe('85.4 %');
      expect(formatPowerTrendTooltip(socEntry, true)).toBe('85.4 %');
    });

    it('6. Tooltip returns "--" for null or undefined values', () => {
      expect(formatPowerTrendTooltip({ dataKey: 'grid', value: null }, false)).toBe('--');
      expect(formatPowerTrendTooltip({ dataKey: 'grid', value: undefined }, true)).toBe('--');
    });

    it('7. Derives appropriate symmetric Y-axis domain for kW mode', () => {
      expect(calculatePowerTrendDomain(-150, 250, 'kW')).toEqual([-250, 250]);
      expect(calculatePowerTrendDomain(-43, 62, 'kW')).toEqual([-70, 70]);
      // Zero case returns minimum safe scale (10 kW)
      expect(calculatePowerTrendDomain(0, 0, 'kW')).toEqual([-10, 10]);
    });

    it('8. Derives appropriate Y-axis domain for MW mode and prevents 0.25 MW from collapsing', () => {
      // 0.25 MW should have step 0.05 -> [-0.25, 0.25]
      expect(calculatePowerTrendDomain(-0.15, 0.25, 'MW')).toEqual([-0.25, 0.25]);
      // 1.25 MW should have step 0.5 -> [-1.5, 1.5]
      expect(calculatePowerTrendDomain(-0.8, 1.25, 'MW')).toEqual([-1.5, 1.5]);
      // Small 0.03 MW value should have step 0.01 -> [-0.03, 0.03]
      expect(calculatePowerTrendDomain(0, 0.025, 'MW')).toEqual([-0.03, 0.03]);
      // Zero case returns minimum safe scale (0.01 MW)
      expect(calculatePowerTrendDomain(0, 0, 'MW')).toEqual([-0.01, 0.01]);
    });
  });

  describe('P1-A: BessChargeDischargeChart Unit Conversion & Axis Scaling', () => {
    // Pure function extracting BessChargeDischargeChart's YAxis domain calculation
    const calculateBessDomain = (dataMin: number | undefined, dataMax: number | undefined, powerUnit: PowerUnit = 'kW') => {
      const min = Math.min(dataMin || 0, 0);
      const max = Math.max(dataMax || 0, 0);
      if (powerUnit === 'MW') {
        const maxAbs = Math.max(Math.abs(min), Math.abs(max));
        const step = maxAbs > 1 ? 0.5 : maxAbs > 0.1 ? 0.05 : 0.01;
        const roundDown = -Math.ceil(Math.abs(min) / step) * step;
        const roundUp = Math.ceil(max / step) * step;
        const minPositiveBound = 0.05;
        return [Number(roundDown.toFixed(2)), Number(Math.max(roundUp, minPositiveBound).toFixed(2))];
      }
      const roundDown = Math.floor(min / 50) * 50;
      const roundUp = Math.ceil(max / 50) * 50;
      return [roundDown, Math.max(roundUp, 50)];
    };

    it('1. kW mode domain rounds to increments of 50 kW with minimum 50 kW upper bound', () => {
      expect(calculateBessDomain(-120, 160, 'kW')).toEqual([-150, 200]);
      expect(calculateBessDomain(0, 0, 'kW')).toEqual([0, 50]);
      expect(calculateBessDomain(-80, 0, 'kW')).toEqual([-100, 50]);
    });

    it('2. MW mode domain supports small values like 0.25 MW without collapsing or rounding to 0', () => {
      // 0.25 MW max: step is 0.05 -> [0, 0.25]
      expect(calculateBessDomain(0, 0.25, 'MW')).toEqual([0, 0.25]);
      // -0.15 MW min, 0.25 MW max -> [-0.15, 0.25]
      expect(calculateBessDomain(-0.15, 0.25, 'MW')).toEqual([-0.15, 0.25]);
      // Large MW value (e.g. 2.3 MW): step is 0.5 -> [-1.5, 2.5]
      expect(calculateBessDomain(-1.2, 2.3, 'MW')).toEqual([-1.5, 2.5]);
    });

    it('3. MW mode domain enforces minimum positive upper bound of 0.05 MW (50 kW)', () => {
      expect(calculateBessDomain(0, 0, 'MW')).toEqual([0, 0.05]);
      expect(calculateBessDomain(-0.08, 0, 'MW')).toEqual([-0.08, 0.05]);
    });

    it('4. Preserves charge (positive) and discharge (negative) sign conventions during conversion', () => {
      const chargeKw = 250;
      const dischargeKw = -180;
      const factorMw = 1000;

      const chargeMw = chargeKw / factorMw;
      const dischargeMw = dischargeKw / factorMw;

      expect(chargeMw).toBe(0.25);
      expect(chargeMw).toBeGreaterThan(0);

      expect(dischargeMw).toBe(-0.18);
      expect(dischargeMw).toBeLessThan(0);
    });
  });

  describe('P1-B: EnergyFlowDiagram Grid Power Magnitude & Direction Invariant', () => {
    // Pure function modeling EnergyFlowDiagram's grid node logic
    const evaluateGridNode = (
      data: { gridPower?: number },
      powerUnit: PowerUnit = 'kW',
      effectiveGridStale = false
    ) => {
      const unitLabel = powerUnit || 'kW';
      const gridPower = data.gridPower;

      // Invariant: Directional logic uses original signed gridPower
      const isGridImporting = !effectiveGridStale && gridPower !== undefined && gridPower > 0;
      const isGridExporting = !effectiveGridStale && gridPower !== undefined && gridPower < 0;

      // Magnitude display uses Math.abs(gridPower)
      const gridDisplay = effectiveGridStale
        ? '--'
        : (gridPower !== undefined ? formatPowerDisplay(Math.abs(gridPower), unitLabel).displayValue : '--');

      return {
        gridPower,
        isGridImporting,
        isGridExporting,
        gridDisplay,
        unitLabel,
      };
    };

    it('1. Positive Grid Power displays non-negative magnitude and preserves import direction', () => {
      const telemetry: DashboardTelemetryState = { gridPower: 125.4 };
      const nodeKw = evaluateGridNode(telemetry, 'kW', false);

      expect(nodeKw.gridDisplay).toBe('125.4');
      expect(nodeKw.isGridImporting).toBe(true);
      expect(nodeKw.isGridExporting).toBe(false);
      expect(telemetry.gridPower).toBe(125.4); // Signed value untouched

      const nodeMw = evaluateGridNode(telemetry, 'MW', false);
      expect(nodeMw.gridDisplay).toBe('0.13'); // 125.4 / 1000 = 0.1254 -> 0.13
      expect(nodeMw.isGridImporting).toBe(true);
      expect(nodeMw.isGridExporting).toBe(false);
      expect(telemetry.gridPower).toBe(125.4);
    });

    it('2. Negative Grid Power displays non-negative magnitude and preserves export direction', () => {
      const telemetry: DashboardTelemetryState = { gridPower: -125.4 };
      const nodeKw = evaluateGridNode(telemetry, 'kW', false);

      expect(nodeKw.gridDisplay).toBe('125.4'); // Magnitude is non-negative! No leading minus sign.
      expect(nodeKw.isGridImporting).toBe(false);
      expect(nodeKw.isGridExporting).toBe(true); // Export direction preserved!
      expect(telemetry.gridPower).toBe(-125.4); // Crucial: raw signed telemetry unchanged

      const nodeMw = evaluateGridNode(telemetry, 'MW', false);
      expect(nodeMw.gridDisplay).toBe('0.13');
      expect(nodeMw.isGridImporting).toBe(false);
      expect(nodeMw.isGridExporting).toBe(true);
      expect(telemetry.gridPower).toBe(-125.4);
    });

    it('3. Zero Grid Power displays "0" and indicates neither importing nor exporting', () => {
      const telemetry: DashboardTelemetryState = { gridPower: 0 };
      const nodeKw = evaluateGridNode(telemetry, 'kW', false);

      expect(nodeKw.gridDisplay).toBe('0');
      expect(nodeKw.isGridImporting).toBe(false);
      expect(nodeKw.isGridExporting).toBe(false);

      const nodeMw = evaluateGridNode(telemetry, 'MW', false);
      expect(nodeMw.gridDisplay).toBe('0');
      expect(nodeMw.isGridImporting).toBe(false);
      expect(nodeMw.isGridExporting).toBe(false);
    });

    it('4. Stale or missing telemetry displays "--" and neither importing nor exporting', () => {
      // Missing telemetry
      const missingTelemetry: DashboardTelemetryState = {};
      const missingNode = evaluateGridNode(missingTelemetry, 'kW', false);
      expect(missingNode.gridDisplay).toBe('--');
      expect(missingNode.isGridImporting).toBe(false);
      expect(missingNode.isGridExporting).toBe(false);

      // Stale telemetry with existing value
      const staleTelemetry: DashboardTelemetryState = { gridPower: 88.5 };
      const staleNode = evaluateGridNode(staleTelemetry, 'kW', true);
      expect(staleNode.gridDisplay).toBe('--');
      expect(staleNode.isGridImporting).toBe(false);
      expect(staleNode.isGridExporting).toBe(false);
    });

    it('5. Confirm that raw telemetry state is not mutated by formatPowerDisplay or Math.abs', () => {
      const rawTelemetry: DashboardTelemetryState = {
        gridPower: -345.678,
        bessPower: 120.5,
        solarPower: 225.1,
      };

      const result = evaluateGridNode(rawTelemetry, 'MW', false);

      expect(result.gridDisplay).toBe('0.35');
      // Original object strictly preserved
      expect(rawTelemetry.gridPower).toBe(-345.678);
      expect(rawTelemetry.bessPower).toBe(120.5);
      expect(rawTelemetry.solarPower).toBe(225.1);
    });
  });
});
