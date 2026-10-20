import { describe, it, expect } from 'vitest';
import { resolveVoltageTrend, VoltageTrendProcessor } from '../../src/utils/voltage-trend.util';

describe('resolveVoltageTrend', () => {
  it('should retain Grid voltages and zero BESS voltages when Grid is active', () => {
    const row = {
      gridOnState: 1,
      gridOffState: 0,
      gridVoltageUab: 230,
      gridVoltageUbc: 231,
      gridVoltageUca: 229,
      bessVoltageUa: 400,
      bessVoltageUb: 401,
      bessVoltageUc: 402,
    };
    const result = resolveVoltageTrend(row);
    expect(result).toEqual({
      activeSource: 'GRID',
      gridUab: 230,
      gridUbc: 231,
      gridUca: 229,
      bessUa: 0,
      bessUb: 0,
      bessUc: 0,
      rawGridUab: 230,
      rawGridUbc: 231,
      rawGridUca: 229,
      rawBessUa: 400,
      rawBessUb: 401,
      rawBessUc: 402,
    });
  });

  it('should retain BESS voltages and zero Grid voltages when BESS is active', () => {
    const row = {
      gridOnState: 0,
      gridOffState: 1,
      gridVoltageUab: 230,
      gridVoltageUbc: 231,
      gridVoltageUca: 229,
      bessVoltageUa: 400,
      bessVoltageUb: 401,
      bessVoltageUc: 402,
    };
    const result = resolveVoltageTrend(row);
    expect(result).toEqual({
      activeSource: 'BESS',
      gridUab: 0,
      gridUbc: 0,
      gridUca: 0,
      bessUa: 400,
      bessUb: 401,
      bessUc: 402,
      rawGridUab: 230,
      rawGridUbc: 231,
      rawGridUca: 229,
      rawBessUa: 400,
      rawBessUb: 401,
      rawBessUc: 402,
    });
  });

  it('should return nulls when state fields are missing', () => {
    const row = {
      gridVoltageUab: 230,
      gridVoltageUbc: 231,
      gridVoltageUca: 229,
      bessVoltageUa: 400,
      bessVoltageUb: 401,
      bessVoltageUc: 402,
    };
    const result = resolveVoltageTrend(row);
    expect(result).toEqual({
      activeSource: 'UNKNOWN',
      gridUab: 0,
      gridUbc: 0,
      gridUca: 0,
      bessUa: 0,
      bessUb: 0,
      bessUc: 0,
      rawGridUab: 230,
      rawGridUbc: 231,
      rawGridUca: 229,
      rawBessUa: 400,
      rawBessUb: 401,
      rawBessUc: 402,
    });
  });

  it('should return nulls when state fields contain unexpected values', () => {
    const row = {
      gridOnState: 2,
      gridOffState: 2,
      gridVoltageUab: 230,
      gridVoltageUbc: 231,
      gridVoltageUca: 229,
      bessVoltageUa: 400,
      bessVoltageUb: 401,
      bessVoltageUc: 402,
    };
    const result = resolveVoltageTrend(row);
    expect(result).toEqual({
      activeSource: 'UNKNOWN',
      gridUab: 0,
      gridUbc: 0,
      gridUca: 0,
      bessUa: 0,
      bessUb: 0,
      bessUc: 0,
      rawGridUab: 230,
      rawGridUbc: 231,
      rawGridUca: 229,
      rawBessUa: 400,
      rawBessUb: 401,
      rawBessUc: 402,
    });
  });

  it('should retain Grid voltages and zero BESS voltages when gridOnState is 1, even if gridOffState is null', () => {
    const row = {
      gridOnState: 1,
      gridOffState: null,
      gridVoltageUab: 230,
      gridVoltageUbc: 231,
      gridVoltageUca: 229,
      bessVoltageUa: 400,
      bessVoltageUb: 401,
      bessVoltageUc: 402,
    };
    const result = resolveVoltageTrend(row);
    expect(result).toEqual({
      activeSource: 'GRID',
      gridUab: 230,
      gridUbc: 231,
      gridUca: 229,
      bessUa: 0,
      bessUb: 0,
      bessUc: 0,
      rawGridUab: 230,
      rawGridUbc: 231,
      rawGridUca: 229,
      rawBessUa: 400,
      rawBessUb: 401,
      rawBessUc: 402,
    });
  });

  it('should correctly map zero and null voltage readings when state is valid', () => {
    const row = {
      gridOnState: 1,
      gridOffState: 0,
      gridVoltageUab: 0,
      gridVoltageUbc: null,
      gridVoltageUca: 229,
      bessVoltageUa: 400,
      bessVoltageUb: 401,
      bessVoltageUc: 402,
    };
    const result = resolveVoltageTrend(row);
    expect(result).toEqual({
      activeSource: 'GRID',
      gridUab: 0,
      gridUbc: null,
      gridUca: 229,
      bessUa: 0,
      bessUb: 0,
      bessUc: 0,
      rawGridUab: 0,
      rawGridUbc: null,
      rawGridUca: 229,
      rawBessUa: 400,
      rawBessUb: 401,
      rawBessUc: 402,
    });
  });

  it('should return nulls when state fields are contradictory (both 1)', () => {
    const row = {
      gridOnState: 1,
      gridOffState: 1,
      gridVoltageUab: 230,
      gridVoltageUbc: 231,
      gridVoltageUca: 229,
      bessVoltageUa: 400,
      bessVoltageUb: 401,
      bessVoltageUc: 402,
    };
    const result = resolveVoltageTrend(row);
    expect(result).toEqual({
      activeSource: 'UNKNOWN',
      gridUab: 0,
      gridUbc: 0,
      gridUca: 0,
      bessUa: 0,
      bessUb: 0,
      bessUc: 0,
      rawGridUab: 230,
      rawGridUbc: 231,
      rawGridUca: 229,
      rawBessUa: 400,
      rawBessUb: 401,
      rawBessUc: 402,
    });
  });

  it('should retain existing behavior for Hercules-like records (gridOn:0, gridOff:1)', () => {
    const row = {
      gridOnState: 0,
      gridOffState: 1,
      gridVoltageUab: 402,
      gridVoltageUbc: 402,
      gridVoltageUca: 402,
      bessVoltageUa: 402,
      bessVoltageUb: 402,
      bessVoltageUc: 402,
    };
    const result = resolveVoltageTrend(row);
    expect(result).toEqual({
      activeSource: 'BESS',
      gridUab: 0,
      gridUbc: 0,
      gridUca: 0,
      bessUa: 402,
      bessUb: 402,
      bessUc: 402,
      rawGridUab: 402,
      rawGridUbc: 402,
      rawGridUca: 402,
      rawBessUa: 402,
      rawBessUb: 402,
      rawBessUc: 402,
    });
  });

  it('should return nulls when both states are null and raw voltages are null', () => {
    const row = {
      gridOnState: null,
      gridOffState: null,
      gridVoltageUab: null,
      gridVoltageUbc: null,
      gridVoltageUca: null,
      bessVoltageUa: null,
      bessVoltageUb: null,
      bessVoltageUc: null,
    };
    const result = resolveVoltageTrend(row);
    expect(result).toEqual({
      activeSource: 'UNKNOWN',
      gridUab: 0,
      gridUbc: 0,
      gridUca: 0,
      bessUa: 0,
      bessUb: 0,
      bessUc: 0,
      rawGridUab: null,
      rawGridUbc: null,
      rawGridUca: null,
      rawBessUa: null,
      rawBessUb: null,
      rawBessUc: null,
    });
  });
});

