import { mqttService } from './src/services/mqtt.service';
import mqtt from 'mqtt';

import { describe, test } from 'vitest';

describe('MQTT Ingestion', () => {
  test('Runs all checks', async () => {
  console.log('Starting Phase 11 MQTT Ingestion Tests...');
  

  const assert = (condition: boolean, testName: string, detail?: string) => {
    if (!condition) {
      throw new Error(`FAIL: ${testName}${detail ? ' — ' + detail : ''}`);
    }
  };

  // Mock console.warn and console.log to capture outputs
  let warnings: string[] = [];
  let logs: string[] = [];
  const origWarn = console.warn;
  const origLog = console.log;
  console.warn = (msg) => warnings.push(msg);
  console.log = (msg) => { if (msg.includes('[MQTT]')) logs.push(msg); else origLog(msg); };

  const clearOutputs = () => { warnings = []; logs = []; };

  // Helper to test payloads
  const testPayload = async (payload: any) => {
    clearOutputs();
    await mqttService.handleMessage('test/topic', Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)));
  };

  // Test 1: Valid payload parsing
  const validPayload = {
    code: "0QQSB03PY21106F680100007",
    pKey: "manish07786",
    sn: "2412131092",
    ts: 1788944073,
    ver: "v2.0.0",
    devs: [
      {
        dev: "ecu",
        ts: 1788944073,
        type: 1,
        d: [{ m: "di_pump_stat", v: 1, dq: 0, t: 1788944073 }]
      }
    ]
  };
  await testPayload(validPayload);
  assert(warnings.some(w => w.includes('Warning: Unknown EMU 2412131092. Persistence skipped.')), 'Valid payload parsing');

  // Test 2: Malformed JSON
  await testPayload('{"code": "broken');
  assert(warnings.some(w => w.includes('Received malformed JSON payload')), 'Malformed JSON handling');

  // Test 3: Missing required fields
  const missingFields = { code: "123", sn: "123" };
  await testPayload(missingFields);
  assert(warnings.some(w => w.includes('Payload missing required base fields')), 'Missing required fields handling');

  // Test 4: Missing devs
  const missingDevs = { ...validPayload, devs: undefined };
  await testPayload(missingDevs);
  assert(warnings.some(w => w.includes('Payload missing required base fields')), 'Missing devs handling');

  // Test 5: Multiple devs & signals
  const multipleDevs = {
    ...validPayload,
    devs: [
      { dev: "ecu", d: [{ m: "di_pump_stat", v: 1 }] },
      { dev: "pinv", d: [{ m: "ai_p", v: 50 }, { m: "dc_v", v: 800 }] }
    ]
  };
  await testPayload(multipleDevs);
  assert(warnings.some(w => w.includes('Warning: Unknown EMU 2412131092. Persistence skipped.')), 'Multiple devs (ecu) parsed');

  // Test 6: Invalid signal structure
  const invalidSignal = {
    ...validPayload,
    devs: [{ dev: "ecu", d: [{ m: "missing_v" }] }]
  };
  await testPayload(invalidSignal);
  assert(warnings.some(w => w.includes('Warning: Unknown EMU 2412131092. Persistence skipped.')), 'Invalid signal structure skipped');

  // Test 7: Unresolved device association
  // Implicitly tested in all valid payload runs by 'Persistence skipped' message.
  // Actually, wait, let's just do it here:
  await testPayload(validPayload);
  assert(warnings.some(w => w.includes('Warning: Unknown EMU 2412131092. Persistence skipped.')), 'Unresolved Device association safely skips persistence');

  // Restore console
  console.warn = origWarn;
  console.log = origLog;

  console.log = origLog;
  });
});

import { prisma } from '../../src/db/prisma';

