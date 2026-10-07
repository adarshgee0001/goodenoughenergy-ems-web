const mqtt = require('mqtt');
require('dotenv').config();
const crypto = require('crypto');

// Safety Constants
const ALLOWED_TEST_TOPIC = '/loadtest/bess/01';
const MAX_RATE = 25; // max 25 pkts/sec
const MAX_DURATION_SEC = 600; // max 10 minutes

// Parse arguments
const args = process.argv.slice(2);
const options = {
  topic: ALLOWED_TEST_TOPIC,
  emu: '9900000001',
  rate: 0,
  duration: undefined,
  publish: false,
  confirm: false,
  fault: 'none'
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--topic') options.topic = args[++i];
  if (args[i] === '--emu') options.emu = args[++i];
  if (args[i] === '--rate') options.rate = parseInt(args[++i], 10);
  if (args[i] === '--duration') options.duration = parseInt(args[++i], 10);
  if (args[i] === '--publish') options.publish = true;
  if (args[i] === '--confirm-load-test') options.confirm = true;
  if (args[i] === '--fault') options.fault = args[++i];
}

console.log("=== MQTT LOAD TEST HARNESS ===");

// 1. SAFETY CHECKS
if (options.topic !== ALLOWED_TEST_TOPIC) {
  console.error(`REFUSED: Only the dedicated load-test topic is allowed (${ALLOWED_TEST_TOPIC}). Received: ${options.topic}`);
  process.exit(1);
}

if (options.topic.includes('#') || options.topic.includes('+')) {
  console.error("REFUSED: Wildcard topics are blocked.");
  process.exit(1);
}

if (options.publish && options.duration === undefined) {
  console.error("REFUSED: --duration must be explicitly provided in publish mode.");
  process.exit(1);
}

if (options.duration > MAX_DURATION_SEC) {
  console.error(`REFUSED: Requested duration exceeds safety limit (${MAX_DURATION_SEC}s).`);
  process.exit(1);
}

if (options.rate > MAX_RATE) {
  console.error(`REFUSED: Rate exceeds safety limit (${MAX_RATE} pkt/sec).`);
  process.exit(1);
}

if (!options.publish) {
  console.log("MODE: DRY RUN");
  console.log(`Topic:\n${options.topic}`);
  console.log(`EMU:\n${options.emu}`);
  console.log(`Rate:\n${options.rate} pkt/sec`);
  console.log(`Duration:\n${options.duration || 'N/A'} sec`);
  console.log(`Components:\npcs, pmg, pinv, bcms`);
  console.log(`MQTT publishes:\n0`);
  process.exit(0);
}

// Ensure explicit confirmation
if (!options.confirm) {
  console.log("WARNING\n");
  console.log("You are about to publish synthetic MQTT telemetry.\n");
  console.log(`Target:\n${options.topic}\n`);
  console.log(`EMU:\n${options.emu}\n`);
  console.log("Environment:\nDEVELOPMENT LOAD-TEST\n");
  console.log("This tool will NEVER publish to existing production/demo topics.\n");
  console.log("Run with --confirm-load-test to proceed.");
  process.exit(1);
}

// 2. RUNTIME STATE
const runId = `LOADTEST-${new Date().toISOString().replace(/\D/g, '').substring(0, 8)}-${crypto.randomBytes(2).toString('hex')}`;
const stats = {
  packetsAttempted: 0,
  packetsPublished: 0,
  publishFailures: 0,
  startTime: Date.now()
};

let mqttClient = null;
let timer = null;
let running = true;

