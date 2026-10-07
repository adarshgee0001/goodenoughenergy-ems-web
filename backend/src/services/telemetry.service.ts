import { prisma } from '../db/prisma';
import { TelemetryHistory, Device } from '@prisma/client';
import { LiveTelemetryPayload } from './websocket.service';
import { normalizePcsState } from './mqtt.service';

export type TelemetryWithDevice = TelemetryHistory & { 
  device: Device & { bessAsset?: { emuId: string } | null } 
};

export class TelemetryService {
  /**
   * Returns the single most-recent TelemetryHistory row per Device for the given site.
   */
  public async getSiteLatestTelemetry(siteId: string): Promise<TelemetryWithDevice[]> {
    const devices = await prisma.device.findMany({
      where: {
        bessAsset: { siteId }
      },
      select: { id: true, componentId: true, type: true, name: true, bessAssetId: true, bessAsset: { select: { emuId: true } } }
    });

    if (devices.length === 0) {
      return [];
    }

    const latestRows = await Promise.all(
      devices.map(async device => {
        const row = await prisma.telemetryHistory.findFirst({
          where: { deviceId: device.id },
          orderBy: { timestamp: 'desc' }
        });

        if (!row) return null;

        // Phase 14C.3 - Fallback for intermittently missing Power Factor
        if (device.componentId === 'pmg' && row.powerFactor === null) {
          const fiveMinutesAgo = new Date(row.timestamp.getTime() - 5 * 60 * 1000);
          const validPfRow = await prisma.telemetryHistory.findFirst({
            where: {
              deviceId: device.id,
              powerFactor: { not: null },
              timestamp: { gte: fiveMinutesAgo, lte: row.timestamp }
            },
            orderBy: { timestamp: 'desc' },
            select: { powerFactor: true }
          });
          
          if (validPfRow && validPfRow.powerFactor !== null) {
            row.powerFactor = validPfRow.powerFactor;
          }
        }

        // Fallback for RJL/JL intermittent fields
        if ((device.componentId === 'rjl' || device.componentId === 'jl') &&
            (row.totalPower === null || row.voltageA === null || row.voltageB === null ||
             row.voltageC === null || row.currentA === null || row.currentB === null || row.currentC === null)) {
          
          const fiveMinutesAgo = new Date(row.timestamp.getTime() - 5 * 60 * 1000);
          
          const recentRows = await prisma.telemetryHistory.findMany({
            where: {
              deviceId: device.id,
              timestamp: { gte: fiveMinutesAgo, lte: row.timestamp }
            },
            orderBy: { timestamp: 'desc' },
            select: {
              totalPower: true,
              voltageA: true,
              voltageB: true,
              voltageC: true,
              currentA: true,
              currentB: true,
              currentC: true
            }
          });

          // Fill in missing fields with the newest available non-null value from the last 5 minutes
          for (const r of recentRows) {
            if (row.totalPower === null && r.totalPower !== null) row.totalPower = r.totalPower;
            if (row.voltageA === null && r.voltageA !== null) row.voltageA = r.voltageA;
            if (row.voltageB === null && r.voltageB !== null) row.voltageB = r.voltageB;
            if (row.voltageC === null && r.voltageC !== null) row.voltageC = r.voltageC;
            if (row.currentA === null && r.currentA !== null) row.currentA = r.currentA;
            if (row.currentB === null && r.currentB !== null) row.currentB = r.currentB;
            if (row.currentC === null && r.currentC !== null) row.currentC = r.currentC;
          }
        }

        return { ...row, device: device as any };
      })
    );

    return latestRows.filter((row): row is NonNullable<typeof row> => row !== null);
  }

  /**
   * Maps a persisted TelemetryHistory DB row to the LiveTelemetryPayload structure
   * for immediate WebSocket broadcast.
   */
  public mapToLivePayload(siteId: string, row: TelemetryWithDevice): LiveTelemetryPayload {
    const comp = row.device.componentId || '';
    const wsData: any = {};

    if (comp === 'pcs') {
      if (row.pcsActivePower !== null) wsData.bessPower = row.pcsActivePower;
      if (row.dcVoltage !== null) wsData.pcsDcVoltage = row.dcVoltage;
      if (row.ambientTemp !== null) wsData.pcsTemp = row.ambientTemp;
      if (row.todayChargeEnergy !== null) wsData.todayChargeEnergy = row.todayChargeEnergy;
      if (row.todayDischargeEnergy !== null) wsData.todayDischargeEnergy = row.todayDischargeEnergy;
      if (row.accumChargeEnergy !== null) wsData.accChargeEnergy = row.accumChargeEnergy;
      if (row.accumDischargeEnergy !== null) wsData.accDischargeEnergy = row.accumDischargeEnergy;
      if (row.bessFrequency !== null) wsData.bessFrequency = row.bessFrequency;
      if (row.bessPowerFactor !== null) wsData.bessPowerFactor = row.bessPowerFactor;
      
      // PCS State relies on di_singco_state from rawPayload, but let's try to extract if we can.
      // For now, if we don't have di_singco_state extracted as a named column, we might omit it,
      // or we can parse rawPayload.
      if (row.rawPayload && Array.isArray(row.rawPayload)) {
        const sig = (row.rawPayload as any[]).find(s => s && s.m === 'di_singco_state');
        if (sig && sig.v !== undefined) {
          wsData.pcsState = normalizePcsState(Number(sig.v));
        }
      }
    } else if (comp === 'pmg') {
      if (row.gridSideLoad !== null) wsData.gridPower = row.gridSideLoad;
      if (row.voltageA !== null) wsData.gridPhaseAVoltage = row.voltageA;
      if (row.gridFrequency !== null) wsData.gridFrequency = row.gridFrequency;
      if (row.powerFactor !== null) wsData.powerFactor = row.powerFactor;
    } else if (comp === 'rjl' || comp === 'jl') {
      if (row.voltageA !== null) wsData.phaseAVoltage = row.voltageA;
      if (row.voltageB !== null) wsData.phaseBVoltage = row.voltageB;
      if (row.voltageC !== null) wsData.phaseCVoltage = row.voltageC;
      if (row.currentA !== null) wsData.phaseACurrent = row.currentA;
      if (row.currentB !== null) wsData.phaseBCurrent = row.currentB;
      if (row.currentC !== null) wsData.phaseCCurrent = row.currentC;
    } else if (comp === 'bcms') {
      if (row.soc !== null) wsData.bessSoc = row.soc;
      if (row.soh !== null) wsData.bmsSoh = row.soh;
      if (row.bmsCurrent !== null) wsData.bmsCurrent = row.bmsCurrent;
      if (row.cellVMax !== null) wsData.cellVMax = row.cellVMax;
      if (row.cellVMin !== null) wsData.cellVMin = row.cellVMin;
      if (row.cellTempMax !== null) wsData.cellTempMax = row.cellTempMax;
    } else if (comp === 'pinv') {
      if (row.solarPower !== null) wsData.solarPower = row.solarPower;
      if (row.solarFrequency !== null) wsData.solarFrequency = row.solarFrequency;
      if (row.solarPowerFactor !== null) wsData.solarPowerFactor = row.solarPowerFactor;
    }

    return {
      type: 'telemetry',
      siteId,
      deviceId: row.deviceId,
      emuId: row.device.bessAsset?.emuId || 'unknown',
      componentId: comp,
      timestamp: row.timestamp.toISOString(),
      data: wsData
    };
  }
}

export const telemetryService = new TelemetryService();
