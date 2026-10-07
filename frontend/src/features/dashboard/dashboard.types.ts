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
  energyCapacity?: number | null;
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

  // PCS (from pcs component)
  bessPower?: number;            // pcs.ai_p
  pcsState?: string;         // pcs.di_singco_state (normalised string)
  pcsDcVoltage?: number;     // pcs.ai_dc_u
  pcsTemp?: number;          // pcs.ai_igbt_temp
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

  // BMS — NOT populated in Phase 14C (BMS signal mapping unresolved)
  // These remain undefined and the UI shows "--"
  bessSoc?: number;
  bmsSoh?: number;
  bmsCurrent?: number;
  cellVMax?: number;
  cellVMin?: number;
  cellTempMax?: number;

  // Solar PV Inverter (pinv component — Step 1)
  solarPower?: number;           // pinv.ai_op_p (kW)
  solarFrequency?: number;       // pinv.ai_freq
  solarPowerFactor?: number;     // pinv.ai_cos

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
  soc: number | null;
  soh: number | null;
  bmsCurrent: number | null;
  cellVMax: number | null;
  cellVMin: number | null;
  cellTempMax: number | null;
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
}

// ---------------------------------------------------------------------------
// Telemetry snapshot 15m API response row
// ---------------------------------------------------------------------------

export interface TelemetrySnapshotRow {
  id: string;
  bessAssetId: string;
  emuId?: string | null;
  bucketTimestamp: string;
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
}

export interface GridStateTrendPoint {
  timestamp: string;
  gridOnState: number | null;
  gridOffState: number | null;
}
