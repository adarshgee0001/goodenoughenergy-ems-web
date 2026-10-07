import { TelemetrySnapshotService } from './src/services/telemetry-snapshot.service';

const service = new TelemetrySnapshotService();

async function runTests() {
  console.log('--- Unit Tests for Snapshot Generation ---');

  // Test 1: Bucket Start calculation
  const t1 = new Date('2026-09-14T09:07:32.000Z');
  const b1 = service.getBucketStart(t1);
  if (b1.toISOString() === '2026-09-14T09:00:00.000Z') {
    console.log('✅ PASS: getBucketStart 09:07:32 -> 09:00:00');
  } else {
    console.error(`❌ FAIL: Expected 09:00, got ${b1.toISOString()}`);
  }

  const t2 = new Date('2026-09-14T09:14:59.999Z');
  const b2 = service.getBucketStart(t2);
  if (b2.toISOString() === '2026-09-14T09:00:00.000Z') {
    console.log('✅ PASS: getBucketStart 09:14:59 -> 09:00:00');
  } else {
    console.error(`❌ FAIL: Expected 09:00, got ${b2.toISOString()}`);
  }

  const t3 = new Date('2026-09-14T09:30:00.000Z');
  const b3 = service.getBucketStart(t3);
  if (b3.toISOString() === '2026-09-14T09:30:00.000Z') {
    console.log('✅ PASS: getBucketStart 09:30:00 -> 09:30:00');
  } else {
    console.error(`❌ FAIL: Expected 09:30, got ${b3.toISOString()}`);
  }

  // Aggregate logic is tested inside the service via actual DB tests in the next phase
  console.log('Unit Tests Complete.');
}

runTests();