// 3. PAYLOAD GENERATION
function generatePayload() {
  const ts = Math.floor(Date.now() / 1000);
  
  // Healthy values
  const payload = {
    sn: options.emu,
    ts: ts,
    devs: [
      {
        dev: "pcs",
        ts: ts,
        d: [
          { m: "ai_p", v: 50.5, dq: 0, t: ts },
          { m: "ai_dc_u", v: 700.1, dq: 0, t: ts },
          { m: "ai_igbt_temp", v: 45.0, dq: 0, t: ts },
          { m: "ai_freq", v: 50.0, dq: 0, t: ts },
          { m: "ai_cos", v: 0.99, dq: 0, t: ts }
        ]
      },
      {
        dev: "pmg",
        ts: ts,
        d: [
          { m: "ai_sum_p", v: 100.2, dq: 0, t: ts },
          { m: "ai_ua", v: 230.1, dq: 0, t: ts },
          { m: "ai_freq", v: 50.01, dq: 0, t: ts },
          { m: "ai_sum_cos", v: 0.98, dq: 0, t: ts }
        ]
      },
      {
        dev: "pinv",
        ts: ts,
        d: [
          { m: "ai_op_p", v: 25.4, dq: 0, t: ts },
          { m: "ai_freq", v: 50.0, dq: 0, t: ts },
          { m: "ai_cos", v: 0.99, dq: 0, t: ts }
        ]
      },
      {
        dev: "bcms",
        ts: ts,
        d: [
          { m: "ai_sum_soc", v: 65.5, dq: 0, t: ts },
          { m: "ai_sum_soh", v: 99.8, dq: 0, t: ts },
          { m: "ai_sum_i", v: 120.4, dq: 0, t: ts },
          { m: "ai_max_cell_vol", v: 3.45, dq: 0, t: ts },
          { m: "ai_min_vol", v: 3.42, dq: 0, t: ts },
          { m: "ai_max_temp", v: 35.1, dq: 0, t: ts }
        ]
      }
    ]
  };

  if (options.fault === 'pcs_active') {
    payload.devs[0].d.push({ m: "di_flt_state", v: 1, dq: 0, t: ts });
  } else {
    payload.devs[0].d.push({ m: "di_flt_state", v: 0, dq: 0, t: ts });
  }

  return payload;
}

// 4. CLEAN SHUTDOWN
function shutdown() {
  if (!running) return;
  running = false;
  
  if (timer) clearInterval(timer);
  if (mqttClient) {
    mqttClient.end(false, () => {
      console.log("\nDisconnected MQTT client safely.");
    });
  }

  const endTime = Date.now();
  const elapsed = (endTime - stats.startTime) / 1000;
  
  console.log("\n=== RUN STATISTICS ===");
  console.log(`Run ID: ${runId}`);
  console.log(`Elapsed Time: ${elapsed.toFixed(2)} sec`);
  console.log(`Requested Rate: ${options.rate} pkt/sec`);
  console.log(`Actual Rate: ${(stats.packetsAttempted / elapsed).toFixed(2)} pkt/sec`);
  console.log(`Packets Attempted: ${stats.packetsAttempted}`);
  console.log(`Packets Published: ${stats.packetsPublished}`);
  console.log(`Publish Failures: ${stats.publishFailures}`);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// 5. EXECUTION LOGIC
async function main() {
  if (options.rate === 0) {
    console.log("Rate is 0. Exiting immediately.");
    process.exit(0);
  }

  const url = process.env.MQTT_BROKER_URL;
  const username = process.env.MQTT_USERNAME;
  const password = process.env.MQTT_PASSWORD;
  
  console.log(`Connecting to broker... (Run ID: ${runId})`);
  mqttClient = mqtt.connect(url, {
    username,
    password,
    clientId: 'ems_backend_loadtest_' + Math.random(),
    rejectUnauthorized: true
  });

  mqttClient.on('connect', () => {
    console.log(`Connected. Starting publisher at ${options.rate} pkt/sec for ${options.duration}s.`);
    const intervalMs = 1000 / options.rate;

    timer = setInterval(() => {
      const elapsed = (Date.now() - stats.startTime) / 1000;
      if (elapsed >= options.duration) {
        shutdown();
        return;
      }

      stats.packetsAttempted++;
      const payload = generatePayload();
      
      // EXPLICIT RETAIN=FALSE
      mqttClient.publish(options.topic, JSON.stringify(payload), { qos: 0, retain: false }, (err) => {
        if (err) {
          stats.publishFailures++;
        } else {
          stats.packetsPublished++;
        }
      });
    }, intervalMs);
  });

  mqttClient.on('error', (err) => {
    console.error("MQTT Error:", err.message);
    shutdown();
  });
}

main();
