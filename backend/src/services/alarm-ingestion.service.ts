import { AlarmStatus, AlarmSeverity } from '@prisma/client';
import { webSocketService } from './websocket.service';

import { prisma } from '../db/prisma';

interface AlarmMapping {
  faultCode: string;
  severity: AlarmSeverity;
  message: string;
}

const FAULT_MAPPINGS: Record<string, AlarmMapping> = {
  // PCS Faults
  'pcs.di_flt_state': { faultCode: 'pcs.di_flt_state', severity: 'CRITICAL', message: 'PCS System Fault' },
  'pcs.di_power_flt': { faultCode: 'pcs.di_power_flt', severity: 'CRITICAL', message: 'PCS Power Fault' },
  'pcs.di_sts_flt': { faultCode: 'pcs.di_sts_flt', severity: 'CRITICAL', message: 'PCS STS Fault' },
  'pcs.di_bat_ov': { faultCode: 'pcs.di_bat_ov', severity: 'CRITICAL', message: 'Battery Over Voltage' },
  'pcs.di_bat_uv': { faultCode: 'pcs.di_bat_uv', severity: 'CRITICAL', message: 'Battery Under Voltage' },
  'pcs.di_prechgcont_flt': { faultCode: 'pcs.di_prechgcont_flt', severity: 'CRITICAL', message: 'Precharge Contactor Fault' },
  'pcs.di_maincont_flt': { faultCode: 'pcs.di_maincont_flt', severity: 'CRITICAL', message: 'Main Contactor Fault' },
  'pcs.di_bms_flt': { faultCode: 'pcs.di_bms_flt', severity: 'CRITICAL', message: 'BMS Fault' },
  
  // PCS Warnings
  'pcs.di_grid_uv': { faultCode: 'pcs.di_grid_uv', severity: 'WARNING', message: 'Grid Under Voltage' },
  'pcs.di_grid_ofreq': { faultCode: 'pcs.di_grid_ofreq', severity: 'WARNING', message: 'Grid Over Frequency' },
  'pcs.di_gridu_unbal': { faultCode: 'pcs.di_gridu_unbal', severity: 'WARNING', message: 'Grid Voltage Unbalanced' },
  'pcs.di_bms_commstat_flt': { faultCode: 'pcs.di_bms_commstat_flt', severity: 'WARNING', message: 'BMS Communication Fault' },
  'pcs.di_ems_commstat_flt': { faultCode: 'pcs.di_ems_commstat_flt', severity: 'WARNING', message: 'EMS Communication Fault' },
  'pcs.di_sts_commstat_flt': { faultCode: 'pcs.di_sts_commstat_flt', severity: 'WARNING', message: 'STS Communication Fault' },
  'pcs.di_innerfan_flt': { faultCode: 'pcs.di_innerfan_flt', severity: 'WARNING', message: 'Inner Fan Fault' },
  'pcs.di_outfan_flt': { faultCode: 'pcs.di_outfan_flt', severity: 'WARNING', message: 'Outer Fan Fault' },
};

export class AlarmIngestionService {
  public async processFaultSignals(
    siteId: string,
    deviceId: string,
    componentId: string,
    signals: Array<{ m: string; v: any }>
  ) {
    for (const signal of signals) {
      if (signal.m === undefined || signal.v === undefined) continue;

      const faultCode = `${componentId}.${signal.m}`;
      const mapping = FAULT_MAPPINGS[faultCode];

      if (!mapping) continue;

      const isActive = Number(signal.v) === 1;

      if (isActive) {
        await this.handleActiveFault(siteId, deviceId, mapping);
      } else {
        await this.handleClearedFault(siteId, deviceId, mapping);
      }
    }
  }

  private async handleActiveFault(siteId: string, deviceId: string, mapping: AlarmMapping) {
    const existingAlarm = await prisma.alarm.findFirst({
      where: {
        deviceId,
        faultCode: mapping.faultCode,
        status: 'ACTIVE'
      }
    });

    if (!existingAlarm) {
      try {
        const newAlarm = await prisma.alarm.create({
          data: {
            deviceId,
            faultCode: mapping.faultCode,
            severity: mapping.severity,
            message: mapping.message,
            status: 'ACTIVE',
            createdAt: new Date()
          },
          include: {
            device: {
              include: {
                bessAsset: true
              }
            }
          }
        });

        webSocketService.broadcastAlarm(siteId, {
          type: 'alarm',
          siteId,
          alarm: newAlarm
        });
      } catch (error: any) {
        if (error && error.code === 'P2002') {
          // Expected concurrency race
          const activeAlarm = await prisma.alarm.findFirst({
            where: {
              deviceId,
              faultCode: mapping.faultCode,
              status: 'ACTIVE'
            }
          });
          
          if (activeAlarm) {
            console.debug(`[Alarm] Duplicate ACTIVE alarm prevented by database constraint for ${deviceId} - ${mapping.faultCode}`);
            return; // Expected race, just return and let loop continue
          }
        }
        // Unexpected error or P2002 with no active alarm
        throw error;
      }
    }
  }

  private async handleClearedFault(siteId: string, deviceId: string, mapping: AlarmMapping) {
    const existingAlarms = await prisma.alarm.findMany({
      where: {
        deviceId,
        faultCode: mapping.faultCode,
        status: { in: ['ACTIVE', 'ACKNOWLEDGED'] }
      }
    });

    for (const alarm of existingAlarms) {
      const clearedAlarm = await prisma.alarm.update({
        where: { id: alarm.id },
        data: {
          status: 'CLEARED',
          clearedAt: new Date()
        },
        include: {
          device: {
            include: {
              bessAsset: true
            }
          }
        }
      });

      webSocketService.broadcastAlarm(siteId, {
        type: 'alarm',
        siteId,
        alarm: clearedAlarm
      });
    }
  }
}

export const alarmIngestionService = new AlarmIngestionService();
