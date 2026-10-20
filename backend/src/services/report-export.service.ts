import { Response } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../db/prisma';
import { resolveVoltageTrend, VoltageTrendProcessor } from '../utils/voltage-trend.util';
import { formatCsvRow, formatSiteTimestamp, formatReportPeriod } from '../utils/csv.util';
import { processReportBatteryStatusRow } from '../utils/battery-status.util';
import { processReportPcsRow } from '../utils/pcs-telemetry.util';
import { processReportBmsRow, formatCabinetState } from '../utils/bms-telemetry.util';
import { processReportTmsRow, formatTmsMode } from '../utils/tms-telemetry.util';

export const SINGLE_BESS_TELEMETRY_HEADERS = [
  'Timestamp',
  'BESS Name',
  'EMU Serial No.',
  'Grid Side Load (kW)',
  'Grid Frequency (Hz)',
  'Grid Power Factor',
  'BESS Frequency (Hz)',
  'BESS Power Factor',
  'PCS Active Power (kW)',
  'PCS Temperature (°C)',
  'Line Voltage (V)',
  'AC Current (A)',
  'Operating Mode',
  'Ambient Temperature (°C)',
  'Battery Coolant Return Temperature (°C)',
  'Battery Coolant Inlet Temperature (°C)',
  'Coolant Return Pressure (bar)',
  'Coolant Inlet Pressure (bar)',
  'SOC (%)',
  'SOH (%)',
  'BMS Current (A)',
  'BMS DC Voltage (V)',
  'Cabinet State',
  'Cell V Max (V)',
  'Cell V Min (V)',
  'Cell Temp Max (°C)',
  'Cell Temp Min (°C)',
  'Battery Ambient Temperature (°C)',
  'Pack 01 Average Temperature (°C)',
  'Pack 01 Maximum Temperature (°C)',
  'Pack 02 Average Temperature (°C)',
  'Pack 02 Maximum Temperature (°C)',
  'Pack 03 Average Temperature (°C)',
  'Pack 03 Maximum Temperature (°C)',
  'Pack 04 Average Temperature (°C)',
  'Pack 04 Maximum Temperature (°C)',
  'Pack 05 Average Temperature (°C)',
  'Pack 05 Maximum Temperature (°C)',
  'Today Charge Energy (kWh)',
  'Today Discharge Energy (kWh)',
  'Accum Charge Energy (kWh)',
  'Accum Discharge Energy (kWh)',
  'Solar Power (kW)'
] as const;

export const AUTHORITATIVE_TELEMETRY_HEADERS = SINGLE_BESS_TELEMETRY_HEADERS;

export type ExportUnitOptions = {
  powerUnit?: 'kW' | 'MW';
  energyUnit?: 'kWh' | 'MWh';
};

export function getAuthoritativeTelemetryHeaders(options?: ExportUnitOptions): string[] {
  const pUnit = options?.powerUnit === 'MW' ? 'MW' : 'kW';
  const eUnit = options?.energyUnit === 'MWh' ? 'MWh' : 'kWh';
  return AUTHORITATIVE_TELEMETRY_HEADERS.map((h) => {
    if (h.includes('(kW)')) return h.replace('(kW)', `(${pUnit})`);
    if (h.includes('(kWh)')) return h.replace('(kWh)', `(${eUnit})`);
    return h;
  });
}

export function getSingleBessTelemetryHeaders(options?: ExportUnitOptions): string[] {
  const pUnit = options?.powerUnit === 'MW' ? 'MW' : 'kW';
  const eUnit = options?.energyUnit === 'MWh' ? 'MWh' : 'kWh';
  return SINGLE_BESS_TELEMETRY_HEADERS.map((h) => {
    if (h.includes('(kW)')) return h.replace('(kW)', `(${pUnit})`);
    if (h.includes('(kWh)')) return h.replace('(kWh)', `(${eUnit})`);
    return h;
  });
}

export function getExportUnitConverters(options?: ExportUnitOptions) {
  const powerUnit: 'kW' | 'MW' = options?.powerUnit === 'MW' ? 'MW' : 'kW';
  const energyUnit: 'kWh' | 'MWh' = options?.energyUnit === 'MWh' ? 'MWh' : 'kWh';

  const convertPower = (v: number | string | null | undefined): number | null => {
    if (v === null || v === undefined) return null;
    const num = Number(v);
    if (isNaN(num)) return null;
    return powerUnit === 'MW' ? num / 1000 : num;
  };

  const convertEnergy = (v: number | string | null | undefined): number | null => {
    if (v === null || v === undefined) return null;
    const num = Number(v);
    if (isNaN(num)) return null;
    return energyUnit === 'MWh' ? num / 1000 : num;
  };

  return { powerUnit, energyUnit, convertPower, convertEnergy };
}

/**
 * Excel worksheet naming constraints:
 * - Max 31 characters
 * - Prohibited characters: \ / ? * [ ] :
 * - Cannot start or end with single quote '
 * - Cannot be empty
 * - Must be unique within workbook (case-insensitive)
 */
export function sanitizeWorksheetName(rawName: string, fallback = 'BESS'): string {
  if (!rawName || typeof rawName !== 'string') return fallback;
  // Replace prohibited characters \ / ? * [ ] : with _
  let sanitized = rawName.replace(/[\\/?*[\]:]/g, '_').trim();
  // Strip leading or trailing single quotes
  sanitized = sanitized.replace(/^'+|'+$/g, '').trim();
  if (!sanitized) {
    sanitized = fallback;
  }
  if (sanitized.length > 31) {
    sanitized = sanitized.slice(0, 31).trim();
    if (!sanitized) sanitized = fallback;
  }
  return sanitized;
}

export function generateBessWorksheetNames(
  bessAssets: { id: string; name: string }[],
  reservedNames: string[] = ['Site Summary']
): Map<string, string> {
  const result = new Map<string, string>();
  const usedLowerNames = new Set<string>(reservedNames.map((n) => n.trim().toLowerCase()));

  for (let idx = 0; idx < bessAssets.length; idx++) {
    const asset = bessAssets[idx];
    const fallback = `BESS ${idx + 1}`;
    const base = sanitizeWorksheetName(asset.name, fallback);

    let candidate = base;
    let counter = 2;
    while (usedLowerNames.has(candidate.toLowerCase())) {
      const suffix = ` (${counter})`;
      const maxBaseLen = 31 - suffix.length;
      const truncatedBase = base.slice(0, Math.max(1, maxBaseLen)).trim();
      candidate = `${truncatedBase}${suffix}`;
      counter++;
    }

    usedLowerNames.add(candidate.toLowerCase());
    result.set(asset.id, candidate);
  }

  return result;
}

