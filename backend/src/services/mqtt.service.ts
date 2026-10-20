import mqtt, { MqttClient } from 'mqtt';
import { webSocketService, LiveTelemetryPayload } from './websocket.service';
import { alarmIngestionService } from './alarm-ingestion.service';

import { prisma } from '../db/prisma';
import { calculatePackTemperatures, isRecognizedPackTemperatureSignal } from '../utils/battery-status.util';
import { calculateLineVoltage, calculateAcCurrent, getPcsTemperature, getTmsAmbientTemperature } from '../utils/pcs-telemetry.util';
import { normalizeCabinetState } from '../utils/bms-telemetry.util';
import { normalizeTmsMode } from '../utils/tms-telemetry.util';

// ---------------------------------------------------------------------------
// Signal Normalization
// ---------------------------------------------------------------------------
// This function is pure (no side effects, no DB, no WS) so it can be
// unit-tested independently of the MQTT connection.
//
// IMPORTANT SEMANTIC RULES (verified from live payload + Old Dashboard ref):
//   pcs.ai_p       → PCS/BESS Active Power  (bessPower / pcsActivePower)
//                    NEVER Solar.
//   pmg.ai_sum_p   → Grid Side Load         (gridSideLoad / gridPower)
//                    ONLY from component "pmg".
//   rjl.ai_sum_p
//   jl.ai_sum_p    → Cabinet Meter Total Power (totalPower)
//                    NEVER gridSideLoad.
//   pcs.ai_sum_p   → not expected; do NOT treat as gridSideLoad.
//   bcms           → NOT present in live payload. Never mapped here.
//   pinv.ai_op_p   → Solar PV Active Power (solarPower). Confirmed by R&D.
//                    Always positive (generation). No BESS sign semantics.
// ---------------------------------------------------------------------------

export interface NormalizedTelemetry {
  // ---- TelemetryHistory named columns ----
  // PCS
  pcsActivePower?: number;       // pcs.ai_p
  dcVoltage?: number;            // pcs.ai_dc_u
  ambientTemp?: number;          // pcs.ai_igbt_temp
  todayChargeEnergy?: number;    // pcs.ai_day_chg_cap
  todayDischargeEnergy?: number; // pcs.ai_day_dis_cap
  accumChargeEnergy?: number;    // pcs.ai_sum_chg_cap
  accumDischargeEnergy?: number; // pcs.ai_sum_dis_cap
  // Meter (rjl / jl)
  voltageA?: number;             // rjl|jl.ai_ua
  voltageB?: number;             // rjl|jl.ai_ub
  voltageC?: number;             // rjl|jl.ai_uc
  currentA?: number;             // rjl|jl.ai_ia
  currentB?: number;             // rjl|jl.ai_ib
  currentC?: number;             // rjl|jl.ai_ic
  totalPower?: number;           // rjl|jl.ai_sum_p
  // Grid Meter
  gridSideLoad?: number;         // pmg.ai_sum_p ONLY
  // Solar PV Inverter
  solarPower?: number;           // pinv.ai_op_p
  // Grid Frequency
  gridFrequency?: number;        // pmg.ai_freq
  // Power Factor
  powerFactor?: number;          // pmg.ai_sum_cos
  // BESS Frequency & PF
  bessFrequency?: number;        // pcs.ai_freq
  bessPowerFactor?: number;      // pcs.ai_sum_cos
  // Solar Frequency & PF
  solarFrequency?: number;       // pinv.ai_freq
  solarPowerFactor?: number;     // pinv.ai_cos
  // BMS — populated when source is confirmed (bcms)
  soc?: number;                  // bcms.ai_sum_soc
  soh?: number;                  // bcms.ai_sum_soh
  bmsCurrent?: number;           // bcms.ai_sum_i
  cellVMax?: number;             // bcms.ai_max_cell_vol
  cellVMin?: number;             // bcms.ai_min_vol
  cellTempMax?: number;          // bcms.ai_max_temp
  // Voltage Trend Signals
  gridVoltageUab?: number;
  gridVoltageUbc?: number;
  gridVoltageUca?: number;
  bessVoltageUa?: number;
  bessVoltageUb?: number;
  bessVoltageUc?: number;
  gridOnState?: number;          // pcs.di_ongrid_state
  gridOffState?: number;         // pcs.di_offgrid_state

