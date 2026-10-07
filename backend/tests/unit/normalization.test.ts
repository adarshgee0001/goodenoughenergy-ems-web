/**
 * Phase 14C.1 — Signal Normalization Unit Tests
 *
 * Tests the pure normalizeComponentSignals() and normalizePcsState() functions.
 * No database, no MQTT connection, no WebSocket required.
 *
 * Run with:  npx tsx test-normalization.ts
 */

import { normalizeComponentSignals, normalizePcsState } from './src/services/mqtt.service';

import { describe, test } from 'vitest';

describe('Signal Normalization', () => {
  test('Runs all checks', async () => {
  console.log('=== Phase 14C.1 Signal Normalization Unit Tests ===\n');
  

  const assert = (condition: boolean, testName: string, detail?: string) => {
    if (!condition) {
      throw new Error(`FAIL: ${testName}${detail ? ' — ' + detail : ''}`);
    }
  };

  // ---------------------------------------------------------------------------
  // Test 1: pcs.ai_p → pcsActivePower / bessPower (NOT solarPower)
  // ---------------------------------------------------------------------------
  console.log('\n[PCS Signal Tests]');
  {
    const result = normalizeComponentSignals('pcs', [{ m: 'ai_p', v: 150.5 }]);
    assert(result.pcsActivePower === 150.5, 'pcs.ai_p → pcsActivePower = 150.5');
    assert(result.wsData.bessPower === 150.5, 'pcs.ai_p → wsData.bessPower = 150.5');
    // Test 2: pcs.ai_p does NOT go to solarPower
    assert(!('solarPower' in result.wsData), 'pcs.ai_p does NOT populate wsData.solarPower');
  }

  // Test 3: PCS analogue fields populated correctly
  {
    const signals = [
      { m: 'ai_p',           v: 200 },
      { m: 'ai_dc_u',        v: 800.5 },
      { m: 'ai_igbt_temp',   v: 42.1 },
      { m: 'ai_day_chg_cap', v: 150.2 },
      { m: 'ai_day_dis_cap', v: 200.5 },
      { m: 'ai_sum_chg_cap', v: 15000.5 },
      { m: 'ai_sum_dis_cap', v: 14500.2 },
      { m: 'ai_freq',        v: 49.97 },
    ];
    const result = normalizeComponentSignals('pcs', signals);
    assert(result.pcsActivePower    === 200,     'pcs.ai_p         → pcsActivePower');
    assert(result.dcVoltage         === 800.5,   'pcs.ai_dc_u      → dcVoltage');
    assert(result.ambientTemp       === 42.1,    'pcs.ai_igbt_temp → ambientTemp');
    assert(result.todayChargeEnergy === 150.2,   'pcs.ai_day_chg_cap → todayChargeEnergy');
    assert(result.todayDischargeEnergy === 200.5,'pcs.ai_day_dis_cap → todayDischargeEnergy');
    assert(result.accumChargeEnergy === 15000.5, 'pcs.ai_sum_chg_cap → accumChargeEnergy');
    assert(result.accumDischargeEnergy === 14500.2,'pcs.ai_sum_dis_cap → accumDischargeEnergy');
    assert(result.wsData.pcsDcVoltage      === 800.5,  'wsData.pcsDcVoltage populated');
    assert(result.wsData.pcsTemp           === 42.1,   'wsData.pcsTemp populated');
    assert(result.wsData.todayChargeEnergy === 150.2,  'wsData.todayChargeEnergy populated');
    assert(result.wsData.accChargeEnergy   === 15000.5,'wsData.accChargeEnergy populated');
    assert(result.bessFrequency            === 49.97,  'pcs.ai_freq → bessFrequency');
    assert(result.wsData.bessFrequency     === 49.97,  'wsData.bessFrequency populated');
  }

  // Test 4: PCS state normalization
  console.log('\n[PCS State Tests]');
  {
    assert(normalizePcsState(0) === 'Stop',        'di_singco_state 0 → Stop');
    assert(normalizePcsState(1) === 'Standby',     'di_singco_state 1 → Standby');
    assert(normalizePcsState(2) === 'Fault',       'di_singco_state 2 → Fault');
    assert(normalizePcsState(3) === 'Charging',    'di_singco_state 3 → Charging');
    assert(normalizePcsState(4) === 'Discharging', 'di_singco_state 4 → Discharging');
    assert(normalizePcsState(99).startsWith('Unknown'), 'di_singco_state unknown → Unknown(99)');

    const result = normalizeComponentSignals('pcs', [{ m: 'di_singco_state', v: 3 }]);
    assert(result.wsData.pcsState === 'Charging', 'pcs.di_singco_state 3 → wsData.pcsState = Charging');
  }

  // ---------------------------------------------------------------------------
  // Test 5: pmg.ai_sum_p → gridSideLoad / gridPower
  // ---------------------------------------------------------------------------
  console.log('\n[Grid Meter (pmg) Tests]');
  {
    const result = normalizeComponentSignals('pmg', [{ m: 'ai_sum_p', v: 350 }]);
    assert(result.gridSideLoad    === 350, 'pmg.ai_sum_p → gridSideLoad = 350');
    assert(result.wsData.gridPower === 350, 'pmg.ai_sum_p → wsData.gridPower = 350');
    assert(result.totalPower === undefined, 'pmg.ai_sum_p does NOT populate totalPower');
  }

  // ---------------------------------------------------------------------------
  // Test 6: rjl.ai_sum_p → totalPower, NOT gridSideLoad
  // ---------------------------------------------------------------------------
  console.log('\n[Cabinet Meter (rjl / jl) Tests]');
  {
    const rjlResult = normalizeComponentSignals('rjl', [{ m: 'ai_sum_p', v: 500 }]);
    assert(rjlResult.totalPower     === 500,      'rjl.ai_sum_p → totalPower = 500');
    assert(rjlResult.gridSideLoad   === undefined, 'rjl.ai_sum_p does NOT → gridSideLoad');
    assert(rjlResult.wsData.gridPower === undefined,'rjl.ai_sum_p does NOT → wsData.gridPower');
  }

  // Test 7: jl.ai_sum_p → totalPower, NOT gridSideLoad
  {
    const jlResult = normalizeComponentSignals('jl', [{ m: 'ai_sum_p', v: 480 }]);
    assert(jlResult.totalPower      === 480,      'jl.ai_sum_p → totalPower = 480');
    assert(jlResult.gridSideLoad    === undefined, 'jl.ai_sum_p does NOT → gridSideLoad');
    assert(jlResult.wsData.gridPower === undefined,'jl.ai_sum_p does NOT → wsData.gridPower');
  }

  // Test 8: Meter voltage and current fields
  {
    const signals = [
      { m: 'ai_ua', v: 277.1 },
      { m: 'ai_ub', v: 276.8 },
      { m: 'ai_uc', v: 277.5 },
      { m: 'ai_ia', v: 120.5 },
      { m: 'ai_ib', v: 121.2 },
      { m: 'ai_ic', v: 119.8 },
      { m: 'ai_sum_p', v: 420 },
    ];
    for (const comp of ['rjl', 'jl'] as const) {
      const result = normalizeComponentSignals(comp, signals);
      assert(result.voltageA           === 277.1, `${comp}.ai_ua → voltageA`);
      assert(result.voltageB           === 276.8, `${comp}.ai_ub → voltageB`);
      assert(result.voltageC           === 277.5, `${comp}.ai_uc → voltageC`);
      assert(result.currentA           === 120.5, `${comp}.ai_ia → currentA`);
      assert(result.currentB           === 121.2, `${comp}.ai_ib → currentB`);
      assert(result.currentC           === 119.8, `${comp}.ai_ic → currentC`);
      assert(result.totalPower         === 420,   `${comp}.ai_sum_p → totalPower`);
      assert(result.wsData.phaseAVoltage === 277.1,`${comp} wsData.phaseAVoltage`);
      assert(result.wsData.phaseBVoltage === 276.8,`${comp} wsData.phaseBVoltage`);
      assert(result.wsData.phaseCVoltage === 277.5,`${comp} wsData.phaseCVoltage`);
      assert(result.wsData.phaseACurrent === 120.5,`${comp} wsData.phaseACurrent`);
      assert(result.wsData.phaseBCurrent === 121.2,`${comp} wsData.phaseBCurrent`);
      assert(result.wsData.phaseCCurrent === 119.8,`${comp} wsData.phaseCCurrent`);
      assert(result.gridSideLoad === undefined,    `${comp} does NOT populate gridSideLoad`);
    }
  }

  // ---------------------------------------------------------------------------
  // Test 9: pcs.ai_sum_p does NOT populate gridSideLoad
  // ---------------------------------------------------------------------------
  console.log('\n[Semantic Guard Tests]');
  {
    // PCS doesn't have ai_sum_p in the Old Dashboard reference, but if a PCS
    // component somehow contains it, it must NOT be treated as gridSideLoad.
    const result = normalizeComponentSignals('pcs', [{ m: 'ai_sum_p', v: 999 }]);
    assert(result.gridSideLoad    === undefined, 'pcs.ai_sum_p does NOT → gridSideLoad');
    assert(result.wsData.gridPower === undefined, 'pcs.ai_sum_p does NOT → wsData.gridPower');
  }

  // Test 9.5: pmg.ai_freq DOES populate gridFrequency
  {
    const result = normalizeComponentSignals('pmg', [{ m: 'ai_freq', v: 50.1 }]);
    assert(result.gridFrequency === 50.1, 'pmg.ai_freq → gridFrequency');
    assert(result.wsData.gridFrequency === 50.1, 'pmg.ai_freq → wsData.gridFrequency');
  }

  // Test 10: No fake Solar value is ever generated (for components other than pinv)
  {
    for (const comp of ['pcs', 'pmg', 'rjl', 'jl', 'tms', 'ecu', 'pack_01', 'bmu_01']) {
      const result = normalizeComponentSignals(comp, [{ m: 'ai_p', v: 100 }]);
      assert(!('solarPower' in result.wsData), `No solarPower generated for component "${comp}"`);
    }
  }

  // Test 11: Unknown/unmapped components return empty NormalizedTelemetry
  {
    const unknownComponents = ['tms', 'th', 'io', 'ecu', 'pack_01', 'pack_02',
      'pack_03', 'pack_04', 'pack_05', 'bc_0101', 'bmu_01', 'deh', 'esr', 'fr'];
    for (const comp of unknownComponents) {
      const result = normalizeComponentSignals(comp, [{ m: 'some_signal', v: 42 }]);
      assert(
        result.gridSideLoad === undefined &&
        result.pcsActivePower === undefined &&
        result.voltageA === undefined,
        `Unknown component "${comp}" returns empty normalization`
      );
    }
  }

  // Test 11.5: pinv.ai_op_p generates solarPower
  {
    const result = normalizeComponentSignals('pinv', [{ m: 'ai_op_p', v: 125.4 }]);
    assert(result.solarPower === 125.4, 'pinv.ai_op_p → solarPower');
    assert(result.wsData.solarPower === 125.4, 'pinv.ai_op_p → wsData.solarPower');
  }

  // ---------------------------------------------------------------------------
  // Test 12: rawPayload integrity — normalization does NOT modify input array
  // ---------------------------------------------------------------------------
  console.log('\n[rawPayload Integrity Test]');
  {
    const signals = [
      { m: 'ai_p', v: 200, dq: 0, t: 1788944073 },
      { m: 'di_singco_state', v: 3, dq: 0, t: 1788944073 },
    ];
    const originalLength = signals.length;
    const originalFirst  = { ...signals[0] };
    normalizeComponentSignals('pcs', signals);
    assert(signals.length === originalLength,         'Input signal array not modified (length)');
    assert(signals[0].m === originalFirst.m,          'Input signal array not modified (m)');
    assert(signals[0].v === originalFirst.v,          'Input signal array not modified (v)');
  }

  // ---------------------------------------------------------------------------
  // Test 13: bcms is NOT mapped (would be an unmapped/unknown component)
  // ---------------------------------------------------------------------------
  console.log('\n[bcms Guard Test]');
  {
    // bcms is now present in live payload — it maps ai_sum_soc, ai_sum_soh and more
    const result = normalizeComponentSignals('bcms', [
      { m: 'ai_sum_soc', v: 85 },
      { m: 'ai_sum_soh', v: 98 },
      { m: 'ai_sum_i',   v: 62.5 },
      { m: 'ai_max_cell_vol', v: 3.32 },
      { m: 'ai_min_vol', v: 3.30 },
      { m: 'ai_max_temp', v: 45.2 },
    ]);
    assert(result.pcsActivePower === undefined, 'bcms: no pcsActivePower mapped');
    assert(result.gridSideLoad   === undefined, 'bcms: no gridSideLoad mapped');
    assert(result.voltageA       === undefined, 'bcms: no voltageA mapped');
    assert(result.soc            === 85, 'bcms: db soc populated');
    assert(result.soh            === 98, 'bcms: db soh populated');
    assert(result.bmsCurrent     === 62.5, 'bcms: db bmsCurrent populated');
    assert(result.cellVMax       === 3.32, 'bcms: db cellVMax populated');
    assert(result.cellVMin       === 3.30, 'bcms: db cellVMin populated');
    assert(result.cellTempMax    === 45.2, 'bcms: db cellTempMax populated');
    assert(result.wsData.bessSoc === 85, 'bcms: wsData.bessSoc populated');
    assert(result.wsData.bmsSoh  === 98, 'bcms: wsData.bmsSoh populated');
    assert(result.wsData.bmsCurrent === 62.5, 'bcms: wsData.bmsCurrent populated');
    assert(result.wsData.cellVMax === 3.32, 'bcms: wsData.cellVMax populated');
    assert(result.wsData.cellVMin === 3.30, 'bcms: wsData.cellVMin populated');
    assert(result.wsData.cellTempMax === 45.2, 'bcms: wsData.cellTempMax populated');
    assert(result.wsData.bessPower === undefined, 'bcms: wsData.bessPower not populated');
    console.log('    ℹ  BMS Finding: bcms IS in live payload → All 6 BMS fields mapped.');
  }

  // ---------------------------------------------------------------------------
  // Test 14: Signals with missing m or v are excluded from normalization
  // ---------------------------------------------------------------------------
  console.log('\n[Signal Validation Test]');
  {
    // normalizeComponentSignals receives only pre-validated signals (m and v both present)
    // but should also handle gracefully if somehow an empty-v signal slips through
    const signals = [
      { m: 'ai_p', v: 100 },
      { m: 'ai_dc_u', v: undefined as any }, // v is undefined — should be ignored
    ];
    const result = normalizeComponentSignals('pcs', signals);
    assert(result.pcsActivePower === 100, 'Valid signal (ai_p v=100) is processed');
    assert(result.dcVoltage === undefined, 'Signal with v=undefined is not mapped (dcVoltage remains undefined)');
  }

  
  });
});