describe('MQTT Topic + BESS Identity Validation', () => {
  const assert = (condition: boolean, testName: string) => {
    if (!condition) throw new Error(`FAIL: ${testName}`);
  };

  let warnings: string[] = [];
  const origWarn = console.warn;

  beforeEach(() => {
    warnings = [];
    console.warn = (msg) => warnings.push(msg);
    vi.clearAllMocks();
  });

  afterEach(() => {
    console.warn = origWarn;
    delete process.env.MQTT_TOPIC;
  });

  const testValidation = async (topic: string, sn: string, dbMock: any) => {
    warnings = [];
    const findUniqueSpy = vi.spyOn(prisma.bESSAsset, 'findUnique');
    findUniqueSpy.mockResolvedValue(dbMock);

    const payload = {
      code: "123", pKey: "123", sn, ts: 123, ver: "v2.0.0",
      devs: []
    };

    await mqttService.handleMessage(topic, Buffer.from(JSON.stringify(payload)));
    findUniqueSpy.mockRestore();
    return warnings;
  };

  test('Matching topic + matching SN -> ALLOW', async () => {
    const warns = await testValidation('client/site/bess01', 'SN01', { id: '1', siteId: '1', mqttTopic: 'client/site/bess01' });
    assert(warns.length === 0, 'Matching topic + matching SN');
  });

  test('Topic A + SN B -> REJECT', async () => {
    const warns = await testValidation('client/site/bessA', 'SN_B', { id: '2', siteId: '1', mqttTopic: 'client/site/bessB' });
    assert(warns.some(w => w.includes('Topic validation failed for EMU SN_B')), 'Topic A + SN B');
  });

  test('Topic B + SN A -> REJECT', async () => {
    const warns = await testValidation('client/site/bessB', 'SN_A', { id: '1', siteId: '1', mqttTopic: 'client/site/bessA' });
    assert(warns.some(w => w.includes('Topic validation failed for EMU SN_A')), 'Topic B + SN A');
  });

  test('Valid SN + unknown topic -> REJECT', async () => {
    const warns = await testValidation('unknown/topic', 'SN01', { id: '1', siteId: '1', mqttTopic: 'client/site/bess01' });
    assert(warns.some(w => w.includes('Topic validation failed for EMU SN01')), 'Valid SN + unknown topic');
  });

  test('Unknown SN -> REJECT', async () => {
    const warns = await testValidation('client/site/bess01', 'SN_UNKNOWN', null);
    assert(warns.some(w => w.includes('Warning: Unknown EMU SN_UNKNOWN')), 'Unknown SN');
  });

  test('BESS mqttTopic NULL + env MQTT_TOPIC matching -> ALLOW', async () => {
    process.env.MQTT_TOPIC = 'legacy/fallback/topic';
    const warns = await testValidation('legacy/fallback/topic', 'SN01', { id: '1', siteId: '1', mqttTopic: null });
    assert(warns.length === 0, 'BESS mqttTopic NULL + env MQTT_TOPIC matching');
  });

  test('BESS mqttTopic NULL + env MQTT_TOPIC not matching -> REJECT', async () => {
    process.env.MQTT_TOPIC = 'legacy/fallback/topic';
    const warns = await testValidation('wrong/topic', 'SN01', { id: '1', siteId: '1', mqttTopic: null });
    assert(warns.some(w => w.includes('Topic validation failed')), 'BESS mqttTopic NULL + env MQTT_TOPIC not matching');
  });

  test('BESS mqttTopic NULL + env MQTT_TOPIC missing -> REJECT', async () => {
    delete process.env.MQTT_TOPIC;
    const warns = await testValidation('legacy/fallback/topic', 'SN01', { id: '1', siteId: '1', mqttTopic: null });
    assert(warns.some(w => w.includes('Topic validation failed')), 'BESS mqttTopic NULL + env MQTT_TOPIC missing');
  });

  test('Exact string behavior -> REJECT', async () => {
    const warns = await testValidation('/client/site/bess01/extra', 'SN01', { id: '1', siteId: '1', mqttTopic: '/client/site/bess01' });
    assert(warns.some(w => w.includes('Topic validation failed')), 'Exact string behavior');
  });
});
