import { prisma } from '../db/prisma';
import { processReportBatteryStatusRow } from '../utils/battery-status.util';
import { processReportPcsRow } from '../utils/pcs-telemetry.util';
import { processReportBmsRow } from '../utils/bms-telemetry.util';
import { processReportTmsRow } from '../utils/tms-telemetry.util';

export class DynamicReportService {
  public async getDynamicReport(
    siteId: string,
    intervalMinutes: number,
    from: Date | undefined,
    to: Date | undefined,
    bessAssetId: string | undefined,
    limit: number,
    offset: number
  ) {
    const intervalStr = `${intervalMinutes || 15} minutes`;
    
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

    const baseQuery = `
      FROM "TelemetryHistory" th
      JOIN "Device" d ON th."deviceId" = d."id"
      JOIN "BESSAsset" b ON d."bessAssetId" = b."id"
      WHERE ${bessAssetFilter} AND ${timeFilter}
      GROUP BY d."bessAssetId", b."name", b."emuId", date_bin('${intervalStr}'::interval, th."timestamp", '2000-01-01 00:00:00Z')
    `;

    const countQuery = `
      SELECT CAST(COUNT(*) AS INTEGER) as total
      FROM (
        SELECT d."bessAssetId", date_bin('${intervalStr}'::interval, th."timestamp", '2000-01-01 00:00:00Z')
        ${baseQuery}
      ) sub
    `;

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
        MAX(th."cellVMax") AS "cellVMax",
        MAX(th."cellTempMax") AS "cellTempMax",
        MIN(th."cellVMin") AS "cellVMin",
        (array_agg(th."todayChargeEnergy" ORDER BY th."timestamp" DESC) FILTER (WHERE th."todayChargeEnergy" IS NOT NULL))[1] AS "todayChargeEnergy",
        (array_agg(th."todayDischargeEnergy" ORDER BY th."timestamp" DESC) FILTER (WHERE th."todayDischargeEnergy" IS NOT NULL))[1] AS "todayDischargeEnergy",
        (array_agg(th."accumChargeEnergy" ORDER BY th."timestamp" DESC) FILTER (WHERE th."accumChargeEnergy" IS NOT NULL))[1] AS "accumChargeEnergy",
        (array_agg(th."accumDischargeEnergy" ORDER BY th."timestamp" DESC) FILTER (WHERE th."accumDischargeEnergy" IS NOT NULL))[1] AS "accumDischargeEnergy",
        (array_agg(th."soc" ORDER BY th."timestamp" DESC) FILTER (WHERE th."soc" IS NOT NULL))[1] AS "soc",
        (array_agg(th."soh" ORDER BY th."timestamp" DESC) FILTER (WHERE th."soh" IS NOT NULL))[1] AS "soh",
        AVG(CASE WHEN d."componentId" = 'th' AND jsonb_typeof(th."rawPayload") = 'array' THEN
          (SELECT (elem->>'v')::double precision
           FROM jsonb_array_elements(th."rawPayload") elem
           WHERE elem->>'m' = 'ai_temp' AND elem->>'v' ~ '^-?[0-9]+(\.[0-9]+)?$' LIMIT 1)
        END) AS "batteryAmbientTemp",
        (array_agg(th."rawPayload" ORDER BY th."timestamp" DESC) FILTER (WHERE d."componentId" = 'pack_01' AND th."rawPayload" IS NOT NULL)) AS "pack01Payloads",
        (array_agg(th."rawPayload" ORDER BY th."timestamp" DESC) FILTER (WHERE d."componentId" = 'pack_02' AND th."rawPayload" IS NOT NULL)) AS "pack02Payloads",
        (array_agg(th."rawPayload" ORDER BY th."timestamp" DESC) FILTER (WHERE d."componentId" = 'pack_03' AND th."rawPayload" IS NOT NULL)) AS "pack03Payloads",
        (array_agg(th."rawPayload" ORDER BY th."timestamp" DESC) FILTER (WHERE d."componentId" = 'pack_04' AND th."rawPayload" IS NOT NULL)) AS "pack04Payloads",
        (array_agg(th."rawPayload" ORDER BY th."timestamp" DESC) FILTER (WHERE d."componentId" = 'pack_05' AND th."rawPayload" IS NOT NULL)) AS "pack05Payloads",
        AVG(CASE WHEN d."componentId" = 'pcs' AND jsonb_typeof(th."rawPayload") = 'array' THEN
          (SELECT (elem->>'v')::double precision
           FROM jsonb_array_elements(th."rawPayload") elem
           WHERE elem->>'m' = 'ai_igbt_temp' AND elem->>'v' ~ '^-?[0-9]+(\.[0-9]+)?$' LIMIT 1)
        END) AS "pcsTemperature",
        AVG(CASE WHEN d."componentId" = 'pcs'
                 AND th."bessVoltageUa" IS NOT NULL
                 AND th."bessVoltageUb" IS NOT NULL
                 AND th."bessVoltageUc" IS NOT NULL
            THEN (th."bessVoltageUa" + th."bessVoltageUb" + th."bessVoltageUc") / 3.0
            WHEN d."componentId" = 'pcs' AND jsonb_typeof(th."rawPayload") = 'array' THEN
              (SELECT CASE WHEN count(*) = 3 THEN avg((elem->>'v')::double precision) END
               FROM jsonb_array_elements(th."rawPayload") elem
               WHERE elem->>'m' IN ('ai_out_uab', 'ai_out_ubc', 'ai_out_uca') AND elem->>'v' ~ '^-?[0-9]+(\.[0-9]+)?$')
        END) AS "pcsLineVoltage",
        AVG(CASE WHEN d."componentId" = 'pcs' AND jsonb_typeof(th."rawPayload") = 'array' THEN
          (SELECT CASE WHEN count(*) = 3 THEN avg((elem->>'v')::double precision) END
           FROM jsonb_array_elements(th."rawPayload") elem
           WHERE elem->>'m' IN ('ai_ia', 'ai_ib', 'ai_ic') AND elem->>'v' ~ '^-?[0-9]+(\.[0-9]+)?$')
        END) AS "pcsAcCurrent",
        AVG(CASE WHEN d."componentId" = 'tms' AND jsonb_typeof(th."rawPayload") = 'array' THEN
          (SELECT (elem->>'v')::double precision
           FROM jsonb_array_elements(th."rawPayload") elem
           WHERE elem->>'m' = 'ai_at' AND elem->>'v' ~ '^-?[0-9]+(\.[0-9]+)?$' LIMIT 1)
        END) AS "tmsAmbientTemp",
        (array_agg(
          CASE WHEN d."componentId" = 'tms' AND jsonb_typeof(th."rawPayload") = 'array' THEN
            (SELECT (elem->>'v')::integer
             FROM jsonb_array_elements(th."rawPayload") elem
             WHERE elem->>'m' = 'di_singco_state' AND elem->>'v' ~ '^[0-4]$' LIMIT 1)
          END
          ORDER BY th."timestamp" DESC
        ) FILTER (
          WHERE d."componentId" = 'tms' AND jsonb_typeof(th."rawPayload") = 'array' AND
          EXISTS (
            SELECT 1 FROM jsonb_array_elements(th."rawPayload") elem
            WHERE elem->>'m' = 'di_singco_state' AND elem->>'v' ~ '^[0-4]$'
          )
        ))[1] AS "tmsOperatingMode",
        AVG(CASE WHEN d."componentId" = 'tms' AND jsonb_typeof(th."rawPayload") = 'array' THEN
          (SELECT (elem->>'v')::double precision
           FROM jsonb_array_elements(th."rawPayload") elem
           WHERE elem->>'m' = 'ai_iw_temp' AND elem->>'v' ~ '^-?[0-9]+(\.[0-9]+)?$' LIMIT 1)
        END) AS "tmsCoolantReturnTemp",
        AVG(CASE WHEN d."componentId" = 'tms' AND jsonb_typeof(th."rawPayload") = 'array' THEN
          (SELECT (elem->>'v')::double precision
           FROM jsonb_array_elements(th."rawPayload") elem
           WHERE elem->>'m' = 'ai_ow_temp' AND elem->>'v' ~ '^-?[0-9]+(\.[0-9]+)?$' LIMIT 1)
        END) AS "tmsCoolantInletTemp",
        AVG(CASE WHEN d."componentId" = 'tms' AND jsonb_typeof(th."rawPayload") = 'array' THEN
          (SELECT (elem->>'v')::double precision
           FROM jsonb_array_elements(th."rawPayload") elem
           WHERE elem->>'m' = 'ai_iw_prs' AND elem->>'v' ~ '^-?[0-9]+(\.[0-9]+)?$' LIMIT 1)
        END) AS "tmsCoolantReturnPressure",
        AVG(CASE WHEN d."componentId" = 'tms' AND jsonb_typeof(th."rawPayload") = 'array' THEN
          (SELECT (elem->>'v')::double precision
           FROM jsonb_array_elements(th."rawPayload") elem
           WHERE elem->>'m' = 'ai_ow_prs' AND elem->>'v' ~ '^-?[0-9]+(\.[0-9]+)?$' LIMIT 1)
        END) AS "tmsCoolantInletPressure",
        AVG(CASE WHEN d."componentId" = 'bcms' AND jsonb_typeof(th."rawPayload") = 'array' THEN
          (SELECT (elem->>'v')::double precision
           FROM jsonb_array_elements(th."rawPayload") elem
           WHERE elem->>'m' = 'ai_sum_u' AND elem->>'v' ~ '^-?[0-9]+(\.[0-9]+)?$' LIMIT 1)
        END) AS "bmsDcVoltage",
        MIN(CASE WHEN d."componentId" = 'bcms' AND jsonb_typeof(th."rawPayload") = 'array' THEN
          (SELECT (elem->>'v')::double precision
           FROM jsonb_array_elements(th."rawPayload") elem
           WHERE elem->>'m' = 'ai_min_temp' AND elem->>'v' ~ '^-?[0-9]+(\.[0-9]+)?$' LIMIT 1)
        END) AS "cellTempMin",
        (array_agg(
          CASE WHEN d."componentId" = 'bcms' AND jsonb_typeof(th."rawPayload") = 'array' THEN
            (SELECT (elem->>'v')::integer
             FROM jsonb_array_elements(th."rawPayload") elem
             WHERE elem->>'m' = 'di_rcdhg_stat' AND elem->>'v' ~ '^[0-2]$' LIMIT 1)
          END
          ORDER BY th."timestamp" DESC
        ) FILTER (
          WHERE d."componentId" = 'bcms' AND jsonb_typeof(th."rawPayload") = 'array' AND
          EXISTS (
            SELECT 1 FROM jsonb_array_elements(th."rawPayload") elem
            WHERE elem->>'m' = 'di_rcdhg_stat' AND elem->>'v' ~ '^[0-2]$'
          )
        ))[1] AS "bmsCabinetState"
      ${baseQuery}
      ORDER BY "bucketTimestamp" DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countResult: any = await prisma.$queryRawUnsafe(countQuery);
    const total = countResult[0]?.total || 0;

    const snapshots: any[] = await prisma.$queryRawUnsafe(dataQuery);

    for (const row of snapshots) {
      processReportBatteryStatusRow(row);
      processReportPcsRow(row);
      processReportBmsRow(row);
      processReportTmsRow(row);
    }

    let summary = null;
    if (from || to) {
      const summaryQuery = `
        WITH FirstLastPerBESS AS (
          SELECT 
            d."bessAssetId",
            (array_agg(th."accumChargeEnergy" ORDER BY th."timestamp" ASC) FILTER (WHERE th."accumChargeEnergy" IS NOT NULL))[1] AS first_charge,
            (array_agg(th."accumChargeEnergy" ORDER BY th."timestamp" DESC) FILTER (WHERE th."accumChargeEnergy" IS NOT NULL))[1] AS last_charge,
            (array_agg(th."accumDischargeEnergy" ORDER BY th."timestamp" ASC) FILTER (WHERE th."accumDischargeEnergy" IS NOT NULL))[1] AS first_discharge,
            (array_agg(th."accumDischargeEnergy" ORDER BY th."timestamp" DESC) FILTER (WHERE th."accumDischargeEnergy" IS NOT NULL))[1] AS last_discharge
          FROM "TelemetryHistory" th
          JOIN "Device" d ON th."deviceId" = d."id"
          WHERE ${bessAssetFilter} AND ${timeFilter}
          GROUP BY d."bessAssetId"
        )
        SELECT 
          SUM(last_charge - first_charge) AS "chargeDifference",
          SUM(last_discharge - first_discharge) AS "dischargeDifference"
        FROM FirstLastPerBESS
      `;
      
      const summaryResult: any = await prisma.$queryRawUnsafe(summaryQuery);
      
      const chargeDifference = summaryResult[0]?.chargeDifference != null ? Number(summaryResult[0].chargeDifference) : null;
      const dischargeDifference = summaryResult[0]?.dischargeDifference != null ? Number(summaryResult[0].dischargeDifference) : null;

      summary = {
        chargeDifference,
        dischargeDifference,
      };
    }

    return {
      total,
      snapshots,
      summary
    };
  }
}

export const dynamicReportService = new DynamicReportService();