export class ReportExportService {
  private buildDataQuery(siteId: string, intervalStr: string, from?: Date, to?: Date, includeBatteryStatus: boolean = false, bessAssetId?: string) {
    let bessAssetFilter = `d."bessAssetId" IN (SELECT "id" FROM "BESSAsset" WHERE "siteId" = '${siteId}')`;
    if (bessAssetId) {
      bessAssetFilter = `d."bessAssetId" = '${bessAssetId}'`;
    }

    let timeFilter = `1=1`;
    if (from) {
      timeFilter += ` AND th."timestamp" >= '${from.toISOString()}'::timestamp`;
    }
    if (to) {
      timeFilter += ` AND th."timestamp" < '${to.toISOString()}'::timestamp`;
    }

    const batterySelect = includeBatteryStatus ? `,
        AVG(CASE WHEN d."componentId" = 'th' THEN
          ((jsonb_path_query_first(th."rawPayload", '$[*] ? (@.m == "ai_temp").v')) #>> '{}')::double precision
        END) AS "batteryAmbientTemp",
        (array_agg(th."rawPayload" ORDER BY th."timestamp" DESC) FILTER (WHERE d."componentId" = 'pack_01' AND th."rawPayload" IS NOT NULL)) AS "pack01Payloads",
        (array_agg(th."rawPayload" ORDER BY th."timestamp" DESC) FILTER (WHERE d."componentId" = 'pack_02' AND th."rawPayload" IS NOT NULL)) AS "pack02Payloads",
        (array_agg(th."rawPayload" ORDER BY th."timestamp" DESC) FILTER (WHERE d."componentId" = 'pack_03' AND th."rawPayload" IS NOT NULL)) AS "pack03Payloads",
        (array_agg(th."rawPayload" ORDER BY th."timestamp" DESC) FILTER (WHERE d."componentId" = 'pack_04' AND th."rawPayload" IS NOT NULL)) AS "pack04Payloads",
        (array_agg(th."rawPayload" ORDER BY th."timestamp" DESC) FILTER (WHERE d."componentId" = 'pack_05' AND th."rawPayload" IS NOT NULL)) AS "pack05Payloads"` : '';

    const dataQuery = `
      SELECT
        d."bessAssetId",
        b."name" AS "bessName",
        b."emuId" AS "emuId",
        date_bin('${intervalStr}'::interval, th."timestamp", '2000-01-01 00:00:00Z') AS "bucketTimestamp",
        AVG(th."voltageA") AS "voltageA",
        AVG(th."voltageB") AS "voltageB",
        AVG(th."voltageC") AS "voltageC",
        AVG(th."currentA") AS "currentA",
        AVG(th."currentB") AS "currentB",
        AVG(th."currentC") AS "currentC",
        AVG(th."totalPower") AS "totalPower",
        AVG(th."pcsActivePower") AS "pcsActivePower",
        AVG(th."dcVoltage") AS "dcVoltage",
        AVG(th."ambientTemp") AS "ambientTemp",
        AVG(th."bmsCurrent") AS "bmsCurrent",
        AVG(th."gridSideLoad") AS "gridSideLoad",
        AVG(th."solarPower") AS "solarPower",
        AVG(CASE WHEN d."componentId" = 'pmg' THEN th."gridFrequency" END) AS "gridFrequency",
        AVG(CASE WHEN d."componentId" = 'pmg' THEN th."powerFactor" END) AS "powerFactor",
        AVG(th."bessFrequency") AS "bessFrequency",
        AVG(th."bessPowerFactor") AS "bessPowerFactor",
        AVG(th."solarFrequency") AS "solarFrequency",
        MAX(th."cellVMax") AS "cellVMax",
        MAX(th."cellTempMax") AS "cellTempMax",
        MIN(th."cellVMin") AS "cellVMin",
        (array_agg(th."todayChargeEnergy" ORDER BY th."timestamp" DESC) FILTER (WHERE th."todayChargeEnergy" IS NOT NULL))[1] AS "todayChargeEnergy",
        (array_agg(th."todayDischargeEnergy" ORDER BY th."timestamp" DESC) FILTER (WHERE th."todayDischargeEnergy" IS NOT NULL))[1] AS "todayDischargeEnergy",
        (array_agg(th."accumChargeEnergy" ORDER BY th."timestamp" DESC) FILTER (WHERE th."accumChargeEnergy" IS NOT NULL))[1] AS "accumChargeEnergy",
        (array_agg(th."accumDischargeEnergy" ORDER BY th."timestamp" DESC) FILTER (WHERE th."accumDischargeEnergy" IS NOT NULL))[1] AS "accumDischargeEnergy",
        (array_agg(th."soc" ORDER BY th."timestamp" DESC) FILTER (WHERE th."soc" IS NOT NULL))[1] AS "soc",
        (array_agg(th."soh" ORDER BY th."timestamp" DESC) FILTER (WHERE th."soh" IS NOT NULL))[1] AS "soh"${batterySelect},
        AVG(CASE WHEN d."componentId" = 'pcs' THEN
          ((jsonb_path_query_first(th."rawPayload", '$[*] ? (@.m == "ai_igbt_temp").v')) #>> '{}')::double precision
        END) AS "pcsTemperature",
        AVG(CASE WHEN d."componentId" = 'pcs'
                 AND th."bessVoltageUa" IS NOT NULL
                 AND th."bessVoltageUb" IS NOT NULL
                 AND th."bessVoltageUc" IS NOT NULL
            THEN (th."bessVoltageUa" + th."bessVoltageUb" + th."bessVoltageUc") / 3.0
            WHEN d."componentId" = 'pcs' THEN
              (
                ((jsonb_path_query_first(th."rawPayload", '$[*] ? (@.m == "ai_out_uab").v')) #>> '{}')::double precision +
                ((jsonb_path_query_first(th."rawPayload", '$[*] ? (@.m == "ai_out_ubc").v')) #>> '{}')::double precision +
                ((jsonb_path_query_first(th."rawPayload", '$[*] ? (@.m == "ai_out_uca").v')) #>> '{}')::double precision
              ) / 3.0
        END) AS "pcsLineVoltage",
        AVG(CASE WHEN d."componentId" = 'pcs' THEN
          (
            ((jsonb_path_query_first(th."rawPayload", '$[*] ? (@.m == "ai_ia").v')) #>> '{}')::double precision +
            ((jsonb_path_query_first(th."rawPayload", '$[*] ? (@.m == "ai_ib").v')) #>> '{}')::double precision +
            ((jsonb_path_query_first(th."rawPayload", '$[*] ? (@.m == "ai_ic").v')) #>> '{}')::double precision
          ) / 3.0
        END) AS "pcsAcCurrent",
        AVG(CASE WHEN d."componentId" = 'tms' THEN
          ((jsonb_path_query_first(th."rawPayload", '$[*] ? (@.m == "ai_at").v')) #>> '{}')::double precision
        END) AS "tmsAmbientTemp",
        (array_agg(
          CASE WHEN d."componentId" = 'tms' THEN
            ((jsonb_path_query_first(th."rawPayload", '$[*] ? (@.m == "di_singco_state").v')) #>> '{}')::integer
          END
          ORDER BY th."timestamp" DESC
        ) FILTER (WHERE d."componentId" = 'tms' AND (jsonb_path_query_first(th."rawPayload", '$[*] ? (@.m == "di_singco_state").v')) IS NOT NULL))[1] AS "tmsOperatingMode",
        AVG(CASE WHEN d."componentId" = 'tms' THEN
          ((jsonb_path_query_first(th."rawPayload", '$[*] ? (@.m == "ai_iw_temp").v')) #>> '{}')::double precision
        END) AS "tmsCoolantReturnTemp",
        AVG(CASE WHEN d."componentId" = 'tms' THEN
          ((jsonb_path_query_first(th."rawPayload", '$[*] ? (@.m == "ai_ow_temp").v')) #>> '{}')::double precision
        END) AS "tmsCoolantInletTemp",
        AVG(CASE WHEN d."componentId" = 'tms' THEN
          ((jsonb_path_query_first(th."rawPayload", '$[*] ? (@.m == "ai_iw_prs").v')) #>> '{}')::double precision
        END) AS "tmsCoolantReturnPressure",
        AVG(CASE WHEN d."componentId" = 'tms' THEN
          ((jsonb_path_query_first(th."rawPayload", '$[*] ? (@.m == "ai_ow_prs").v')) #>> '{}')::double precision
        END) AS "tmsCoolantInletPressure",
        AVG(CASE WHEN d."componentId" = 'bcms' THEN
          ((jsonb_path_query_first(th."rawPayload", '$[*] ? (@.m == "ai_sum_u").v')) #>> '{}')::double precision
        END) AS "bmsDcVoltage",
        MIN(CASE WHEN d."componentId" = 'bcms' THEN
          ((jsonb_path_query_first(th."rawPayload", '$[*] ? (@.m == "ai_min_temp").v')) #>> '{}')::double precision
        END) AS "cellTempMin",
        (array_agg(
          CASE WHEN d."componentId" = 'bcms' THEN
            ((jsonb_path_query_first(th."rawPayload", '$[*] ? (@.m == "di_rcdhg_stat").v')) #>> '{}')::integer
          END
          ORDER BY th."timestamp" DESC
        ) FILTER (WHERE d."componentId" = 'bcms' AND (jsonb_path_query_first(th."rawPayload", '$[*] ? (@.m == "di_rcdhg_stat").v')) IS NOT NULL))[1] AS "bmsCabinetState"
      FROM "TelemetryHistory" th
      JOIN "Device" d ON th."deviceId" = d."id"
      JOIN "BESSAsset" b ON d."bessAssetId" = b."id"
      WHERE ${bessAssetFilter} AND ${timeFilter}
      GROUP BY d."bessAssetId", b."name", b."emuId", date_bin('${intervalStr}'::interval, th."timestamp", '2000-01-01 00:00:00Z')
      ORDER BY date_bin('${intervalStr}'::interval, th."timestamp", '2000-01-01 00:00:00Z') DESC, b."name" ASC
    `;

    return { dataQuery, bessAssetFilter, timeFilter };
  }