describe('VoltageTrendProcessor', () => {
  it('should carry forward state for sparse packets after a full packet', () => {
    const processor = new VoltageTrendProcessor();
    const t1 = new Date('2026-10-10T08:55:00.000Z');
    const full = processor.processRow({ timestamp: t1, gridOnState: 0, gridOffState: 1, bessVoltageUa: 400 });
    expect(full.activeSource).toBe('BESS');

    const t2 = new Date('2026-10-10T08:56:00.000Z');
    const sparse = processor.processRow({ timestamp: t2, gridOnState: null, gridOffState: null, bessVoltageUa: 400 });
    expect(sparse.activeSource).toBe('BESS');
  });

  it('should handle full packet before sparse packet at exactly the same timestamp (SQL NULLS LAST)', () => {
    const processor = new VoltageTrendProcessor();
    const t = new Date('2026-10-10T08:59:59.000Z');
    
    // DB returns full first because of NULLS LAST
    const full = processor.processRow({ timestamp: t, gridOnState: 0, gridOffState: 1, bessVoltageUa: 400 });
    expect(full.activeSource).toBe('BESS');

    const sparse = processor.processRow({ timestamp: t, gridOnState: null, gridOffState: null, bessVoltageUa: 400 });
    expect(sparse.activeSource).toBe('BESS');
  });

  it('should expire carried state after freshness limit (6 minutes)', () => {
    const processor = new VoltageTrendProcessor();
    const t1 = new Date('2026-10-10T08:50:00.000Z');
    processor.processRow({ timestamp: t1, gridOnState: 0, gridOffState: 1, bessVoltageUa: 400 });

    const t2 = new Date('2026-10-10T08:57:00.000Z'); // 7 minutes later
    const expired = processor.processRow({ timestamp: t2, gridOnState: null, gridOffState: null, gridVoltageUab: 400, bessVoltageUa: 400 });
    expect(expired.activeSource).toBe('UNKNOWN');
    expect(expired.rawGridUab).toBe(400);
    expect(expired.gridUab).toBe(0);
  });

  it('should handle genuine Grid/BESS state transitions safely', () => {
    const processor = new VoltageTrendProcessor();
    const t1 = new Date('2026-10-10T08:50:00.000Z');
    const bessState = processor.processRow({ timestamp: t1, gridOnState: 0, gridOffState: 1, bessVoltageUa: 400 });
    expect(bessState.activeSource).toBe('BESS');

    const t2 = new Date('2026-10-10T08:55:00.000Z');
    const gridState = processor.processRow({ timestamp: t2, gridOnState: 1, gridOffState: 0, gridVoltageUab: 400, bessVoltageUa: 0 });
    expect(gridState.activeSource).toBe('GRID');
    
    // subsequent sparse inherits GRID
    const t3 = new Date('2026-10-10T08:56:00.000Z');
    const sparse = processor.processRow({ timestamp: t3, gridOnState: null, gridOffState: null, gridVoltageUab: 400, bessVoltageUa: 0 });
    expect(sparse.activeSource).toBe('GRID');
  });
});
