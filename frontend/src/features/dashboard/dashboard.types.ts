/**
 * Phase 14C.3 — Shared Dashboard Types
 *
 * This file owns the runtime types used by the Client Dashboard and its
 * sub-components (EnergyFlowDiagram, PowerTrendChart, KPI cards).
 *
 * These types are decoupled from mockTelemetryData.ts.
 * All fields are explicitly optional — the dashboard must handle undefined
 * values with a "--" unavailable state; it must NOT fall back to mock values.
 */

// ---------------------------------------------------------------------------
// Context resolved from the authenticated user's client hierarchy
// ---------------------------------------------------------------------------

export interface DashboardContext {
  client: DashboardClient;
  site: DashboardSite;
  bessAssets: DashboardBessAsset[];
  devices: DashboardDevice[];
}

export interface DashboardClient {
  id: string;
  name: string;
}

export interface DashboardSite {
  id: string;
  name: string;
  timezone?: string | null;
}

export interface DashboardBessAsset {
  id: string;
  name: string;
  assetIdentifier: string;
  emuId?: string | null;
  energyCapacity?: number | null;
  reportIntervalMinutes?: number;
  model?: string | null;
  powerRating?: number | null;
}

export interface DashboardDevice {
  id: string;
  name: string | null;
  type: string;
  componentId: string;
  emuId: string;
  bessAssetId?: string; // Added for multi-BESS grouping
}

// ---------------------------------------------------------------------------
// Telemetry snapshot — used for both REST initial state and WS updates
// All fields are optional; undefined = "no data available" → render as "--"
// ---------------------------------------------------------------------------

export interface DashboardTelemetryState {
  timestamp?: string; // Kept for backward compatibility with general UI and other pages
  pcsTimestamp?: string;
  pmgTimestamp?: string;
  pinvTimestamp?: string;
  bcmsTimestamp?: string;
  rjlTimestamp?: string;
  thTimestamp?: string;
  tmsTimestamp?: string;

  // Signal-level measurement timestamps
  gridPowerMeasuredAt?: string;
  gridFrequencyMeasuredAt?: string;
  powerFactorMeasuredAt?: string;
  bessPowerMeasuredAt?: string;
  bessFrequencyMeasuredAt?: string;
  bessPowerFactorMeasuredAt?: string;
  solarPowerMeasuredAt?: string;
  solarFrequencyMeasuredAt?: string;
  solarPowerFactorMeasuredAt?: string;
  bessSocMeasuredAt?: string;
  bmsSohMeasuredAt?: string;
  bmsCurrentMeasuredAt?: string;
  cellTempMaxMeasuredAt?: string;
  cellTempMinMeasuredAt?: string;
  cellVMaxMeasuredAt?: string;
  cellVMinMeasuredAt?: string;
  bmsDcVoltageMeasuredAt?: string;
  bmsCabinetStateMeasuredAt?: string;
  pcsDcVoltageMeasuredAt?: string;
  pcsTempMeasuredAt?: string;
  todayChargeEnergyMeasuredAt?: string;
  todayDischargeEnergyMeasuredAt?: string;
  accChargeEnergyMeasuredAt?: string;
  accDischargeEnergyMeasuredAt?: string;
  pcsTemperatureMeasuredAt?: string;
  pcsLineVoltageMeasuredAt?: string;
  pcsAcCurrentMeasuredAt?: string;
  tmsAmbientTempMeasuredAt?: string;
  tmsOperatingModeMeasuredAt?: string;
  tmsCoolantReturnTempMeasuredAt?: string;
  tmsCoolantInletTempMeasuredAt?: string;
  tmsCoolantReturnPressureMeasuredAt?: string;
  tmsCoolantInletPressureMeasuredAt?: string;
  voltageAMeasuredAt?: string;
  voltageBMeasuredAt?: string;
  voltageCMeasuredAt?: string;
  currentAMeasuredAt?: string;
  currentBMeasuredAt?: string;
  currentCMeasuredAt?: string;
  totalPowerMeasuredAt?: string;

  // PCS (from pcs component)
  bessPower?: number;            // pcs.ai_p
  pcsState?: string;         // pcs.di_singco_state (normalised string)
  pcsDcVoltage?: number;     // pcs.ai_dc_u
  pcsTemp?: number;          // pcs.ai_igbt_temp
  pcsTemperature?: number;   // pcs.ai_igbt_temp
  pcsLineVoltage?: number;   // pcs avg(ai_out_uab, ai_out_ubc, ai_out_uca)
  pcsAcCurrent?: number;     // pcs avg(ai_ia, ai_ib, ai_ic)
  tmsAmbientTemp?: number;   // tms.ai_at → Ambient Temperature (°C)
  todayChargeEnergy?: number;    // pcs.ai_day_chg_cap
  todayDischargeEnergy?: number; // pcs.ai_day_dis_cap
  accChargeEnergy?: number;      // pcs.ai_sum_chg_cap
  accDischargeEnergy?: number;   // pcs.ai_sum_dis_cap
  gridFrequency?: number;        // pmg.ai_freq
  powerFactor?: number;          // pmg.ai_sum_cos

