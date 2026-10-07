import { mqttService } from './src/services/mqtt.service';
import mqtt from 'mqtt';

const runTests = async () => {
  console.log('Starting Phase 11 MQTT Ingestion Tests...');
  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, testName: string) => {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
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
  assert(logs.some(l => l.includes('Persistence skipped: Missing Device mapping for EMU 2412131092 Component ecu (1 signals received)')), 'Valid payload parsing');

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
  assert(logs.some(l => l.includes('Missing Device mapping for EMU 2412131092 Component ecu (1 signals received)')), 'Multiple devs (ecu) parsed');
  assert(logs.some(l => l.includes('Missing Device mapping for EMU 2412131092 Component pinv (2 signals received)')), 'Multiple devs (pinv) parsed');

  // Test 6: Invalid signal structure
  const invalidSignal = {
    ...validPayload,
    devs: [{ dev: "ecu", d: [{ m: "missing_v" }] }]
  };
  await testPayload(invalidSignal);
  assert(warnings.some(w => w.includes('Signal missing m or v inside EMU')), 'Invalid signal structure skipped');

  // Test 7: Unresolved device association
  // Implicitly tested in all valid payload runs by 'Persistence skipped' message.
  // Actually, wait, let's just do it here:
  await testPayload(validPayload);
  assert(logs.some(l => l.includes('Persistence skipped: Missing Device mapping')), 'Unresolved Device association safely skips persistence');

  // Restore console
  console.warn = origWarn;
  console.log = origLog;

  console.log(`\nTests complete: ${passed} passed, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
};

runTests().catch(console.error);
