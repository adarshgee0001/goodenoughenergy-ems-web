import { prisma } from '../db/prisma';

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
    const intervalStr = `${intervalMinutes} minutes`;
    
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
      GROUP BY d."bessAssetId", b."emuId", date_bin('${intervalStr}'::interval, th."timestamp", '2000-01-01 00:00:00Z')
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
        (array_agg(th."soh" ORDER BY th."timestamp" DESC) FILTER (WHERE th."soh" IS NOT NULL))[1] AS "soh"
      ${baseQuery}
      ORDER BY "bucketTimestamp" DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countResult: any = await prisma.$queryRawUnsafe(countQuery);
    const total = countResult[0]?.total || 0;

    const snapshots: any[] = await prisma.$queryRawUnsafe(dataQuery);

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