  // BESS Frequency & Power Factor
  bessFrequency?: number;        // pcs.ai_freq
  bessPowerFactor?: number;      // pcs.ai_cos → BESS/PCS Power Factor

  // Grid Side Meter (from pmg component)
  gridPower?: number;        // pmg.ai_sum_p

  // Cabinet Meter (from rjl component)
  voltageA?: number;         // rjl.ai_ua
  voltageB?: number;         // rjl.ai_ub
  voltageC?: number;         // rjl.ai_uc
  currentA?: number;         // rjl.ai_ia
  currentB?: number;         // rjl.ai_ib
  currentC?: number;         // rjl.ai_ic
  totalPower?: number;       // rjl.ai_sum_p (REST only)

  // BMS (Phase 2 BMS Telemetry Table)
  bessSoc?: number;
  bmsSoh?: number;
  bmsCurrent?: number;
  cellVMax?: number;
  cellVMin?: number;
  cellTempMax?: number;
  cellTempMin?: number;
  bmsDcVoltage?: number;
  bmsCabinetState?: number;

  // TMS (Thermal Management System Telemetry Table)
  tmsOperatingMode?: number;
  tmsCoolantReturnTemp?: number;
  tmsCoolantInletTemp?: number;
  tmsCoolantReturnPressure?: number;
  tmsCoolantInletPressure?: number;

  // Solar PV Inverter (pinv component — Step 1)
  solarPower?: number;           // pinv.ai_op_p (kW)
  solarFrequency?: number;       // pinv.ai_freq
  solarPowerFactor?: number;     // pinv.ai_cos

  // Battery Status & Ambient
  batteryAmbientTemp?: number;
  batteryAmbientTempMeasuredAt?: string;
  packTemperatures?: Record<string, { avgTemp?: number; maxTemp?: number; measuredAt?: string }>;

  // Load: No confirmed source.
  // loadPower is NOT in this interface — no signal-level confirmation.
}

// ---------------------------------------------------------------------------
// Historical power trend data point — Grid + BESS only (confirmed sources)
// ---------------------------------------------------------------------------

export interface PowerTrendPoint {
  /** Unix timestamp for accurate continuous plotting */
  timestamp: number;
  /** gridSideLoad from pmg — kW */
  grid?: number;
  /** pcsActivePower from pcs — kW */
  bess?: number;
  /** soc from bcms — % */
  soc?: number;
  /** Future: solar power (kW) */
  solar?: number;
  /** Future: load power (kW) */
  load?: number;
  /** Total BESS charging active power — kW (>= 0) */
  bessCharge?: number;
  /** Total BESS discharging active power — kW (represented with negative sign convention, <= 0) */
  bessDischarge?: number;
}

// ---------------------------------------------------------------------------
// Latest telemetry API response row (from GET /api/sites/:siteId/telemetry/latest)
// ---------------------------------------------------------------------------

export interface LatestTelemetryRow {
  id: string;
  deviceId: string;
  timestamp: string;
  pcsActivePower: number | null;
  dcVoltage: number | null;
  ambientTemp: number | null;
  todayChargeEnergy: number | null;
  todayDischargeEnergy: number | null;
  accumChargeEnergy: number | null;
  accumDischargeEnergy: number | null;
  voltageA: number | null;
  voltageB: number | null;
  voltageC: number | null;
  currentA: number | null;
  currentB: number | null;
  currentC: number | null;
  totalPower: number | null;
  gridSideLoad: number | null;
  solarPower: number | null;  // pinv.ai_op_p (kW) — Step 1
  solarFrequency: number | null;
  solarPowerFactor: number | null;
  gridFrequency: number | null;
  powerFactor: number | null;
  bessFrequency: number | null;
  bessPowerFactor: number | null;
  bessPowerFactorMeasuredAt?: string;
  soc: number | null;
  soh: number | null;
  bmsCurrent: number | null;
  cellVMax: number | null;
  cellVMin: number | null;
  cellTempMax: number | null;
  cellTempMin?: number | null;
  bmsDcVoltage?: number | null;
  bmsCabinetState?: number | string | null;
  tmsOperatingMode?: number | string | null;
  tmsCoolantReturnTemp?: number | null;
  tmsCoolantInletTemp?: number | null;
  tmsCoolantReturnPressure?: number | null;
  tmsCoolantInletPressure?: number | null;
  rawPayload: unknown;
  ingestedAt: string;
  device: {
    id: string;
    componentId: string;
    type: string;
    name: string | null;
    bessAssetId?: string; // Added for multi-BESS grouping
  };
}