  // Legacy/unused named columns left as undefined to preserve DB nullability

  // ---- WebSocket payload fields ----
  wsData: {
    // PCS
    bessPower?: number;           // pcs.ai_p
    pcsState?: string;
    pcsDcVoltage?: number;
    pcsTemp?: number;
    todayChargeEnergy?: number;
    todayDischargeEnergy?: number;
    accChargeEnergy?: number;
    accDischargeEnergy?: number;
    // Meter
    phaseAVoltage?: number;
    phaseBVoltage?: number;
    phaseCVoltage?: number;
    phaseACurrent?: number;
    phaseBCurrent?: number;
    phaseCCurrent?: number;
    // Grid
    gridPower?: number;
    gridPhaseAVoltage?: number;
    // Solar PV Inverter
    solarPower?: number;          // pinv.ai_op_p
    solarFrequency?: number;      // pinv.ai_freq
    solarPowerFactor?: number;    // pinv.ai_cos
    gridFrequency?: number;       // pmg.ai_freq
    powerFactor?: number;         // pmg.ai_sum_cos
    bessFrequency?: number;       // pcs.ai_freq
    bessPowerFactor?: number;     // pcs.ai_sum_cos
    // BMS — populated only when source is confirmed; empty in this phase
    bessSoc?: number;
    bmsSoh?: number;
    bmsCurrent?: number;
    cellVMax?: number;
    cellVMin?: number;
    cellTempMax?: number;
    cellTempMin?: number;        // bcms.ai_min_temp
    bmsDcVoltage?: number;       // bcms.ai_sum_u
    bmsCabinetState?: number;    // bcms.di_rcdhg_stat
    // Battery Status & Ambient
    batteryAmbientTemp?: number;  // th.ai_temp
    packAvgTemp?: number;         // pack_* average temperature
    packMaxTemp?: number;         // pack_* maximum temperature
    // PCS Telemetry Table (Phase 1) & TMS Ambient Temp
    pcsTemperature?: number;      // pcs.ai_igbt_temp
    pcsLineVoltage?: number;      // pcs avg(ai_out_uab, ai_out_ubc, ai_out_uca)
    pcsAcCurrent?: number;        // pcs avg(ai_ia, ai_ib, ai_ic)
    tmsAmbientTemp?: number;      // tms.ai_at
    // TMS Telemetry Table
    tmsOperatingMode?: number;         // tms.di_singco_state
    tmsCoolantReturnTemp?: number;     // tms.ai_iw_temp (°C)
    tmsCoolantInletTemp?: number;      // tms.ai_ow_temp (°C)
    tmsCoolantReturnPressure?: number; // tms.ai_iw_prs (bar)
    tmsCoolantInletPressure?: number;  // tms.ai_ow_prs (bar)
  };
}

/**
 * PCS di_singco_state value → human-readable string.
 * Values confirmed from Old Dashboard reference:
 *   0 = Stop
 *   1 = Standby
 *   2 = Fault
 *   3 = Charging
 *   4 = Discharging
 */
export function normalizePcsState(rawValue: number): string {
  const map: Record<number, string> = {
    0: 'Stop',
    1: 'Standby',
    2: 'Fault',
    3: 'Charging',
    4: 'Discharging',
  };
  return map[rawValue] ?? `Unknown(${rawValue})`;
}

/**
 * Normalizes the raw signal array for a single MQTT component block.
 *
 * @param componentId  The `devs[].dev` string from the MQTT payload (e.g. "pcs", "pmg")
 * @param signals      The `devs[].d` array: Array<{ m: string; v: any; dq?: number; t?: number }>
 * @returns            A NormalizedTelemetry object ready for DB + WS broadcast
 */