  public async exportDynamicReport(
    res: Response,
    siteId: string,
    intervalMinutes: number,
    from: Date | undefined,
    to: Date | undefined,
    options?: ExportUnitOptions,
    bessAssetId?: string
  ) {
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      include: { client: true }
    });
    if (!site) {
      throw new Error('Site not found');
    }

    const whereBess: any = { siteId };
    if (bessAssetId) {
      whereBess.id = bessAssetId;
    }

    const bessAssets = await prisma.bESSAsset.findMany({
      where: whereBess,
      orderBy: { name: 'asc' },
    });

    if (bessAssets.length === 0) {
      throw new Error('No BESS assets found for this site.');
    }

    const isMultiBESS = !bessAssetId && bessAssets.length > 1;

    if (isMultiBESS) {
      return this.exportMultiBessExcel(res, siteId, intervalMinutes, from, to, site, bessAssets, options);
    } else {
      return this.exportSingleBessCsv(res, siteId, intervalMinutes, from, to, site, bessAssets, options, bessAssetId);
    }
  }

  public async exportSingleBessCsv(
    res: Response,
    siteId: string,
    intervalMinutes: number,
    from: Date | undefined,
    to: Date | undefined,
    preloadedSite?: any,
    preloadedBessAssets?: any[],
    options?: ExportUnitOptions,
    bessAssetId?: string
  ) {
    const site = preloadedSite || await prisma.site.findUnique({
      where: { id: siteId },
      include: { client: true }
    });
    if (!site) {
      throw new Error('Site not found');
    }
    const siteTimezone = site.timezone || 'Asia/Kolkata';

    const whereBess: any = { siteId };
    if (bessAssetId) {
      whereBess.id = bessAssetId;
    }

    const bessAssets = preloadedBessAssets || await prisma.bESSAsset.findMany({
      where: whereBess,
      orderBy: { name: 'asc' },
    });

    if (bessAssets.length === 0) {
      throw new Error('No BESS assets found for this site.');
    }

    const { powerUnit, energyUnit, convertPower, convertEnergy } = getExportUnitConverters(options);

    const effectiveInterval = intervalMinutes || bessAssets[0]?.reportIntervalMinutes || 15;
    const intervalStr = `${effectiveInterval} minutes`;
    const targetBessId = bessAssetId || (bessAssets.length === 1 ? bessAssets[0].id : undefined);
    const { dataQuery } = this.buildDataQuery(siteId, intervalStr, from, to, true, targetBessId);

    if (typeof res.setHeader === 'function' && !res.headersSent) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    }

    // Send UTF-8 BOM for Microsoft Excel compatibility
    res.write('\uFEFF');

    // Common Metadata Headers
    const reportPeriodStr = formatReportPeriod(from, to, siteTimezone);
    res.write(formatCsvRow(['EMS Reports Export']));
    res.write(formatCsvRow(['Client Name:', site.client?.name || 'Unknown Client']));
    res.write(formatCsvRow(['Site Name:', site.name]));
    res.write(formatCsvRow(['Site Identifier:', site.businessIdentifier || 'N/A']));
    res.write(formatCsvRow(['Report Period:', reportPeriodStr]));
    res.write(formatCsvRow(['Export Interval:', intervalStr]));
    res.write(formatCsvRow([])); // Blank row 7

    const singleBessRows = await prisma.$queryRawUnsafe(dataQuery) as any[];

    for (const row of singleBessRows) {
      processReportBatteryStatusRow(row);
      processReportPcsRow(row);
      processReportBmsRow(row);
      processReportTmsRow(row);
    }

    let firstCharge: number | null = null;
    let lastCharge: number | null = null;
    let firstDischarge: number | null = null;
    let lastDischarge: number | null = null;

    for (let i = 0; i < singleBessRows.length; i++) {
      if (lastCharge === null && singleBessRows[i].accumChargeEnergy != null) lastCharge = singleBessRows[i].accumChargeEnergy;
      if (lastDischarge === null && singleBessRows[i].accumDischargeEnergy != null) lastDischarge = singleBessRows[i].accumDischargeEnergy;
      if (lastCharge !== null && lastDischarge !== null) break;
    }

    for (let i = singleBessRows.length - 1; i >= 0; i--) {
      if (firstCharge === null && singleBessRows[i].accumChargeEnergy != null) firstCharge = singleBessRows[i].accumChargeEnergy;
      if (firstDischarge === null && singleBessRows[i].accumDischargeEnergy != null) firstDischarge = singleBessRows[i].accumDischargeEnergy;
      if (firstCharge !== null && firstDischarge !== null) break;
    }

    const round2 = (n: number | null): number | null => (n != null ? Math.round(n * 100) / 100 : null);
    const rawChargeDiff = (firstCharge != null && lastCharge != null) ? (lastCharge - firstCharge) : null;
    const rawDischargeDiff = (firstDischarge != null && lastDischarge != null) ? (lastDischarge - firstDischarge) : null;
    const chargeDiff = rawChargeDiff != null ? round2(convertEnergy(rawChargeDiff)) : null;
    const dischargeDiff = rawDischargeDiff != null ? round2(convertEnergy(rawDischargeDiff)) : null;

    res.write(formatCsvRow([`Total Charge Difference (${energyUnit})`, chargeDiff != null ? chargeDiff : '']));
    res.write(formatCsvRow([`Total Discharge Difference (${energyUnit})`, dischargeDiff != null ? dischargeDiff : '']));
    res.write(formatCsvRow([])); // Blank row 9

    const headers = getSingleBessTelemetryHeaders({ powerUnit, energyUnit });
    res.write(formatCsvRow(headers)); // Row 10: Column headers

    const format2Dec = (v: any) => {
      if (v === null || v === undefined) return '';
      const num = Number(v);
      if (isNaN(num)) return v;
      return Math.round(num * 100) / 100;
    };

    const format3Dec = (v: any) => {
      if (v === null || v === undefined) return '';
      const num = Number(v);
      if (isNaN(num)) return v;
      return Math.round(num * 1000) / 1000;
    };

    for (const row of singleBessRows) {
      const bucketTime = row.bucketTimestamp instanceof Date ? row.bucketTimestamp : new Date(row.bucketTimestamp);
      const formattedTime = formatSiteTimestamp(bucketTime, siteTimezone);

      const dataRow = [
        formattedTime,
        row.bessName,
        row.emuId,
        format2Dec(convertPower(row.gridSideLoad)),
        format2Dec(row.gridFrequency),
        format2Dec(row.powerFactor),
        format2Dec(row.bessFrequency),
        format2Dec(row.bessPowerFactor),
        format2Dec(convertPower(row.pcsActivePower)),
        format2Dec(row.pcsTemperature),
        format2Dec(row.pcsLineVoltage),
        format2Dec(row.pcsAcCurrent),
        formatTmsMode(row.tmsOperatingMode),
        format2Dec(row.tmsAmbientTemp),
        format2Dec(row.tmsCoolantReturnTemp),
        format2Dec(row.tmsCoolantInletTemp),
        format2Dec(row.tmsCoolantReturnPressure),
        format2Dec(row.tmsCoolantInletPressure),
        format2Dec(row.soc),
        format2Dec(row.soh),
        format2Dec(row.bmsCurrent),
        format2Dec(row.bmsDcVoltage),
        formatCabinetState(row.bmsCabinetState),
        format3Dec(row.cellVMax),
        format3Dec(row.cellVMin),
        format2Dec(row.cellTempMax),
        format2Dec(row.cellTempMin),
        format2Dec(row.batteryAmbientTemp),
        format2Dec(row.pack01AvgTemp),
        format2Dec(row.pack01MaxTemp),
        format2Dec(row.pack02AvgTemp),
        format2Dec(row.pack02MaxTemp),
        format2Dec(row.pack03AvgTemp),
        format2Dec(row.pack03MaxTemp),
        format2Dec(row.pack04AvgTemp),
        format2Dec(row.pack04MaxTemp),
        format2Dec(row.pack05AvgTemp),
        format2Dec(row.pack05MaxTemp),
        format2Dec(convertEnergy(row.todayChargeEnergy)),
        format2Dec(convertEnergy(row.todayDischargeEnergy)),
        format2Dec(convertEnergy(row.accumChargeEnergy)),
        format2Dec(convertEnergy(row.accumDischargeEnergy)),
        format2Dec(convertPower(row.solarPower))
      ];
      res.write(formatCsvRow(dataRow));
    }

    res.end();
  }

  public async exportMultiBessExcel(
    res: Response,
    siteId: string,
    intervalMinutes: number,
    from: Date | undefined,
    to: Date | undefined,
    preloadedSite?: any,
    preloadedBessAssets?: any[],
    options?: ExportUnitOptions
  ) {
    const site = preloadedSite || await prisma.site.findUnique({
      where: { id: siteId },
      include: { client: true }
    });
    if (!site) {
      throw new Error('Site not found');
    }
    const siteTimezone = site.timezone || 'Asia/Kolkata';

    const bessAssets = preloadedBessAssets || await prisma.bESSAsset.findMany({
      where: { siteId },
      orderBy: { name: 'asc' },
    });

    if (bessAssets.length === 0) {
      throw new Error('No BESS assets found for this site.');
    }

    const { powerUnit, energyUnit, convertPower, convertEnergy } = getExportUnitConverters(options);

    const effectiveInterval = intervalMinutes || bessAssets[0]?.reportIntervalMinutes || 15;
    const intervalStr = `${effectiveInterval} minutes`;
    const { dataQuery, bessAssetFilter, timeFilter } = this.buildDataQuery(siteId, intervalStr, from, to, true);

    if (typeof res.setHeader === 'function' && !res.headersSent) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    const workbookOptions = {
      stream: res,
      useStyles: true,
      useSharedStrings: false
    };
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter(workbookOptions);

    const reportPeriodStr = formatReportPeriod(from, to, siteTimezone);

    // Query energy boundaries
    const boundaryQuery = `
      SELECT
        d."bessAssetId",
        b."name" AS "bessName",
        (array_agg(th."accumChargeEnergy" ORDER BY th."timestamp" ASC) FILTER (WHERE th."accumChargeEnergy" IS NOT NULL))[1] AS "firstCharge",
        (array_agg(th."accumChargeEnergy" ORDER BY th."timestamp" DESC) FILTER (WHERE th."accumChargeEnergy" IS NOT NULL))[1] AS "lastCharge",
        (array_agg(th."accumDischargeEnergy" ORDER BY th."timestamp" ASC) FILTER (WHERE th."accumDischargeEnergy" IS NOT NULL))[1] AS "firstDischarge",
        (array_agg(th."accumDischargeEnergy" ORDER BY th."timestamp" DESC) FILTER (WHERE th."accumDischargeEnergy" IS NOT NULL))[1] AS "lastDischarge"
      FROM "TelemetryHistory" th
      JOIN "Device" d ON th."deviceId" = d."id"
      JOIN "BESSAsset" b ON d."bessAssetId" = b."id"
      WHERE ${bessAssetFilter} AND ${timeFilter}
      GROUP BY d."bessAssetId", b."name"
      ORDER BY b."name" ASC
    `;
    const boundaries = await prisma.$queryRawUnsafe(boundaryQuery) as any[];
    const boundaryMap: Record<string, any> = {};
    for (const b of boundaries) {
      if (b.bessAssetId) boundaryMap[b.bessAssetId] = b;
      if (b.bessName) boundaryMap[b.bessName] = b;
    }

    const round2 = (n: number | null): number | null => (n != null ? Math.round(n * 100) / 100 : null);
    let siteChargeDiff: number | null = null;
    let siteDischargeDiff: number | null = null;

    const perBessDiffMap = new Map<string, { chargeDiff: number | null; dischargeDiff: number | null }>();
    for (const bess of bessAssets) {
      const b = boundaryMap[bess.id] || boundaryMap[bess.name];
      const cDiff = (b && b.firstCharge != null && b.lastCharge != null)
        ? round2(Number(b.lastCharge) - Number(b.firstCharge))
        : null;
      const dDiff = (b && b.firstDischarge != null && b.lastDischarge != null)
        ? round2(Number(b.lastDischarge) - Number(b.firstDischarge))
        : null;

      if (cDiff !== null) siteChargeDiff = round2((siteChargeDiff ?? 0) + cDiff);
      if (dDiff !== null) siteDischargeDiff = round2((siteDischargeDiff ?? 0) + dDiff);

      perBessDiffMap.set(bess.id, { chargeDiff: cDiff, dischargeDiff: dDiff });
    }

    // Worksheet 1: Site Summary
    const sheetSummary = workbook.addWorksheet('Site Summary', {
      views: [{ state: 'frozen', xSplit: 1, ySplit: 11 }]
    });

    const sr1_meta = sheetSummary.addRow(['EMS Site Summary']);
    sr1_meta.font = { bold: true };
    const sr2_meta = sheetSummary.addRow(['Client Name:', site.client?.name || 'Unknown Client']);
    const sr3_meta = sheetSummary.addRow(['Site Name:', site.name]);
    const sr4_meta = sheetSummary.addRow(['Site Identifier:', site.businessIdentifier || 'N/A']);
    const sr5_meta = sheetSummary.addRow(['Report Period:', reportPeriodStr]);
    const sr6_meta = sheetSummary.addRow(['Export Interval:', intervalStr]);
    sheetSummary.addRow([]); // Blank row 7
    [sr2_meta, sr3_meta, sr4_meta, sr5_meta, sr6_meta].forEach(row => {
      row.getCell(1).font = { bold: true };
      row.commit();
    });
    sr1_meta.commit();

    const s2Cols: Partial<ExcelJS.Column>[] = [
      { key: 'timestamp', width: 22 },
      { key: 'gridPower', width: 22 },
      { key: 'bessPower', width: 22 },
      { key: 'solarPower', width: 22 },
      { key: 'todayCharge', width: 25 },
      { key: 'todayDischarge', width: 25 },
      { key: 'soc', width: 18 },
      { key: 'soh', width: 18 },
      { key: 'avgGridFreq', width: 25 },
      { key: 'avgBessFreq', width: 25 },
      { key: 'avgSolarFreq', width: 25 }
    ];

    sheetSummary.columns = s2Cols;

    const siteChargeDiffDisplay = siteChargeDiff != null ? round2(convertEnergy(siteChargeDiff)) : null;
    const siteDischargeDiffDisplay = siteDischargeDiff != null ? round2(convertEnergy(siteDischargeDiff)) : null;

    const sr1 = sheetSummary.addRow(['Total Charge Difference', siteChargeDiffDisplay]);
    const sr2 = sheetSummary.addRow(['Total Discharge Difference', siteDischargeDiffDisplay]);
    if (siteChargeDiffDisplay != null) sr1.getCell(2).numFmt = `0.00 "${energyUnit}"`;
    if (siteDischargeDiffDisplay != null) sr2.getCell(2).numFmt = `0.00 "${energyUnit}"`;
    sr1.commit();
    sr2.commit();
    sheetSummary.addRow([]).commit(); // Blank row 10

    // Row 11: Single Authoritative Header Row
    const row1 = [
      'Timestamp',
      `Grid Power (${powerUnit})`,
      `Total BESS Power (${powerUnit})`,
      `Solar Power (${powerUnit})`,
      `Total Today Charge (${energyUnit})`,
      `Total Today Discharge (${energyUnit})`,
      'Average SOC (%)',
      'Average SOH (%)',
      'Average Grid Frequency (Hz)',
      'Average BESS Frequency (Hz)',
      'Average Solar Frequency (Hz)'
    ];

    const r1_s2 = sheetSummary.addRow(row1); // Row 11
    r1_s2.font = { bold: true };
    r1_s2.commit();

    sheetSummary.getColumn('timestamp').numFmt = 'dd mmmm yyyy, hh:mm:ss AM/PM';
    for (let i = 2; i <= s2Cols.length; i++) {
      const col = sheetSummary.getColumn(i);
      if (col.key && col.key.includes('Freq')) {
        col.numFmt = '0.00';
      } else {
        col.numFmt = '0.0';
      }
    }

    // Column configuration for individual BESS worksheets (authoritative 43 columns)
    const bessDetailsColumns: Partial<ExcelJS.Column>[] = [
      { header: 'Timestamp', key: 'timestamp', width: 22 },
      { header: 'BESS Name', key: 'bessName', width: 20 },
      { header: 'EMU Serial No.', key: 'emuId', width: 20 },
      { header: `Grid Side Load (${powerUnit})`, key: 'gridSideLoad', width: 20 },
      { header: 'Grid Frequency (Hz)', key: 'gridFrequency', width: 22 },
      { header: 'Grid Power Factor', key: 'powerFactor', width: 18 },
      { header: 'BESS Frequency (Hz)', key: 'bessFrequency', width: 22 },
      { header: 'BESS Power Factor', key: 'bessPowerFactor', width: 22 },
      { header: `PCS Active Power (${powerUnit})`, key: 'pcsActivePower', width: 22 },
      { header: 'PCS Temperature (°C)', key: 'pcsTemperature', width: 22 },
      { header: 'Line Voltage (V)', key: 'pcsLineVoltage', width: 18 },
      { header: 'AC Current (A)', key: 'pcsAcCurrent', width: 18 },
      { header: 'Operating Mode', key: 'tmsOperatingMode', width: 20 },
      { header: 'Ambient Temperature (°C)', key: 'tmsAmbientTemp', width: 25 },
      { header: 'Battery Coolant Return Temperature (°C)', key: 'tmsCoolantReturnTemp', width: 35 },
      { header: 'Battery Coolant Inlet Temperature (°C)', key: 'tmsCoolantInletTemp', width: 35 },
      { header: 'Coolant Return Pressure (bar)', key: 'tmsCoolantReturnPressure', width: 28 },
      { header: 'Coolant Inlet Pressure (bar)', key: 'tmsCoolantInletPressure', width: 28 },
      { header: 'SOC (%)', key: 'soc', width: 12 },
      { header: 'SOH (%)', key: 'soh', width: 12 },
      { header: 'BMS Current (A)', key: 'bmsCurrent', width: 18 },
      { header: 'BMS DC Voltage (V)', key: 'bmsDcVoltage', width: 20 },
      { header: 'Cabinet State', key: 'bmsCabinetState', width: 18 },
      { header: 'Cell V Max (V)', key: 'cellVMax', width: 18 },
      { header: 'Cell V Min (V)', key: 'cellVMin', width: 18 },
      { header: 'Cell Temp Max (°C)', key: 'cellTempMax', width: 22 },
      { header: 'Cell Temp Min (°C)', key: 'cellTempMin', width: 22 },
      { header: 'Battery Ambient Temperature (°C)', key: 'batteryAmbientTemp', width: 32 },
      { header: 'Pack 01 Average Temperature (°C)', key: 'pack01AvgTemp', width: 30 },
      { header: 'Pack 01 Maximum Temperature (°C)', key: 'pack01MaxTemp', width: 30 },
      { header: 'Pack 02 Average Temperature (°C)', key: 'pack02AvgTemp', width: 30 },
      { header: 'Pack 02 Maximum Temperature (°C)', key: 'pack02MaxTemp', width: 30 },
      { header: 'Pack 03 Average Temperature (°C)', key: 'pack03AvgTemp', width: 30 },
      { header: 'Pack 03 Maximum Temperature (°C)', key: 'pack03MaxTemp', width: 30 },
      { header: 'Pack 04 Average Temperature (°C)', key: 'pack04AvgTemp', width: 30 },
      { header: 'Pack 04 Maximum Temperature (°C)', key: 'pack04MaxTemp', width: 30 },
      { header: 'Pack 05 Average Temperature (°C)', key: 'pack05AvgTemp', width: 30 },
      { header: 'Pack 05 Maximum Temperature (°C)', key: 'pack05MaxTemp', width: 30 },
      { header: `Today Charge Energy (${energyUnit})`, key: 'todayChargeEnergy', width: 25 },
      { header: `Today Discharge Energy (${energyUnit})`, key: 'todayDischargeEnergy', width: 25 },
      { header: `Accum Charge Energy (${energyUnit})`, key: 'accumChargeEnergy', width: 25 },
      { header: `Accum Discharge Energy (${energyUnit})`, key: 'accumDischargeEnergy', width: 25 },
      { header: `Solar Power (${powerUnit})`, key: 'solarPower', width: 18 }
    ];

    // Create one dedicated worksheet per BESS asset (unique, Excel-safe names)
    const bessSheetNameMap = generateBessWorksheetNames(bessAssets, ['Site Summary']);
    const bessWorksheets = new Map<string, ExcelJS.Worksheet>();

    for (const bess of bessAssets) {
      const sheetName = bessSheetNameMap.get(bess.id)!;
      const sheet = workbook.addWorksheet(sheetName, {
        views: [{ state: 'frozen', xSplit: 2, ySplit: 12 }]
      });

      // Rows 1-7: Metadata
      const r1_s1 = sheet.addRow(['EMS Reports Export (Multi-BESS)']);
      r1_s1.font = { bold: true };
      const r2_s1 = sheet.addRow(['Client Name:', site.client?.name || 'Unknown Client']);
      const r3_s1 = sheet.addRow(['Site Name:', site.name]);
      const r4_s1 = sheet.addRow(['Site Identifier:', site.businessIdentifier || 'N/A']);
      const r5_s1 = sheet.addRow(['Report Period:', reportPeriodStr]);
      const r6_s1 = sheet.addRow(['Export Interval:', intervalStr]);
      sheet.addRow([]); // Blank row 7

      [r2_s1, r3_s1, r4_s1, r5_s1, r6_s1].forEach(row => {
        row.getCell(1).font = { bold: true };
        row.commit();
      });
      r1_s1.commit();

      // Rows 8-11: BESS Name and Energy Differences
      const nameRow = sheet.addRow([bess.name]);
      nameRow.font = { bold: true };
      nameRow.commit();

      const bDiff = perBessDiffMap.get(bess.id);
      const bChargeDisplay = bDiff?.chargeDiff != null ? round2(convertEnergy(bDiff.chargeDiff)) : null;
      const bDischargeDisplay = bDiff?.dischargeDiff != null ? round2(convertEnergy(bDiff.dischargeDiff)) : null;

      const cr1 = sheet.addRow(['Total Charge Difference', bChargeDisplay]);
      const cr2 = sheet.addRow(['Total Discharge Difference', bDischargeDisplay]);
      if (bChargeDisplay != null) cr1.getCell(2).numFmt = `0.00 "${energyUnit}"`;
      if (bDischargeDisplay != null) cr2.getCell(2).numFmt = `0.00 "${energyUnit}"`;
      cr1.commit();
      cr2.commit();
      sheet.addRow([]).commit(); // Blank row 11

      // Row 12: Column headers
      sheet.columns = bessDetailsColumns.map((c) => ({
        key: c.key,
        width: c.width,
      }));

      const headerRow = sheet.addRow(bessDetailsColumns.map((c) => c.header));
      headerRow.font = { bold: true };
      headerRow.commit();

      sheet.getColumn('timestamp').numFmt = 'dd mmmm yyyy, hh:mm:ss AM/PM';
      [
        'gridSideLoad', 'pcsActivePower',
        'pcsTemperature', 'pcsLineVoltage', 'pcsAcCurrent',
        'tmsAmbientTemp', 'tmsCoolantReturnTemp', 'tmsCoolantInletTemp',
        'soc', 'soh', 'bmsCurrent', 'bmsDcVoltage',
        'cellTempMax', 'cellTempMin',
        'batteryAmbientTemp',
        'pack01AvgTemp', 'pack01MaxTemp',
        'pack02AvgTemp', 'pack02MaxTemp',
        'pack03AvgTemp', 'pack03MaxTemp',
        'pack04AvgTemp', 'pack04MaxTemp',
        'pack05AvgTemp', 'pack05MaxTemp',
        'todayChargeEnergy', 'todayDischargeEnergy',
        'accumChargeEnergy', 'accumDischargeEnergy', 'solarPower'
      ].forEach(key => {
        sheet.getColumn(key).numFmt = '0.0';
      });
      sheet.getColumn('powerFactor').numFmt = '0.00';
      sheet.getColumn('bessPowerFactor').numFmt = '0.00';
      sheet.getColumn('gridFrequency').numFmt = '0.00';
      sheet.getColumn('bessFrequency').numFmt = '0.00';
      sheet.getColumn('tmsCoolantReturnPressure').numFmt = '0.00';
      sheet.getColumn('tmsCoolantInletPressure').numFmt = '0.00';
      sheet.getColumn('cellVMax').numFmt = '0.000';
      sheet.getColumn('cellVMin').numFmt = '0.000';

      bessWorksheets.set(bess.id, sheet);
    }

    const flushSummary = (rows: any[]) => {
      if (!sheetSummary || rows.length === 0) return;

      let sumGrid = 0; let countGrid = 0;
      let sumBess = 0; let countBess = 0;
      let sumSolar = 0; let countSolar = 0;
      let sumCharge = 0; let countCharge = 0;
      let sumDischarge = 0; let countDischarge = 0;
      let sumSoc = 0; let countSoc = 0;
      let sumSoh = 0; let countSoh = 0;
      let sumGridFreq = 0; let countGridFreq = 0;
      let sumBessFreq = 0; let countBessFreq = 0;
      let sumSolarFreq = 0; let countSolarFreq = 0;

      rows.forEach(r => {
        if (r.gridSideLoad != null) { sumGrid += Number(r.gridSideLoad); countGrid++; }
        if (r.pcsActivePower != null) { sumBess += Number(r.pcsActivePower); countBess++; }
        if (r.solarPower != null) { sumSolar += Number(r.solarPower); countSolar++; }
        if (r.todayChargeEnergy != null) { sumCharge += Number(r.todayChargeEnergy); countCharge++; }
        if (r.todayDischargeEnergy != null) { sumDischarge += Number(r.todayDischargeEnergy); countDischarge++; }
        if (r.soc != null) { sumSoc += Number(r.soc); countSoc++; }
        if (r.soh != null) { sumSoh += Number(r.soh); countSoh++; }
        if (r.gridFrequency != null) {
          const f = Number(r.gridFrequency);
          if (!isNaN(f)) { sumGridFreq += f; countGridFreq++; }
        }
        if (r.bessFrequency != null) {
          const f = Number(r.bessFrequency);
          if (!isNaN(f)) { sumBessFreq += f; countBessFreq++; }
        }
        if (r.solarFrequency != null) {
          const f = Number(r.solarFrequency);
          if (!isNaN(f)) { sumSolarFreq += f; countSolarFreq++; }
        }
      });

      const s2Row: any = {
        timestamp: currentBucketTimestamp,
        gridPower: countGrid > 0 ? round2(convertPower(sumGrid)) : null,
        bessPower: countBess > 0 ? round2(convertPower(sumBess)) : null,
        solarPower: countSolar > 0 ? round2(convertPower(sumSolar)) : null,
        todayCharge: countCharge > 0 ? round2(convertEnergy(sumCharge)) : null,
        todayDischarge: countDischarge > 0 ? round2(convertEnergy(sumDischarge)) : null,
        soc: countSoc > 0 ? round2(sumSoc / countSoc) : null,
        soh: countSoh > 0 ? round2(sumSoh / countSoh) : null,
        avgGridFreq: countGridFreq > 0 ? round2(sumGridFreq / countGridFreq) : null,
        avgBessFreq: countBessFreq > 0 ? round2(sumBessFreq / countBessFreq) : null,
        avgSolarFreq: countSolarFreq > 0 ? round2(sumSolarFreq / countSolarFreq) : null,
      };

      sheetSummary.addRow(s2Row).commit();
    };

    const rows = await prisma.$queryRawUnsafe(dataQuery) as any[];

    const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: siteTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });

    let currentBucketTimestamp: Date | null = null;
    let currentBucketRows: any[] = [];

    for (const row of rows) {
      processReportBatteryStatusRow(row);
      processReportPcsRow(row);
      processReportBmsRow(row);
      processReportTmsRow(row);

      const bucketTime = row.bucketTimestamp instanceof Date ? row.bucketTimestamp : new Date(row.bucketTimestamp);
      const parts = dateTimeFormatter.formatToParts(bucketTime);
      const partMap: Record<string, string> = {};
      for (const p of parts) partMap[p.type] = p.value;

      const shiftedTime = new Date(Date.UTC(
        parseInt(partMap.year, 10),
        parseInt(partMap.month, 10) - 1,
        parseInt(partMap.day, 10),
        parseInt(partMap.hour, 10),
        parseInt(partMap.minute, 10),
        parseInt(partMap.second, 10)
      ));

        const s1Row = {
          timestamp: shiftedTime,
          bessName: row.bessName,
          emuId: row.emuId,
          gridSideLoad: row.gridSideLoad != null ? round2(convertPower(row.gridSideLoad)) : null,
          gridFrequency: row.gridFrequency != null ? round2(Number(row.gridFrequency)) : null,
          powerFactor: row.powerFactor != null ? round2(Number(row.powerFactor)) : null,
          bessFrequency: row.bessFrequency != null ? round2(Number(row.bessFrequency)) : null,
          bessPowerFactor: row.bessPowerFactor != null ? round2(Number(row.bessPowerFactor)) : null,
          pcsActivePower: row.pcsActivePower != null ? round2(convertPower(row.pcsActivePower)) : null,
          pcsTemperature: row.pcsTemperature != null ? round2(Number(row.pcsTemperature)) : null,
          pcsLineVoltage: row.pcsLineVoltage != null ? round2(Number(row.pcsLineVoltage)) : null,
          pcsAcCurrent: row.pcsAcCurrent != null ? round2(Number(row.pcsAcCurrent)) : null,
          tmsOperatingMode: formatTmsMode(row.tmsOperatingMode) || null,
          tmsAmbientTemp: row.tmsAmbientTemp != null ? round2(Number(row.tmsAmbientTemp)) : null,
          tmsCoolantReturnTemp: row.tmsCoolantReturnTemp != null ? round2(Number(row.tmsCoolantReturnTemp)) : null,
          tmsCoolantInletTemp: row.tmsCoolantInletTemp != null ? round2(Number(row.tmsCoolantInletTemp)) : null,
          tmsCoolantReturnPressure: row.tmsCoolantReturnPressure != null ? round2(Number(row.tmsCoolantReturnPressure)) : null,
          tmsCoolantInletPressure: row.tmsCoolantInletPressure != null ? round2(Number(row.tmsCoolantInletPressure)) : null,
          soc: row.soc != null ? round2(Number(row.soc)) : null,
          soh: row.soh != null ? round2(Number(row.soh)) : null,
          bmsCurrent: row.bmsCurrent != null ? round2(Number(row.bmsCurrent)) : null,
          bmsDcVoltage: row.bmsDcVoltage != null ? round2(Number(row.bmsDcVoltage)) : null,
          bmsCabinetState: formatCabinetState(row.bmsCabinetState) || null,
          cellVMax: row.cellVMax != null ? Math.round(Number(row.cellVMax) * 1000) / 1000 : null,
          cellVMin: row.cellVMin != null ? Math.round(Number(row.cellVMin) * 1000) / 1000 : null,
          cellTempMax: row.cellTempMax != null ? round2(Number(row.cellTempMax)) : null,
          cellTempMin: row.cellTempMin != null ? round2(Number(row.cellTempMin)) : null,
          batteryAmbientTemp: row.batteryAmbientTemp != null ? round2(Number(row.batteryAmbientTemp)) : null,
          pack01AvgTemp: row.pack01AvgTemp != null ? round2(Number(row.pack01AvgTemp)) : null,
          pack01MaxTemp: row.pack01MaxTemp != null ? round2(Number(row.pack01MaxTemp)) : null,
          pack02AvgTemp: row.pack02AvgTemp != null ? round2(Number(row.pack02AvgTemp)) : null,
          pack02MaxTemp: row.pack02MaxTemp != null ? round2(Number(row.pack02MaxTemp)) : null,
          pack03AvgTemp: row.pack03AvgTemp != null ? round2(Number(row.pack03AvgTemp)) : null,
          pack03MaxTemp: row.pack03MaxTemp != null ? round2(Number(row.pack03MaxTemp)) : null,
          pack04AvgTemp: row.pack04AvgTemp != null ? round2(Number(row.pack04AvgTemp)) : null,
          pack04MaxTemp: row.pack04MaxTemp != null ? round2(Number(row.pack04MaxTemp)) : null,
          pack05AvgTemp: row.pack05AvgTemp != null ? round2(Number(row.pack05AvgTemp)) : null,
          pack05MaxTemp: row.pack05MaxTemp != null ? round2(Number(row.pack05MaxTemp)) : null,
          todayChargeEnergy: row.todayChargeEnergy != null ? round2(convertEnergy(row.todayChargeEnergy)) : null,
          todayDischargeEnergy: row.todayDischargeEnergy != null ? round2(convertEnergy(row.todayDischargeEnergy)) : null,
          accumChargeEnergy: row.accumChargeEnergy != null ? round2(convertEnergy(row.accumChargeEnergy)) : null,
          accumDischargeEnergy: row.accumDischargeEnergy != null ? round2(convertEnergy(row.accumDischargeEnergy)) : null,
          solarPower: row.solarPower != null ? round2(convertPower(row.solarPower)) : null,
        };

        const targetSheet = bessWorksheets.get(row.bessAssetId);
        if (targetSheet) {
          targetSheet.addRow(s1Row).commit();
        }

        const rowTimeStr = shiftedTime.getTime();
        if (currentBucketTimestamp && currentBucketTimestamp.getTime() !== rowTimeStr) {
          flushSummary(currentBucketRows);
          currentBucketRows = [];
        }
        currentBucketTimestamp = shiftedTime;
        currentBucketRows.push(row);
      }

    if (currentBucketRows.length > 0) {
      flushSummary(currentBucketRows);
    }

    sheetSummary.commit();
    for (const sheet of bessWorksheets.values()) {
      sheet.commit();
    }
    await workbook.commit();
  }

  public async exportMultiBessCsv(
    res: Response,
    siteId: string,
    intervalMinutes: number,
    from: Date | undefined,
    to: Date | undefined,
    preloadedSite?: any,
    preloadedBessAssets?: any[],
    options?: ExportUnitOptions
  ) {
    const site = preloadedSite || await prisma.site.findUnique({
      where: { id: siteId },
      include: { client: true }
    });
    if (!site) {
      throw new Error('Site not found');
    }
    const siteTimezone = site.timezone || 'Asia/Kolkata';

    const bessAssets = preloadedBessAssets || await prisma.bESSAsset.findMany({
      where: { siteId },
      orderBy: { name: 'asc' },
    });

    if (bessAssets.length === 0) {
      throw new Error('No BESS assets found for this site.');
    }

    const { powerUnit, energyUnit, convertPower, convertEnergy } = getExportUnitConverters(options);

    const effectiveInterval = intervalMinutes || bessAssets[0]?.reportIntervalMinutes || 15;
    const intervalStr = `${effectiveInterval} minutes`;
    const { dataQuery, bessAssetFilter, timeFilter } = this.buildDataQuery(siteId, intervalStr, from, to, true);

    if (typeof res.setHeader === 'function' && !res.headersSent) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    }

    // Send UTF-8 BOM for Microsoft Excel compatibility
    res.write('\uFEFF');

    // Section 1: Common Metadata Headers
    const reportPeriodStr = formatReportPeriod(from, to, siteTimezone);
    res.write(formatCsvRow(['EMS Reports Export (Multi-BESS)']));
    res.write(formatCsvRow(['Client Name:', site.client?.name || 'Unknown Client']));
    res.write(formatCsvRow(['Site Name:', site.name]));
    res.write(formatCsvRow(['Site Identifier:', site.businessIdentifier || 'N/A']));
    res.write(formatCsvRow(['Report Period:', reportPeriodStr]));
    res.write(formatCsvRow(['Export Interval:', intervalStr]));
    res.write(formatCsvRow([])); // Blank line

    const round2 = (n: number | null): number | null => (n != null ? Math.round(n * 100) / 100 : null);
    const boundaryQuery = `
      SELECT
        d."bessAssetId",
        b."name" AS "bessName",
        (array_agg(th."accumChargeEnergy" ORDER BY th."timestamp" ASC) FILTER (WHERE th."accumChargeEnergy" IS NOT NULL))[1] AS "firstCharge",
        (array_agg(th."accumChargeEnergy" ORDER BY th."timestamp" DESC) FILTER (WHERE th."accumChargeEnergy" IS NOT NULL))[1] AS "lastCharge",
        (array_agg(th."accumDischargeEnergy" ORDER BY th."timestamp" ASC) FILTER (WHERE th."accumDischargeEnergy" IS NOT NULL))[1] AS "firstDischarge",
        (array_agg(th."accumDischargeEnergy" ORDER BY th."timestamp" DESC) FILTER (WHERE th."accumDischargeEnergy" IS NOT NULL))[1] AS "lastDischarge"
      FROM "TelemetryHistory" th
      JOIN "Device" d ON th."deviceId" = d."id"
      JOIN "BESSAsset" b ON d."bessAssetId" = b."id"
      WHERE ${bessAssetFilter} AND ${timeFilter}
      GROUP BY d."bessAssetId", b."name"
      ORDER BY b."name" ASC
    `;
    const boundaries = await prisma.$queryRawUnsafe(boundaryQuery) as any[];

    let siteChargeDiff: number | null = null;
    let siteDischargeDiff: number | null = null;
    const boundaryMap: Record<string, any> = {};
    for (const b of boundaries) {
      if (b.bessAssetId) boundaryMap[b.bessAssetId] = b;
      if (b.bessName) boundaryMap[b.bessName] = b;
    }

    const perBessDiffs: { name: string; chargeDiff: number | null; dischargeDiff: number | null }[] = [];
    for (const bess of bessAssets) {
      const b = boundaryMap[bess.id] || boundaryMap[bess.name];
      const cDiff = (b && b.firstCharge != null && b.lastCharge != null)
        ? round2(Number(b.lastCharge) - Number(b.firstCharge))
        : null;
      const dDiff = (b && b.firstDischarge != null && b.lastDischarge != null)
        ? round2(Number(b.lastDischarge) - Number(b.firstDischarge))
        : null;

      if (cDiff !== null) siteChargeDiff = round2((siteChargeDiff ?? 0) + cDiff);
      if (dDiff !== null) siteDischargeDiff = round2((siteDischargeDiff ?? 0) + dDiff);

      perBessDiffs.push({ name: bess.name, chargeDiff: cDiff, dischargeDiff: dDiff });
    }

    const siteChargeDiffDisplay = siteChargeDiff != null ? round2(convertEnergy(siteChargeDiff)) : null;
    const siteDischargeDiffDisplay = siteDischargeDiff != null ? round2(convertEnergy(siteDischargeDiff)) : null;

    // Section 2: Energy Summaries
    res.write(formatCsvRow(['--- SITE ENERGY SUMMARY ---']));
    res.write(formatCsvRow([`Total Site Charge Difference (${energyUnit})`, siteChargeDiffDisplay != null ? siteChargeDiffDisplay : '']));
    res.write(formatCsvRow([`Total Site Discharge Difference (${energyUnit})`, siteDischargeDiffDisplay != null ? siteDischargeDiffDisplay : '']));
    res.write(formatCsvRow([])); // Blank line

    res.write(formatCsvRow(['--- PER-BESS ENERGY SUMMARY ---']));
    res.write(formatCsvRow(['BESS Name', `Total Charge Difference (${energyUnit})`, `Total Discharge Difference (${energyUnit})`]));
    for (const b of perBessDiffs) {
      const bChargeDisplay = b.chargeDiff != null ? round2(convertEnergy(b.chargeDiff)) : '';
      const bDischargeDisplay = b.dischargeDiff != null ? round2(convertEnergy(b.dischargeDiff)) : '';
      res.write(formatCsvRow([b.name, bChargeDisplay, bDischargeDisplay]));
    }
    res.write(formatCsvRow([])); // Blank line

    // Section 3: Site Summary Interval Telemetry
    const siteSummaryHeaders: string[] = [
      'Timestamp',
      `Total Grid Power (${powerUnit})`,
      `Total BESS Power (${powerUnit})`,
      `Total Solar Power (${powerUnit})`,
      `Total Today Charge (${energyUnit})`,
      `Total Today Discharge (${energyUnit})`,
      'Average SOC (%)',
      'Average SOH (%)',
      'Max PCS Temperature (°C)'
    ];

    // Grid Frequency columns per BESS
    for (let i = 0; i < bessAssets.length; i++) {
      siteSummaryHeaders.push(`${bessAssets[i].name} Grid Frequency (Hz)`);
    }

    res.write(formatCsvRow(['--- SITE SUMMARY (INTERVAL TELEMETRY) ---']));
    res.write(formatCsvRow(siteSummaryHeaders));

    const multiBessRows = await prisma.$queryRawUnsafe(dataQuery) as any[];

    for (const row of multiBessRows) {
      processReportBatteryStatusRow(row);
      processReportPcsRow(row);
      processReportBmsRow(row);
      processReportTmsRow(row);
    }

    // Group rows by bucket timestamp to aggregate Site Summary intervals
    const bucketMap = new Map<string, any[]>();
    for (const row of multiBessRows) {
      const tsKey = row.bucketTimestamp instanceof Date
        ? row.bucketTimestamp.toISOString()
        : new Date(row.bucketTimestamp).toISOString();
      if (!bucketMap.has(tsKey)) {
        bucketMap.set(tsKey, []);
      }
      bucketMap.get(tsKey)!.push(row);
    }

    // Number formatting helper (up to 2 decimals)
    const format2Dec = (v: any) => {
      if (v === null || v === undefined) return '';
      const num = Number(v);
      if (isNaN(num)) return v;
      return Math.round(num * 100) / 100;
    };

    const format3Dec = (v: any) => {
      if (v === null || v === undefined) return '';
      const num = Number(v);
      if (isNaN(num)) return v;
      return Math.round(num * 1000) / 1000;
    };

    for (const [, bucketRows] of bucketMap) {
      let sumGrid = 0; let countGrid = 0;
      let sumBess = 0; let countBess = 0;
      let sumSolar = 0; let countSolar = 0;
      let sumCharge = 0; let countCharge = 0;
      let sumDischarge = 0; let countDischarge = 0;
      let sumSoc = 0; let countSoc = 0;
      let sumSoh = 0; let countSoh = 0;
      let maxTemp = -Infinity; let countTemp = 0;

      const voltMap: Record<string, any> = {};

      bucketRows.forEach(r => {
        if (r.gridSideLoad != null) { sumGrid += Number(r.gridSideLoad); countGrid++; }
        if (r.pcsActivePower != null) { sumBess += Number(r.pcsActivePower); countBess++; }
        if (r.solarPower != null) { sumSolar += Number(r.solarPower); countSolar++; }
        if (r.todayChargeEnergy != null) { sumCharge += Number(r.todayChargeEnergy); countCharge++; }
        if (r.todayDischargeEnergy != null) { sumDischarge += Number(r.todayDischargeEnergy); countDischarge++; }
        if (r.soc != null) { sumSoc += Number(r.soc); countSoc++; }
        if (r.soh != null) { sumSoh += Number(r.soh); countSoh++; }
        if (r.ambientTemp != null) {
          const t = Number(r.ambientTemp);
          if (t > maxTemp) maxTemp = t;
          countTemp++;
        }

        const key = r.bessAssetId || r.bessName;
        voltMap[key] = {
          gridFrequency: r.gridFrequency != null ? Number(r.gridFrequency) : null
        };
      });

      const bucketTime = bucketRows[0].bucketTimestamp instanceof Date
        ? bucketRows[0].bucketTimestamp
        : new Date(bucketRows[0].bucketTimestamp);
      const formattedBucketTime = formatSiteTimestamp(bucketTime, siteTimezone);

      const s2RowData: any[] = [
        formattedBucketTime,
        countGrid > 0 ? format2Dec(convertPower(sumGrid)) : '',
        countBess > 0 ? format2Dec(convertPower(sumBess)) : '',
        countSolar > 0 ? format2Dec(convertPower(sumSolar)) : '',
        countCharge > 0 ? format2Dec(convertEnergy(sumCharge)) : '',
        countDischarge > 0 ? format2Dec(convertEnergy(sumDischarge)) : '',
        countSoc > 0 ? format2Dec(sumSoc / countSoc) : '',
        countSoh > 0 ? format2Dec(sumSoh / countSoh) : '',
        countTemp > 0 ? format2Dec(maxTemp) : ''
      ];

      for (let i = 0; i < bessAssets.length; i++) {
        const bess = bessAssets[i];
        const vals = voltMap[bess.id] || voltMap[bess.name];
        s2RowData.push(vals && vals.gridFrequency != null ? format2Dec(vals.gridFrequency) : '');
      }

      res.write(formatCsvRow(s2RowData));
    }
    res.write(formatCsvRow([])); // Blank line

    // Section 4: Per-BESS Details Interval Telemetry
    res.write(formatCsvRow(['--- PER-BESS DETAILS (INTERVAL TELEMETRY) ---']));
    const headers = getAuthoritativeTelemetryHeaders({ powerUnit, energyUnit });
    res.write(formatCsvRow(headers));

    for (const row of multiBessRows) {
      const bucketTime = row.bucketTimestamp instanceof Date ? row.bucketTimestamp : new Date(row.bucketTimestamp);
      const formattedTime = formatSiteTimestamp(bucketTime, siteTimezone);

      const dataRow = [
        formattedTime,
        row.bessName,
        row.emuId,
        format2Dec(convertPower(row.gridSideLoad)),
        format2Dec(row.gridFrequency),
        format2Dec(row.powerFactor),
        format2Dec(row.bessFrequency),
        format2Dec(row.bessPowerFactor),
        format2Dec(convertPower(row.pcsActivePower)),
        format2Dec(row.pcsTemperature),
        format2Dec(row.pcsLineVoltage),
        format2Dec(row.pcsAcCurrent),
        formatTmsMode(row.tmsOperatingMode),
        format2Dec(row.tmsAmbientTemp),
        format2Dec(row.tmsCoolantReturnTemp),
        format2Dec(row.tmsCoolantInletTemp),
        format2Dec(row.tmsCoolantReturnPressure),
        format2Dec(row.tmsCoolantInletPressure),
        format2Dec(row.soc),
        format2Dec(row.soh),
        format2Dec(row.bmsCurrent),
        format2Dec(row.bmsDcVoltage),
        formatCabinetState(row.bmsCabinetState),
        format3Dec(row.cellVMax),
        format3Dec(row.cellVMin),
        format2Dec(row.cellTempMax),
        format2Dec(row.cellTempMin),
        format2Dec(row.batteryAmbientTemp),
        format2Dec(row.pack01AvgTemp),
        format2Dec(row.pack01MaxTemp),
        format2Dec(row.pack02AvgTemp),
        format2Dec(row.pack02MaxTemp),
        format2Dec(row.pack03AvgTemp),
        format2Dec(row.pack03MaxTemp),
        format2Dec(row.pack04AvgTemp),
        format2Dec(row.pack04MaxTemp),
        format2Dec(row.pack05AvgTemp),
        format2Dec(row.pack05MaxTemp),
        format2Dec(convertEnergy(row.todayChargeEnergy)),
        format2Dec(convertEnergy(row.todayDischargeEnergy)),
        format2Dec(convertEnergy(row.accumChargeEnergy)),
        format2Dec(convertEnergy(row.accumDischargeEnergy)),
        format2Dec(convertPower(row.solarPower))
      ];
      res.write(formatCsvRow(dataRow));
    }

    res.end();
  }

  // Alias for backward compatibility with existing callers/tests
  public generateExcelExport = this.exportDynamicReport;

  public async exportVoltageTrend(
    res: Response,
    bessAssetId: string,
    from: Date | undefined,
    to: Date | undefined,
    includeUnknown: boolean = false
  ) {
    const bessAsset = await prisma.bESSAsset.findUnique({
      where: { id: bessAssetId },
      include: { site: { include: { client: true } } }
    });
    if (!bessAsset) throw new Error('BESS Asset not found');

    const siteTimezone = bessAsset.site?.timezone || 'Asia/Kolkata';

    let timeFilter = `1=1`;
    if (from) {
      timeFilter += ` AND th."timestamp" >= '${from.toISOString()}'::timestamp`;
    }
    if (to) {
      timeFilter += ` AND th."timestamp" < '${to.toISOString()}'::timestamp`;
    }

    const dataQuery = `
      SELECT
        th."timestamp",
        b."emuId" AS "emuId",
        th."gridVoltageUab",
        th."gridVoltageUbc",
        th."gridVoltageUca",
        th."bessVoltageUa",
        th."bessVoltageUb",
        th."bessVoltageUc",
        th."gridOnState",
        th."gridOffState"
      FROM "TelemetryHistory" th
      JOIN "Device" d ON th."deviceId" = d."id"
      JOIN "BESSAsset" b ON d."bessAssetId" = b."id"
      WHERE d."bessAssetId" = '${bessAssetId}' AND d."componentId" = 'pcs' AND ${timeFilter}
      ORDER BY th."timestamp" ASC, th."gridOnState" DESC NULLS LAST
    `;

    // Metadata Rows (Rows 1-11)
    res.write(formatCsvRow(['Voltage Trend Report']));
    res.write(formatCsvRow(['Client Name:', bessAsset.site?.client?.name || 'Unknown Client']));
    res.write(formatCsvRow(['Site Name:', bessAsset.site?.name || 'Unknown Site']));
    res.write(formatCsvRow(['Site Identifier:', bessAsset.site?.businessIdentifier || 'N/A']));
    res.write(formatCsvRow(['BESS Asset:', bessAsset.name]));
    res.write(formatCsvRow(['BESS Identifier:', bessAsset.assetIdentifier || 'N/A']));
    res.write(formatCsvRow(['EMU Serial No.:', bessAsset.emuId || 'N/A']));
    res.write(formatCsvRow(['BESS Model:', bessAsset.model || 'N/A']));
    res.write(formatCsvRow(['Energy Capacity:', bessAsset.energyCapacity != null ? bessAsset.energyCapacity + ' kWh' : 'N/A']));
    res.write(formatCsvRow(['Power Rating:', bessAsset.powerRating != null ? bessAsset.powerRating + ' kW' : 'N/A']));
    res.write(formatCsvRow(['Note:', includeUnknown ? 'Active Source "UNKNOWN" indicates operating state is missing; raw measurements are displayed but source activity is unconfirmed.' : 'Only records with confirmed operating states are included in this report.']));

    // Column Headers (Row 12)
    const headers = [
      'Timestamp',
      'BESS Asset',
      'EMU Serial No.',
      'Active Source',
      'Grid Uab (V)',
      'Grid Ubc (V)',
      'Grid Uca (V)',
      'BESS Uab (V)',
      'BESS Ubc (V)',
      'BESS Uca (V)',
    ];
    res.write(formatCsvRow(headers));

    let offset = 0;
    const limit = 5000;
    let hasMore = true;
    const processor = new VoltageTrendProcessor();

    if (from) {
      const lastKnownStateQuery = `
        SELECT th."timestamp", th."gridOnState", th."gridOffState"
        FROM "TelemetryHistory" th
        JOIN "Device" d ON th."deviceId" = d."id"
        WHERE d."bessAssetId" = '${bessAssetId}'
          AND d."componentId" = 'pcs'
          AND th."timestamp" < '${from.toISOString()}'::timestamp
          AND (th."gridOnState" IS NOT NULL OR th."gridOffState" IS NOT NULL)
        ORDER BY th."timestamp" DESC
        LIMIT 1
      `;
      const lastKnownStateRows = await prisma.$queryRawUnsafe(lastKnownStateQuery) as any[];
      if (lastKnownStateRows.length > 0) {
        const row = lastKnownStateRows[0];
        processor.setInitialState(
          row.gridOnState,
          row.gridOffState,
          row.timestamp instanceof Date ? row.timestamp.getTime() : new Date(row.timestamp).getTime()
        );
      }
    }

    while (hasMore) {
      const chunkQuery = `${dataQuery} LIMIT ${limit} OFFSET ${offset}`;
      const chunk = await prisma.$queryRawUnsafe(chunkQuery) as any[];

      for (const row of chunk) {
        const bucketTime = row.timestamp as Date;
        const formattedTime = formatSiteTimestamp(bucketTime, siteTimezone);

        const { activeSource, gridUab, gridUbc, gridUca, bessUa, bessUb, bessUc } = processor.processRow(row);

        if (!includeUnknown && activeSource === 'UNKNOWN') {
          continue;
        }

        const dataRow = [
          formattedTime,
          bessAsset.name,
          row.emuId,
          activeSource,
          gridUab,
          gridUbc,
          gridUca,
          bessUa,
          bessUb,
          bessUc,
        ];
        res.write(formatCsvRow(dataRow));
      }

      if (chunk.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }

    res.end();
  }

  async exportGridStateTrend(bessAssetId: string, from?: Date, to?: Date, res?: any) {
    const bessAsset = await prisma.bESSAsset.findUnique({
      where: { id: bessAssetId },
      include: { site: { include: { client: true } } }
    });

    if (!bessAsset) throw new Error('BESS Asset not found');
    const siteTimezone = bessAsset.site?.timezone || 'Asia/Kolkata';

    let timeFilter = '1=1';
    if (from) {
      timeFilter += ` AND th."timestamp" >= '${from.toISOString()}'::timestamp`;
    }
    if (to) {
      timeFilter += ` AND th."timestamp" < '${to.toISOString()}'::timestamp`;
    }

    const dataQuery = `
      SELECT
        th."timestamp",
        b."emuId" AS "emuId",
        th."gridOnState",
        th."gridOffState"
      FROM "TelemetryHistory" th
      JOIN "Device" d ON th."deviceId" = d."id"
      JOIN "BESSAsset" b ON d."bessAssetId" = b."id"
      WHERE d."bessAssetId" = '${bessAssetId}' AND d."componentId" = 'pcs' AND ${timeFilter}
      ORDER BY th."timestamp" ASC
    `;

    // Metadata Rows (Rows 1-11)
    res.write(formatCsvRow(['Grid State Trend Report']));
    res.write(formatCsvRow(['Client Name:', bessAsset.site?.client?.name || 'Unknown Client']));
    res.write(formatCsvRow(['Site Name:', bessAsset.site?.name || 'Unknown Site']));
    res.write(formatCsvRow(['Site Identifier:', bessAsset.site?.businessIdentifier || 'N/A']));
    res.write(formatCsvRow(['BESS Asset:', bessAsset.name]));
    res.write(formatCsvRow(['BESS Identifier:', bessAsset.assetIdentifier || 'N/A']));
    res.write(formatCsvRow(['EMU Serial No.:', bessAsset.emuId || 'N/A']));
    res.write(formatCsvRow(['BESS Model:', bessAsset.model || 'N/A']));
    res.write(formatCsvRow(['Energy Capacity:', bessAsset.energyCapacity != null ? bessAsset.energyCapacity + ' kWh' : 'N/A']));
    res.write(formatCsvRow(['Power Rating:', bessAsset.powerRating != null ? bessAsset.powerRating + ' kW' : 'N/A']));
    res.write(formatCsvRow([])); // Blank row 11

    // Column Headers (Row 12)
    const headers = [
      'Timestamp',
      'BESS Asset',
      'EMU Serial No.',
      'Grid ON State',
      'Grid OFF State',
    ];
    res.write(formatCsvRow(headers));

    let offset = 0;
    const limit = 5000;
    let hasMore = true;

    while (hasMore) {
      const chunkQuery = `${dataQuery} LIMIT ${limit} OFFSET ${offset}`;
      const chunk = await prisma.$queryRawUnsafe(chunkQuery) as any[];

      for (const row of chunk) {
        const bucketTime = row.timestamp as Date;
        const formattedTime = formatSiteTimestamp(bucketTime, siteTimezone);

        const dataRow = [
          formattedTime,
          bessAsset.name,
          row.emuId,
          row.gridOnState,
          row.gridOffState,
        ];
        res.write(formatCsvRow(dataRow));
      }

      if (chunk.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }

    res.end();
  }
}
export const reportExportService = new ReportExportService();