// ---------------------------------------------------------------------------
// Historical telemetry API response row
// ---------------------------------------------------------------------------

export interface HistoricalTelemetryRow {
  id: string;
  deviceId: string;
  timestamp: string;
  pcsActivePower: number | null;
  dcVoltage: number | null;
  ambientTemp: number | null;
  todayChargeEnergy: number | null;
  todayDischargeEnergy: number | null;
  accumChargeEnergy: number | null;
  accumDischargeEnergy: number | null;
  voltageA: number | null;
  voltageB: number | null;
  voltageC: number | null;
  currentA: number | null;
  currentB: number | null;
  currentC: number | null;
  totalPower: number | null;
  gridSideLoad: number | null;
  solarPower: number | null;  // pinv.ai_op_p (kW) — Step 1
  solarFrequency: number | null;
  solarPowerFactor: number | null;
  gridFrequency: number | null;
  powerFactor: number | null;
  bessFrequency: number | null;
  bessPowerFactor: number | null;
  soc: number | null;
  soh: number | null;
  bmsCurrent: number | null;
  cellVMax: number | null;
  cellVMin: number | null;
  cellTempMax: number | null;
  cellTempMin?: number | null;
  bmsDcVoltage?: number | null;
  bmsCabinetState?: number | string | null;
  tmsOperatingMode?: number | string | null;
  tmsCoolantReturnTemp?: number | null;
  tmsCoolantInletTemp?: number | null;
  tmsCoolantReturnPressure?: number | null;
  tmsCoolantInletPressure?: number | null;
  bessAssetId?: string;
  device?: {
    id: string;
    componentId?: string;
    type?: string;
    name?: string | null;
    bessAssetId?: string;
  };
}

// ---------------------------------------------------------------------------
// Telemetry snapshot 15m API response row
// ---------------------------------------------------------------------------

export interface TelemetrySnapshotRow {
  id: string;
  bessAssetId: string;
  bessName?: string | null;
  emuId?: string | null;
  bucketTimestamp: string;
  pcsActivePower: number | null;
  dcVoltage: number | null;
  ambientTemp: number | null;
  pcsTemperature?: number | null;
  pcsLineVoltage?: number | null;
  pcsAcCurrent?: number | null;
  tmsAmbientTemp?: number | null;
  todayChargeEnergy: number | null;
  todayDischargeEnergy: number | null;
  accumChargeEnergy: number | null;
  accumDischargeEnergy: number | null;
  voltageA: number | null;
  voltageB: number | null;
  voltageC: number | null;
  currentA: number | null;
  currentB: number | null;
  currentC: number | null;
  totalPower: number | null;
  gridSideLoad: number | null;
  solarPower: number | null;  // pinv.ai_op_p (kW) — Step 1
  solarFrequency: number | null;
  solarPowerFactor: number | null;
  gridFrequency: number | null;
  powerFactor: number | null;
  bessFrequency: number | null;
  bessPowerFactor: number | null;
  soc: number | null;
  soh: number | null;
  bmsCurrent: number | null;
  cellVMax: number | null;
  cellVMin: number | null;
  cellTempMax: number | null;
  cellTempMin?: number | null;
  bmsDcVoltage?: number | null;
  bmsCabinetState?: number | string | null;
  tmsOperatingMode?: number | string | null;
  tmsCoolantReturnTemp?: number | null;
  tmsCoolantInletTemp?: number | null;
  tmsCoolantReturnPressure?: number | null;
  tmsCoolantInletPressure?: number | null;
  batteryAmbientTemp?: number | null;
  pack01AvgTemp?: number | null;
  pack01MaxTemp?: number | null;
  pack02AvgTemp?: number | null;
  pack02MaxTemp?: number | null;
  pack03AvgTemp?: number | null;
  pack03MaxTemp?: number | null;
  pack04AvgTemp?: number | null;
  pack04MaxTemp?: number | null;
  pack05AvgTemp?: number | null;
  pack05MaxTemp?: number | null;
}

export interface TelemetrySnapshotSummary {
  chargeDifference: number | null;
  dischargeDifference: number | null;
}

export interface VoltageTrendPoint {
  timestamp: string;
  gridVoltageUab: number | null;
  gridVoltageUbc: number | null;
  gridVoltageUca: number | null;
  bessVoltageUa: number | null;
  bessVoltageUb: number | null;
  bessVoltageUc: number | null;
  activeSource?: string;
  isBreakPoint?: boolean;
  isDuplicateTime?: boolean;
  index?: number;
}

export interface GridStateTrendPoint {
  timestamp: string;
  gridOnState: number | null;
  gridOffState: number | null;
}