export function normalizeComponentSignals(
  componentId: string,
  signals: Array<{ m: string; v: any }>
): NormalizedTelemetry {
  const result: NormalizedTelemetry = { wsData: {} };

  // Build a quick lookup map from signal name → value for this component
  const sigMap = new Map<string, any>();
  for (const sig of signals) {
    if (sig.m !== undefined && sig.v !== undefined) {
      sigMap.set(sig.m, sig.v);
    }
  }

  const get = (name: string): number | undefined => {
    const v = sigMap.get(name);
    return v !== undefined ? Number(v) : undefined;
  };

  // -------------------------------------------------------------------------
  // PCS — componentId === "pcs"
  // -------------------------------------------------------------------------
  if (componentId === 'pcs') {
    // ai_p → PCS Active Power (BESS Power). NOT Solar.
    const activePower = get('ai_p');
    result.pcsActivePower = activePower;
    result.wsData.bessPower = activePower;

    result.dcVoltage = get('ai_dc_u');
    result.wsData.pcsDcVoltage = result.dcVoltage;

    result.ambientTemp = get('ai_igbt_temp');
    result.wsData.pcsTemp = result.ambientTemp;

    result.todayChargeEnergy = get('ai_day_chg_cap');
    result.wsData.todayChargeEnergy = result.todayChargeEnergy;

    result.todayDischargeEnergy = get('ai_day_dis_cap');
    result.wsData.todayDischargeEnergy = result.todayDischargeEnergy;

    result.accumChargeEnergy = get('ai_sum_chg_cap');
    result.wsData.accChargeEnergy = result.accumChargeEnergy;

    result.accumDischargeEnergy = get('ai_sum_dis_cap');
    result.wsData.accDischargeEnergy = result.accumDischargeEnergy;

    // di_singco_state → normalized PCS state string
    const rawState = sigMap.get('di_singco_state');
    if (rawState !== undefined) {
      result.wsData.pcsState = normalizePcsState(Number(rawState));
    }

    // Voltage Trend Signals (grid and bess voltages)
    const gridUab = get('ai_ac_uab') ?? get('ai_out_uab');
    if (gridUab !== undefined) result.gridVoltageUab = gridUab;

    const gridUbc = get('ai_ac_ubc') ?? get('ai_out_ubc');
    if (gridUbc !== undefined) result.gridVoltageUbc = gridUbc;

    const gridUca = get('ai_ac_uca') ?? get('ai_out_uca');
    if (gridUca !== undefined) result.gridVoltageUca = gridUca;

    const bessUab = get('ai_out_uab');
    if (bessUab !== undefined) result.bessVoltageUa = bessUab;

    const bessUbc = get('ai_out_ubc');
    if (bessUbc !== undefined) result.bessVoltageUb = bessUbc;

    const bessUca = get('ai_out_uca');
    if (bessUca !== undefined) result.bessVoltageUc = bessUca;

    const onState = get('di_ongrid_state');
    if (onState !== undefined) result.gridOnState = onState; // Source: pcs.di_ongrid_state → Grid ON State

    const offState = get('di_offgrid_state');
    if (offState !== undefined) result.gridOffState = offState; // Source: pcs.di_offgrid_state → Grid OFF State

    result.bessFrequency = get('ai_freq'); // Source: pcs.ai_freq → TelemetryHistory.bessFrequency
    result.wsData.bessFrequency = result.bessFrequency; // Source: pcs.ai_freq → WebSocket bessFrequency

    result.bessPowerFactor = get('ai_cos'); // Source: pcs.ai_cos → BESS/PCS Power Factor
    result.wsData.bessPowerFactor = result.bessPowerFactor;

    // PCS Temperature: strictly pcs.ai_igbt_temp (no fallback to ai_temp or ai_ta)
    const pcsAiTemp = getPcsTemperature(get('ai_igbt_temp'));
    if (pcsAiTemp !== undefined) {
      result.wsData.pcsTemperature = pcsAiTemp;
    }

    // PCS Line Voltage: arithmetic mean of ai_out_uab, ai_out_ubc, ai_out_uca
    const lineVolt = calculateLineVoltage(bessUab, bessUbc, bessUca);
    if (lineVolt !== undefined) {
      result.wsData.pcsLineVoltage = lineVolt;
    }

    // PCS AC Current: arithmetic mean of ai_ia, ai_ib, ai_ic
    const ia = get('ai_ia');
    const ib = get('ai_ib');
    const ic = get('ai_ic');
    const acCurr = calculateAcCurrent(ia, ib, ic);
    if (acCurr !== undefined) {
      result.wsData.pcsAcCurrent = acCurr;
    }

    // NOTE: pcs.ai_sum_p is NOT extracted — it does not appear in the Old Dashboard
    // PCS signal reference and MUST NOT be treated as gridSideLoad.
    return result;
  }

  // -------------------------------------------------------------------------
  // Cabinet Meter — componentId === "rjl" or "jl"
  // -------------------------------------------------------------------------
  if (componentId === 'rjl' || componentId === 'jl') {
    result.voltageA = get('ai_ua');
    result.wsData.phaseAVoltage = result.voltageA;

    result.voltageB = get('ai_ub');
    result.wsData.phaseBVoltage = result.voltageB;

    result.voltageC = get('ai_uc');
    result.wsData.phaseCVoltage = result.voltageC;

    result.currentA = get('ai_ia');
    result.wsData.phaseACurrent = result.currentA;

    result.currentB = get('ai_ib');
    result.wsData.phaseBCurrent = result.currentB;

    result.currentC = get('ai_ic');
    result.wsData.phaseCCurrent = result.currentC;

    // ai_sum_p → Cabinet Meter Total Power. NEVER gridSideLoad.
    result.totalPower = get('ai_sum_p');
    // totalPower is not in the WS payload contract — it is a DB-only named column
    // for cabinet meter total power. The frontend reads it from REST if needed.

    return result;
  }

  // -------------------------------------------------------------------------
  // Grid Side Meter — componentId === "pmg"
  // ONLY pmg.ai_sum_p maps to gridSideLoad / gridPower.
  // -------------------------------------------------------------------------
  if (componentId === 'pmg') {
    result.gridSideLoad = get('ai_sum_p');
    result.wsData.gridPower = result.gridSideLoad;

    // Fallback Phase Voltage extraction (e.g. for Angad hardware which sends it via pmg instead of rjl)
    const ua = get('ai_ua');
    if (ua !== undefined) {
      result.voltageA = ua;
      result.wsData.gridPhaseAVoltage = ua;
    }
    
    result.gridFrequency = get('ai_freq');
    result.wsData.gridFrequency = result.gridFrequency;

    result.powerFactor = get('ai_sum_cos');
    result.wsData.powerFactor = result.powerFactor;

    return result;
  }

  // -------------------------------------------------------------------------
  // BMS — componentId === "bcms"
  // -------------------------------------------------------------------------
  if (componentId === 'bcms') {
    const getNumeric = (name: string): number | undefined => {
      const v = sigMap.get(name);
      if (v === undefined || v === null) return undefined;
      if (typeof v === 'string' && v.trim() === '') return undefined;
      const num = Number(v);
      return Number.isFinite(num) ? num : undefined;
    };

    result.soc = getNumeric('ai_sum_soc');
    result.wsData.bessSoc = result.soc;

    result.soh = getNumeric('ai_sum_soh');
    result.wsData.bmsSoh = result.soh;

    result.bmsCurrent = getNumeric('ai_sum_i');
    result.wsData.bmsCurrent = result.bmsCurrent;

    result.cellVMax = getNumeric('ai_max_cell_vol');
    result.wsData.cellVMax = result.cellVMax;

    result.cellVMin = getNumeric('ai_min_vol');
    result.wsData.cellVMin = result.cellVMin;

    result.cellTempMax = getNumeric('ai_max_temp');
    result.wsData.cellTempMax = result.cellTempMax;

    const minTemp = getNumeric('ai_min_temp');
    if (minTemp !== undefined) {
      result.wsData.cellTempMin = minTemp;
    }

    const bmsDcVolt = getNumeric('ai_sum_u');
    if (bmsDcVolt !== undefined) {
      result.wsData.bmsDcVoltage = bmsDcVolt;
    }

    const rawCabinetState = sigMap.get('di_rcdhg_stat');
    if (rawCabinetState !== undefined) {
      const normState = normalizeCabinetState(rawCabinetState);
      if (normState !== undefined) {
        result.wsData.bmsCabinetState = normState;
      }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // PV Inverter — componentId === "pinv"
  // Confirmed R&D signal: ai_op_p → Solar PV Active Power (kW)
  // Sign convention: always positive (generation). No BESS charging semantics.
  // -------------------------------------------------------------------------
  if (componentId === 'pinv') {
    result.solarPower = get('ai_op_p');
    result.wsData.solarPower = result.solarPower;
    
    result.solarFrequency = get('ai_freq');
    result.wsData.solarFrequency = result.solarFrequency;

    result.solarPowerFactor = get('ai_cos');
    result.wsData.solarPowerFactor = result.solarPowerFactor;
    return result;
  }

  // -------------------------------------------------------------------------
  // Temperature & Humidity Sensor — componentId === "th"
  // Confirmed mapping: ai_temp → Battery Ambient Temperature (°C)
  // Preserves pcs.ambientTemp untouched; does NOT write to result.ambientTemp.
  // -------------------------------------------------------------------------
  if (componentId === 'th') {
    const ambient = get('ai_temp');
    if (ambient !== undefined) {
      result.wsData.batteryAmbientTemp = ambient;
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // Thermal Management System — componentId === "tms"
  // Confirmed mappings:
  // 1. Operating Mode: tms.di_singco_state (0=STOP, 1=SELF-CIRCULATION, 2=UNKNOWN, 3=HEATING, 4=FAULT)
  // 2. Ambient Temperature: tms.ai_at (°C)
  // 3. Battery Coolant Return Temperature: tms.ai_iw_temp (°C)
  // 4. Battery Coolant Inlet Temperature: tms.ai_ow_temp (°C)
  // 5. Coolant Return Pressure: tms.ai_iw_prs (bar)
  // 6. Coolant Inlet Pressure: tms.ai_ow_prs (bar)
  // -------------------------------------------------------------------------
  if (componentId === 'tms') {
    const ambient = getTmsAmbientTemperature(get('ai_at'));
    if (ambient !== undefined) {
      result.wsData.tmsAmbientTemp = ambient;
    }

    const rawMode = sigMap.get('di_singco_state');
    if (rawMode !== undefined) {
      const normMode = normalizeTmsMode(rawMode);
      if (normMode !== undefined) {
        result.wsData.tmsOperatingMode = normMode;
      }
    }

    const iwTemp = get('ai_iw_temp');
    if (iwTemp !== undefined) {
      result.wsData.tmsCoolantReturnTemp = iwTemp;
    }

    const owTemp = get('ai_ow_temp');
    if (owTemp !== undefined) {
      result.wsData.tmsCoolantInletTemp = owTemp;
    }

    const iwPrs = get('ai_iw_prs');
    if (iwPrs !== undefined) {
      result.wsData.tmsCoolantReturnPressure = iwPrs;
    }

    const owPrs = get('ai_ow_prs');
    if (owPrs !== undefined) {
      result.wsData.tmsCoolantInletPressure = owPrs;
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Battery Packs — componentId === "pack_01" .. "pack_05"
  // Calculates average and maximum temperature using the manager's rule:
  // - Retains legitimate zeros within active sequence
  // - Excludes trailing inactive zeros
  // - Discards malformed/null/NaN without zero-coercion
  // - Does not invent values for all-zero packs
  // -------------------------------------------------------------------------
  if (componentId.startsWith('pack_')) {
    // Select ONLY recognized temperature signals from verified firmware schema:
    // - ai_temp_01 .. ai_temp_28 (cell temperature probes)
    // - ai_negpol_temp, ai_pospol_temp (pole temperatures)
    // NEVER fall back to averaging arbitrary signals if no temperature signals match.
    const tempSignals = signals.filter(s => s.m && isRecognizedPackTemperatureSignal(s.m));

    if (tempSignals.length > 0) {
      const calc = calculatePackTemperatures(tempSignals.map(s => s.v));
      if (calc.avgTemp !== undefined) {
        result.wsData.packAvgTemp = calc.avgTemp;
      }
      if (calc.maxTemp !== undefined) {
        result.wsData.packMaxTemp = calc.maxTemp;
      }
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // All other components (tms, io, ecu, bc_*, bmu_*, etc.)
  // No named-column mapping in this phase.
  // rawPayload is still preserved in the persistence layer.
  // wsData remains empty for these — frontend reads di_* faults from rawPayload via REST.
  // -------------------------------------------------------------------------
  return result;
}

// ---------------------------------------------------------------------------
// MqttService
// ---------------------------------------------------------------------------

export class MqttService {
  private client: MqttClient | null = null;
  private isConnecting = false;

  private async loadTopicsAndSubscribe() {
    try {
      const bessAssets = await prisma.bESSAsset.findMany({
        where: { mqttTopic: { not: null } },
        select: { mqttTopic: true }
      });

      const topics = new Set<string>();

      const fallbackTopic = process.env.MQTT_TOPIC?.trim();
      if (fallbackTopic) {
        topics.add(fallbackTopic);
      }

      for (const asset of bessAssets) {
        if (asset.mqttTopic && asset.mqttTopic.trim().length > 0) {
          topics.add(asset.mqttTopic.trim());
        }
      }

      if (topics.size === 0) {
        console.warn('[MQTT] No MQTT topics configured in DB or fallback.');
        return;
      }

      const topicArray = Array.from(topics);
      console.log(`[MQTT] Subscribing to ${topicArray.length} topics...`);
      console.log(`[MQTT DEBUG] Topics being subscribed:`);
      topicArray.forEach((t, i) => console.log(`[MQTT DEBUG] ${i + 1}. ${t}`));

      this.client?.subscribe(topicArray, (err, granted) => {
        if (err) {
          console.error(`[MQTT] Subscription error on topics:`, err);
        } else {
          console.log(`[MQTT] Successfully subscribed to ${topicArray.length} topics`);
          if (granted) {
            granted.forEach(g => console.log(`[MQTT DEBUG] Subscription confirmed: ${g.topic}`));
          }
        }
      });
    } catch (error) {
      console.error('[MQTT] Failed to load topics from database.', error);
      // Fallback
      const fallbackTopic = process.env.MQTT_TOPIC?.trim();
      if (fallbackTopic && this.client) {
        this.client.subscribe(fallbackTopic, (err) => {
          if (err) console.error(`[MQTT] Fallback subscription error on topic: ${fallbackTopic}`, err);
          else console.log(`[MQTT] Subscribed to fallback topic: ${fallbackTopic}`);
        });
      }
    }
  }

  public subscribeToTopic(topic: string) {
    if (this.client && topic && topic.trim().length > 0) {
      this.client.subscribe(topic.trim(), (err) => {
        if (err) {
          console.error(`[MQTT] Failed to subscribe to new topic: ${topic}`, err);
        } else {
          console.log(`[MQTT] Successfully subscribed to new topic: ${topic}`);
        }
      });
    }
  }

  public unsubscribeFromTopic(topic: string) {
    if (this.client && topic && topic.trim().length > 0) {
      this.client.unsubscribe(topic.trim(), (err) => {
        if (err) {
          console.error(`[MQTT] Failed to unsubscribe from old topic: ${topic}`, err);
        } else {
          console.log(`[MQTT] Successfully unsubscribed from old topic: ${topic}`);
        }
      });
    }
  }

  public connect() {
    if (this.isConnecting || this.client) return;
    this.isConnecting = true;

    const url = process.env.MQTT_BROKER_URL;
    const protocol = process.env.MQTT_PROTOCOL || 'mqtts';
    const port = Number(process.env.MQTT_PORT) || 8883;
    const username = process.env.MQTT_USERNAME;
    const password = process.env.MQTT_PASSWORD;
    const clientId = process.env.MQTT_CLIENT_ID || 'ems_backend_local';
    if (!url || !username || !password) {
      console.warn('[MQTT] Connection skipped: Missing required environment variables (URL/Credentials).');
      this.isConnecting = false;
      return;
    }

    let brokerUrl = url;
    if (!brokerUrl.includes('://')) {
      brokerUrl = `${protocol}://${brokerUrl}`;
    }
    if (!brokerUrl.split('://')[1].includes(':')) {
      brokerUrl = `${brokerUrl}:${port}`;
    }
    console.log(`[MQTT] Connecting to broker...`);
    try {
      const parsedUrl = new URL(brokerUrl);
      console.log(`[MQTT DEBUG] Active broker host: ${parsedUrl.hostname}`);
    } catch (e) {
      console.log(`[MQTT DEBUG] Active broker host: ${brokerUrl}`);
    }

    this.client = mqtt.connect(brokerUrl, {
      clientId,
      username,
      password,
      reconnectPeriod: 5000,
      connectTimeout: 30 * 1000,
      rejectUnauthorized: true // Secure TLS validation
    });

    this.client.on('connect', () => {
      console.log('[MQTT] Connected');
      this.loadTopicsAndSubscribe();
    });

    this.client.on('reconnect', () => {
      console.log('[MQTT] Reconnecting...');
    });

    this.client.on('disconnect', () => {
      console.log('[MQTT] Disconnected');
    });

    this.client.on('error', (_err: any) => {
      console.error('[MQTT] Connection Error (details hidden for security)');
    });

    this.client.on('message', async (topic, message) => {
      this.handleMessage(topic, message);
    });

    this.isConnecting = false;
  }

  public async handleMessage(topic: string, message: Buffer) {
    console.log(`[MQTT DEBUG] Message received`);
    console.log(`[MQTT DEBUG] Topic: ${topic}`);
    console.log(`[MQTT DEBUG] Payload bytes: ${message.length}`);
    try {
      const payloadString = message.toString();
      let payload;

      try {
        payload = JSON.parse(payloadString);
        console.log(`[MQTT DEBUG] Payload parsed`);
      } catch (e) {
        console.log(`[MQTT DEBUG] JSON parse failed for topic: ${topic}`);
        console.warn('[MQTT] Warning: Received malformed JSON payload. Ignored.');
        return;
      }

      // Validate top-level structure
      if (!payload || !payload.sn) {
        console.log(`[MQTT DEBUG] Missing payload.sn for topic: ${topic}`);
      } else {
        console.log(`[MQTT DEBUG] EMU/SN: ${payload.sn}`);
      }

      if (payload && Array.isArray(payload.devs)) {
        console.log(`[MQTT DEBUG] devs count: ${payload.devs.length}`);
        if (payload.devs.length === 0) {
          console.log(`[MQTT DEBUG] Payload contains 0 devices`);
        } else {
          console.log(`[MQTT DEBUG] Components: ${payload.devs.map((d: any) => d.dev).join(', ')}`);
        }
      }

      if (!payload || !payload.sn || !Array.isArray(payload.devs)) {
        console.warn('[MQTT] Warning: Payload missing required base fields (sn, devs). Ignored.');
        return;
      }

      const emuSn = String(payload.sn);

      const bessAsset = await prisma.bESSAsset.findUnique({
        where: { emuId: emuSn },
        select: { id: true, siteId: true, mqttTopic: true }
      });

      if (!bessAsset) {
        console.log(`[MQTT DEBUG] No BESSAsset found for EMU: ${emuSn}`);
        console.warn(`[MQTT] Warning: Unknown EMU ${emuSn}. Persistence skipped.`);
        return;
      }

      // Phase 3 — Topic + BESS Identity Validation (Exact Match)
      let expectedTopic: string | undefined;
      
      if (bessAsset.mqttTopic !== null) {
        expectedTopic = bessAsset.mqttTopic.trim();
      } else {
        const fallback = process.env.MQTT_TOPIC?.trim();
        if (fallback) {
          expectedTopic = fallback;
        }
      }

      if (!expectedTopic || topic !== expectedTopic) {
        console.warn(`[MQTT] Topic validation failed for EMU ${emuSn}. Incoming topic does not match expected BESS topic. (Incoming: ${topic}, Expected: ${expectedTopic ?? 'NONE'})`);
        return;
      }

      // Process each component block
      for (const component of payload.devs) {
        if (!component || !component.dev || !Array.isArray(component.d)) {
          console.warn(`[MQTT] Warning: Malformed devs block in payload for EMU ${emuSn}. Skipping block.`);
          continue;
        }

        const componentDev: string = component.dev;

        // Count valid signals (must have both m and v)
        let validSignals = 0;
        const validSignalArray: Array<{ m: string; v: any }> = [];
        for (const signal of component.d) {
          if (signal.m === undefined || signal.v === undefined) {
            console.warn(`[MQTT] Warning: Signal missing m or v inside EMU ${emuSn} -> ${componentDev}. Skipping signal.`);
            continue;
          }
          validSignals++;
          validSignalArray.push(signal);
        }

        if (validSignals === 0) continue;

        try {
          const device = await prisma.device.findUnique({
            where: {
              bessAssetId_componentId: {
                bessAssetId: bessAsset.id,
                componentId: componentDev
              }
            }
          });

          if (!device) {
            console.log(`[MQTT] Persistence skipped: Missing Device mapping for EMU ${emuSn} Component ${componentDev} (${validSignals} signals received)`);
            continue;
          }

          // Timestamp priority: component.ts → payload.ts → server time
          const tsEpoch = component.ts !== undefined ? component.ts : payload.ts;
          const recordDate = tsEpoch ? new Date(tsEpoch * 1000) : new Date();

          // Normalize signals using the pure normalization function
          const normalized = normalizeComponentSignals(componentDev, validSignalArray);

          // Persist to TelemetryHistory — named columns + complete rawPayload
          await prisma.telemetryHistory.create({
            data: {
              deviceId: device.id,
              timestamp: recordDate,
              // PCS named columns
              pcsActivePower:        normalized.pcsActivePower        ?? null,
              dcVoltage:             normalized.dcVoltage             ?? null,
              ambientTemp:           normalized.ambientTemp           ?? null,
              todayChargeEnergy:     normalized.todayChargeEnergy     ?? null,
              todayDischargeEnergy:  normalized.todayDischargeEnergy  ?? null,
              accumChargeEnergy:     normalized.accumChargeEnergy     ?? null,
              accumDischargeEnergy:  normalized.accumDischargeEnergy  ?? null,
              // Meter named columns
              voltageA:              normalized.voltageA              ?? null,
              voltageB:              normalized.voltageB              ?? null,
              voltageC:              normalized.voltageC              ?? null,
              currentA:              normalized.currentA              ?? null,
              currentB:              normalized.currentB              ?? null,
              currentC:              normalized.currentC              ?? null,
              totalPower:            normalized.totalPower            ?? null,
              // Grid named column (pmg only)
              gridSideLoad:          normalized.gridSideLoad          ?? null,
              // Solar PV Inverter named column (pinv only)
              solarPower:            normalized.solarPower            ?? null,
              solarFrequency:        normalized.solarFrequency        ?? null,
              solarPowerFactor:      normalized.solarPowerFactor      ?? null,
              gridFrequency:         normalized.gridFrequency         ?? null,
              powerFactor:           normalized.powerFactor           ?? null,
              bessFrequency:         normalized.bessFrequency         ?? null,
              bessPowerFactor:       normalized.bessPowerFactor       ?? null,
              // BMS named columns — populated if bcms provided them
              soc:                   normalized.soc                   ?? null,
              soh:                   normalized.soh                   ?? null,
              bmsCurrent:            normalized.bmsCurrent            ?? null,
              cellVMax:              normalized.cellVMax              ?? null,
              cellVMin:              normalized.cellVMin              ?? null,
              cellTempMax:           normalized.cellTempMax           ?? null,
              // Voltage Trend Signals
              gridVoltageUab:        normalized.gridVoltageUab        ?? null,
              gridVoltageUbc:        normalized.gridVoltageUbc        ?? null,
              gridVoltageUca:        normalized.gridVoltageUca        ?? null,
              bessVoltageUa:         normalized.bessVoltageUa         ?? null,
              bessVoltageUb:         normalized.bessVoltageUb         ?? null,
              bessVoltageUc:         normalized.bessVoltageUc         ?? null,
              // Grid State Trend Signals
              gridOnState:           normalized.gridOnState           ?? null,
              gridOffState:          normalized.gridOffState          ?? null,
              // rawPayload: complete, unadulterated original signal array
              rawPayload: component.d as any,
            }
          });

          // WebSocket live broadcast
          const siteId = bessAsset.siteId;
          const livePayload: LiveTelemetryPayload = {
            type: 'telemetry',
            siteId,
            deviceId: device.id,
            emuId: emuSn,
            componentId: componentDev,
            timestamp: recordDate.toISOString(),
            data: normalized.wsData,
          };

          webSocketService.broadcastTelemetry(siteId, livePayload);

          // Phase 14C.7 - Alarm Ingestion
          await alarmIngestionService.processFaultSignals(siteId, device.id, componentDev, validSignalArray);

        } catch (err) {
          console.error(`[MQTT] Failed to persist telemetry for ${emuSn} -> ${componentDev}`, err);
        }
      }

    } catch (e) {
      console.error('[MQTT] Unexpected error during payload processing. (Safe fallback)');
    }
  }

  public disconnect() {
    if (this.client) {
      this.client.end();
      this.client = null;
      console.log('[MQTT] Disconnected safely.');
    }
  }
}

export const mqttService = new MqttService();
