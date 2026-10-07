import { Response } from 'express';
import { prisma } from '../db/prisma';
import ExcelJS from 'exceljs';

export class ReportExportService {
  public async generateExcelExport(
    res: Response,
    siteId: string,
    intervalMinutes: number,
    from: Date | undefined,
    to: Date | undefined
  ) {
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      include: { client: true }
    });
    if (!site) {
      throw new Error('Site not found');
    }
    const siteTimezone = site.timezone || 'Asia/Kolkata';

    const bessAssets = await prisma.bESSAsset.findMany({
      where: { siteId },
      orderBy: { name: 'asc' },
    });

    if (bessAssets.length === 0) {
      throw new Error('No BESS assets found for this site.');
    }

    const intervalStr = `${intervalMinutes} minutes`;
    let bessAssetFilter = `d."bessAssetId" IN (SELECT "id" FROM "BESSAsset" WHERE "siteId" = '${siteId}')`;

    let timeFilter = `1=1`;
    if (from) {
      timeFilter += ` AND th."timestamp" >= '${from.toISOString()}'::timestamp`;
    }
    if (to) {
      timeFilter += ` AND th."timestamp" < '${to.toISOString()}'::timestamp`;
    }

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
        (array_agg(th."soh" ORDER BY th."timestamp" DESC) FILTER (WHERE th."soh" IS NOT NULL))[1] AS "soh"
      FROM "TelemetryHistory" th
      JOIN "Device" d ON th."deviceId" = d."id"
      JOIN "BESSAsset" b ON d."bessAssetId" = b."id"
      WHERE ${bessAssetFilter} AND ${timeFilter}
      GROUP BY d."bessAssetId", b."name", b."emuId", date_bin('${intervalStr}'::interval, th."timestamp", '2000-01-01 00:00:00Z')
      ORDER BY date_bin('${intervalStr}'::interval, th."timestamp", '2000-01-01 00:00:00Z') DESC, b."name" ASC
    `;

    // Initialize Excel streaming workbook
    const options = {
      stream: res,
      useStyles: true,
      useSharedStrings: true
    };
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter(options);

    const isMultiBESS = bessAssets.length > 1;

    // Calculate the actual header row index to dynamically set the freeze pane (ySplit)
    // Single-BESS: 6 base metadata rows + 3 single-BESS metadata rows (charge, discharge, blank) + 1 header = 10
    // Multi-BESS: 6 base metadata rows + (4 rows per BESS asset) + 1 header
    const headerRowIndex = isMultiBESS ? 6 + (4 * bessAssets.length) + 1 : 10;

    // ----- SETUP WORKSHEETS -----
    const perBessSheetName = isMultiBESS ? 'Per-BESS Details' : 'Telemetry Report';
    const sheet1 = workbook.addWorksheet(perBessSheetName, {
      views: [{ state: 'frozen', xSplit: isMultiBESS ? 2 : 1, ySplit: headerRowIndex }]
    });

    // Add common metadata header
    const r1 = sheet1.addRow([isMultiBESS ? 'EMS Reports Export (Multi-BESS)' : 'EMS Reports Export']);
    r1.font = { bold: true };
    const r2 = sheet1.addRow(['Client Name:', site.client?.name || 'Unknown Client']);
    const r3 = sheet1.addRow(['Site Name:', site.name]);
    const r4 = sheet1.addRow(['Site Identifier:', site.businessIdentifier || 'N/A']);
    const r5 = sheet1.addRow(['Export Interval:', intervalStr]);
    sheet1.addRow([]); // Blank row 6
    [r2, r3, r4, r5].forEach(row => {
      row.getCell(1).font = { bold: true };
      row.commit();
    });
    r1.commit();

    const sheet1Columns: Partial<ExcelJS.Column>[] = [
      { header: 'Timestamp', key: 'timestamp', width: 22 },
      { header: 'BESS Name', key: 'bessName', width: 20 },
      { header: 'EMU Serial No.', key: 'emuId', width: 20 }
    ];

    sheet1Columns.push(
      { header: 'Grid Side Load (kW)', key: 'gridSideLoad', width: 20 },
      { header: 'Grid Frequency (Hz)', key: 'gridFrequency', width: 22 },
      { header: 'Grid Power Factor', key: 'powerFactor', width: 18 },
      { header: 'Cabinet Meter Power (kW)', key: 'totalPower', width: 25 },
      { header: 'Cabinet Voltage A (V)', key: 'voltageA', width: 22 },
      { header: 'Cabinet Voltage B (V)', key: 'voltageB', width: 22 },
      { header: 'Cabinet Voltage C (V)', key: 'voltageC', width: 22 },
      { header: 'Cabinet Current A (A)', key: 'currentA', width: 22 },
      { header: 'Cabinet Current B (A)', key: 'currentB', width: 22 },
      { header: 'Cabinet Current C (A)', key: 'currentC', width: 22 },
      // Export source: TelemetryHistory.bessFrequency ← pcs.ai_freq
      { header: 'BESS Frequency (Hz)', key: 'bessFrequency', width: 22 },
      { header: 'BESS Power Factor', key: 'bessPowerFactor', width: 22 },
      { header: 'PCS Active Power (kW)', key: 'pcsActivePower', width: 22 },
      { header: 'DC Voltage (V)', key: 'dcVoltage', width: 18 },
      { header: 'PCS Temperature (°C)', key: 'ambientTemp', width: 22 },
      { header: 'SOC (%)', key: 'soc', width: 12 },
      { header: 'SOH (%)', key: 'soh', width: 12 },
      { header: 'BMS Current (A)', key: 'bmsCurrent', width: 18 },
      { header: 'Cell V Max (V)', key: 'cellVMax', width: 18 },
      { header: 'Cell V Min (V)', key: 'cellVMin', width: 18 },
      { header: 'Cell Temp Max (°C)', key: 'cellTempMax', width: 22 },
      { header: 'Today Charge Energy (kWh)', key: 'todayChargeEnergy', width: 25 },
      { header: 'Today Discharge Energy (kWh)', key: 'todayDischargeEnergy', width: 25 },
      { header: 'Accum Charge Energy (kWh)', key: 'accumChargeEnergy', width: 25 },
      { header: 'Accum Discharge Energy (kWh)', key: 'accumDischargeEnergy', width: 25 },
      { header: 'Solar Power (kW)', key: 'solarPower', width: 18 }
    );
    let singleBessRows: any[] | null = null;
    let siteChargeDiff: number | null = null;
    let siteDischargeDiff: number | null = null;

    if (!isMultiBESS) {
      singleBessRows = await prisma.$queryRawUnsafe(dataQuery) as any[];

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

      const chargeDiff = (firstCharge != null && lastCharge != null) ? lastCharge - firstCharge : null;
      const dischargeDiff = (firstDischarge != null && lastDischarge != null) ? lastDischarge - firstDischarge : null;

      const r1 = sheet1.addRow(['Total Charge Difference', chargeDiff]);
      const r2 = sheet1.addRow(['Total Discharge Difference', dischargeDiff]);
      if (chargeDiff != null) r1.getCell(2).numFmt = '0.00 "kWh"';
      if (dischargeDiff != null) r2.getCell(2).numFmt = '0.00 "kWh"';
      r2.commit();
      sheet1.addRow([]).commit();
    } else {
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

      for (const b of boundaries) {
        const cDiff = (b.firstCharge != null && b.lastCharge != null) ? b.lastCharge - b.firstCharge : null;
        const dDiff = (b.firstDischarge != null && b.lastDischarge != null) ? b.lastDischarge - b.firstDischarge : null;

        if (cDiff !== null) siteChargeDiff = (siteChargeDiff ?? 0) + cDiff;
        if (dDiff !== null) siteDischargeDiff = (siteDischargeDiff ?? 0) + dDiff;

        const nameRow = sheet1.addRow([b.bessName]);
        nameRow.font = { bold: true };
        nameRow.commit();
        
        const r1 = sheet1.addRow(['Total Charge Difference', cDiff]);
        const r2 = sheet1.addRow(['Total Discharge Difference', dDiff]);
        if (cDiff != null) r1.getCell(2).numFmt = '0.00 "kWh"';
        if (dDiff != null) r2.getCell(2).numFmt = '0.00 "kWh"';
        r1.commit();
        r2.commit();
        sheet1.addRow([]).commit();
      }
    }

    sheet1.columns = sheet1Columns.map((c) => ({
      key: c.key,
      width: c.width,
    }));

    // Explicitly write and commit the table header row
    const headerRow = sheet1.addRow(sheet1Columns.map((c) => c.header));
    headerRow.font = { bold: true };
    headerRow.commit();
    sheet1.getColumn('timestamp').numFmt = 'dd mmmm yyyy, hh:mm:ss AM/PM';
    ['gridSideLoad', 'totalPower', 'voltageA', 'voltageB', 'voltageC', 'currentA', 'currentB', 'currentC', 'pcsActivePower', 'dcVoltage', 'ambientTemp', 'soc', 'soh', 'bmsCurrent', 'cellVMax', 'cellVMin', 'cellTempMax', 'todayChargeEnergy', 'todayDischargeEnergy', 'accumChargeEnergy', 'accumDischargeEnergy', 'solarPower'].forEach(key => {
      sheet1.getColumn(key).numFmt = '0.0';
    });
    sheet1.getColumn('powerFactor').numFmt = '0.00';
    sheet1.getColumn('bessPowerFactor').numFmt = '0.00';
    sheet1.getColumn('gridFrequency').numFmt = '0.00';
    sheet1.getColumn('bessFrequency').numFmt = '0.00';

    let sheet2: ExcelJS.Worksheet | null = null;
    if (isMultiBESS) {
      sheet2 = workbook.addWorksheet('Site Summary', {
        views: [{ state: 'frozen', xSplit: 1, ySplit: 11 }]
      });

      const sr1_meta = sheet2.addRow(['EMS Site Summary']);
      sr1_meta.font = { bold: true };
      const sr2_meta = sheet2.addRow(['Client Name:', site.client?.name || 'Unknown Client']);
      const sr3_meta = sheet2.addRow(['Site Name:', site.name]);
      const sr4_meta = sheet2.addRow(['Site Identifier:', site.businessIdentifier || 'N/A']);
      const sr5_meta = sheet2.addRow(['Export Interval:', intervalStr]);
      sheet2.addRow([]); // Blank row 6
      [sr2_meta, sr3_meta, sr4_meta, sr5_meta].forEach(row => {
        row.getCell(1).font = { bold: true };
        row.commit();
      });
      sr1_meta.commit();

      // Construct columns for sheet 2
      const s2Cols: Partial<ExcelJS.Column>[] = [
        { key: 'timestamp', width: 22 },
        { key: 'gridPower', width: 22 },
        { key: 'bessPower', width: 22 },
        { key: 'solarPower', width: 22 },
        { key: 'todayCharge', width: 25 },
        { key: 'todayDischarge', width: 25 },
        { key: 'soc', width: 18 },
        { key: 'soh', width: 18 },
        { key: 'pcsTemp', width: 25 }
      ];

      for (let i = 0; i < bessAssets.length; i++) {
        s2Cols.push({ key: `dcVoltage_${i}`, width: 18 });
      }
      for (let i = 0; i < bessAssets.length; i++) {
        s2Cols.push({ key: `phaseAVoltage_${i}`, width: 18 });
        s2Cols.push({ key: `phaseACurrent_${i}`, width: 18 });
        s2Cols.push({ key: `phaseBVoltage_${i}`, width: 18 });
        s2Cols.push({ key: `phaseBCurrent_${i}`, width: 18 });
        s2Cols.push({ key: `phaseCVoltage_${i}`, width: 18 });
        s2Cols.push({ key: `phaseCCurrent_${i}`, width: 18 });
      }
      for (let i = 0; i < bessAssets.length; i++) {
        s2Cols.push({ key: `gridFrequency_${i}`, width: 18 });
      }

      sheet2.columns = s2Cols;

      const sr1 = sheet2.addRow(['Total Charge Difference', siteChargeDiff]);
      const sr2 = sheet2.addRow(['Total Discharge Difference', siteDischargeDiff]);
      if (siteChargeDiff != null) sr1.getCell(2).numFmt = '0.00 "kWh"';
      if (siteDischargeDiff != null) sr2.getCell(2).numFmt = '0.00 "kWh"';
      sr1.commit();
      sr2.commit();
      sheet2.addRow([]).commit();

      // Build Row 4 (Merged headers) and Row 5 (Sub-headers)
      const row1 = ['Timestamp', 'Total Grid Power (kW)', 'Total BESS Power (kW)', 'Total Solar Power (kW)', 'Total Today Charge (kWh)', 'Total Today Discharge (kWh)', 'Average SOC (%)', 'Average SOH (%)', 'Max PCS Temperature (°C)'];
      const row2 = ['Timestamp', 'Total Grid Power (kW)', 'Total BESS Power (kW)', 'Total Solar Power (kW)', 'Total Today Charge (kWh)', 'Total Today Discharge (kWh)', 'Average SOC (%)', 'Average SOH (%)', 'Max PCS Temperature (°C)'];

      // DC Voltage
      const dcVoltStart = 10;
      row1.push('DC Voltage (V)');
      row2.push(bessAssets[0].name);
      for (let i = 1; i < bessAssets.length; i++) {
        row1.push('');
        row2.push(bessAssets[i].name);
      }

      // Phase Metrics (Grouped by BESS Name)
      const phaseMetricsStart = dcVoltStart + bessAssets.length;
      for (let i = 0; i < bessAssets.length; i++) {
        row1.push(bessAssets[i].name, '', '', '', '', '');
        row2.push(
          'Phase A Voltage (V)', 'Phase A Current (A)',
          'Phase B Voltage (V)', 'Phase B Current (A)',
          'Phase C Voltage (V)', 'Phase C Current (A)'
        );
      }

      // Grid Frequency
      const gridFreqStart = phaseMetricsStart + (bessAssets.length * 6);
      row1.push('Grid Frequency (Hz)');
      row2.push(bessAssets[0].name);
      for (let i = 1; i < bessAssets.length; i++) {
        row1.push('');
        row2.push(bessAssets[i].name);
      }

      const r1 = sheet2.addRow(row1); // This will be row 4
      const r2 = sheet2.addRow(row2); // This will be row 5

      // Merge cells in row 10 (was 4, shifted by 6 metadata rows)
      if (bessAssets.length > 1) {
        sheet2.mergeCells(10, dcVoltStart, 10, dcVoltStart + bessAssets.length - 1);
        sheet2.mergeCells(10, gridFreqStart, 10, gridFreqStart + bessAssets.length - 1);
      }
      // Always merge phase metrics per BESS, even if only 1 BESS exists (though this is multi-BESS specific)
      for (let i = 0; i < bessAssets.length; i++) {
        const start = phaseMetricsStart + (i * 6);
        sheet2.mergeCells(10, start, 10, start + 5);
      }

      r1.font = { bold: true };
      r1.alignment = { horizontal: 'center' };
      r2.font = { bold: true };

      r1.commit();
      r2.commit();

      sheet2.getColumn('timestamp').numFmt = 'dd mmmm yyyy, hh:mm:ss AM/PM';
      for (let i = 2; i <= s2Cols.length; i++) {
        const col = sheet2.getColumn(i);
        if (col.key && col.key.startsWith('gridFrequency_')) {
          col.numFmt = '0.00';
        } else {
          col.numFmt = '0.0';
        }
      }
    }

    // Process data in chunks to prevent huge memory spikes
    let offset = 0;
    const limit = 5000;
    let hasMore = true;

    // Site summary buffer
    let currentBucketTimestamp: Date | null = null;
    let currentBucketRows: any[] = [];

    const flushSummary = (rows: any[]) => {
      if (!sheet2 || rows.length === 0) return;

      let sumGrid = 0; let countGrid = 0;
      let sumBess = 0; let countBess = 0;
      let sumSolar = 0; let countSolar = 0;
      let sumCharge = 0; let countCharge = 0;
      let sumDischarge = 0; let countDischarge = 0;
      let sumSoc = 0; let countSoc = 0;
      let sumSoh = 0; let countSoh = 0;
      let maxTemp = -Infinity; let countTemp = 0;

      const voltMap: any = {};

      rows.forEach(r => {
        if (r.gridSideLoad != null) { sumGrid += r.gridSideLoad; countGrid++; }
        if (r.pcsActivePower != null) { sumBess += r.pcsActivePower; countBess++; }
        if (r.solarPower != null) { sumSolar += r.solarPower; countSolar++; }
        if (r.todayChargeEnergy != null) { sumCharge += r.todayChargeEnergy; countCharge++; }
        if (r.todayDischargeEnergy != null) { sumDischarge += r.todayDischargeEnergy; countDischarge++; }
        if (r.soc != null) { sumSoc += r.soc; countSoc++; }
        if (r.soh != null) { sumSoh += r.soh; countSoh++; }
        if (r.ambientTemp != null) {
          if (r.ambientTemp > maxTemp) maxTemp = r.ambientTemp;
          countTemp++;
        }
        
        voltMap[r.bessAssetId] = {
          dcVoltage: r.dcVoltage,
          voltageA: r.voltageA,
          currentA: r.currentA,
          voltageB: r.voltageB,
          currentB: r.currentB,
          voltageC: r.voltageC,
          currentC: r.currentC,
          gridFrequency: r.gridFrequency
        };
      });

      const s2Row: any = {
        timestamp: currentBucketTimestamp,
        gridPower: countGrid > 0 ? sumGrid : null,
        bessPower: countBess > 0 ? sumBess : null,
        solarPower: countSolar > 0 ? sumSolar : null,
        todayCharge: countCharge > 0 ? sumCharge : null,
        todayDischarge: countDischarge > 0 ? sumDischarge : null,
        soc: countSoc > 0 ? (sumSoc / countSoc) : null,
        soh: countSoh > 0 ? (sumSoh / countSoh) : null,
        pcsTemp: countTemp > 0 ? maxTemp : null,
      };

      for (let i = 0; i < bessAssets.length; i++) {
        const bess = bessAssets[i];
        const vals = voltMap[bess.id];
        s2Row[`dcVoltage_${i}`] = vals && vals.dcVoltage != null ? vals.dcVoltage : null;
        s2Row[`phaseAVoltage_${i}`] = vals && vals.voltageA != null ? vals.voltageA : null;
        s2Row[`phaseACurrent_${i}`] = vals && vals.currentA != null ? vals.currentA : null;
        s2Row[`phaseBVoltage_${i}`] = vals && vals.voltageB != null ? vals.voltageB : null;
        s2Row[`phaseBCurrent_${i}`] = vals && vals.currentB != null ? vals.currentB : null;
        s2Row[`phaseCVoltage_${i}`] = vals && vals.voltageC != null ? vals.voltageC : null;
        s2Row[`phaseCCurrent_${i}`] = vals && vals.currentC != null ? vals.currentC : null;
        s2Row[`gridFrequency_${i}`] = vals && vals.gridFrequency != null ? vals.gridFrequency : null;
      }

      sheet2.addRow(s2Row).commit();
    };

    while (hasMore) {
      let chunk: any[];
      if (singleBessRows) {
        chunk = singleBessRows.slice(offset, offset + limit);
      } else {
        const pagedQuery = `${dataQuery} LIMIT ${limit} OFFSET ${offset}`;
        chunk = await prisma.$queryRawUnsafe(pagedQuery);
      }

      for (const row of chunk) {
        const bucketTime = new Date(row.bucketTimestamp);
        // Format the UTC date to the site's local time components
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: siteTimezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hourCycle: 'h23',
        });

        const parts = formatter.formatToParts(bucketTime);
        const partMap: Record<string, string> = {};
        for (const p of parts) partMap[p.type] = p.value;

        // Create a JS Date that reflects these local components in the server's local environment.
        // ExcelJS will read its .getFullYear(), .getHours(), etc. and write exactly those to the XLSX cell.
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
          gridSideLoad: row.gridSideLoad != null ? row.gridSideLoad : null,
          gridFrequency: row.gridFrequency != null ? row.gridFrequency : null,
          powerFactor: row.powerFactor != null ? row.powerFactor : null,
          totalPower: row.totalPower != null ? row.totalPower : null,
          voltageA: row.voltageA != null ? row.voltageA : null,
          voltageB: row.voltageB != null ? row.voltageB : null,
          voltageC: row.voltageC != null ? row.voltageC : null,
          currentA: row.currentA != null ? row.currentA : null,
          currentB: row.currentB != null ? row.currentB : null,
          currentC: row.currentC != null ? row.currentC : null,
          bessFrequency: row.bessFrequency != null ? row.bessFrequency : null,
          bessPowerFactor: row.bessPowerFactor != null ? row.bessPowerFactor : null,
          pcsActivePower: row.pcsActivePower != null ? row.pcsActivePower : null,
          dcVoltage: row.dcVoltage != null ? row.dcVoltage : null,
          ambientTemp: row.ambientTemp != null ? row.ambientTemp : null,
          soc: row.soc != null ? row.soc : null,
          soh: row.soh != null ? row.soh : null,
          bmsCurrent: row.bmsCurrent != null ? row.bmsCurrent : null,
          cellVMax: row.cellVMax != null ? row.cellVMax : null,
          cellVMin: row.cellVMin != null ? row.cellVMin : null,
          cellTempMax: row.cellTempMax != null ? row.cellTempMax : null,
          todayChargeEnergy: row.todayChargeEnergy != null ? row.todayChargeEnergy : null,
          todayDischargeEnergy: row.todayDischargeEnergy != null ? row.todayDischargeEnergy : null,
          accumChargeEnergy: row.accumChargeEnergy != null ? row.accumChargeEnergy : null,
          accumDischargeEnergy: row.accumDischargeEnergy != null ? row.accumDischargeEnergy : null,
          solarPower: row.solarPower != null ? row.solarPower : null,
        };

        sheet1.addRow(s1Row).commit();

        if (isMultiBESS) {
          const rowTimeStr = shiftedTime.getTime();
          if (currentBucketTimestamp && currentBucketTimestamp.getTime() !== rowTimeStr) {
            flushSummary(currentBucketRows);
            currentBucketRows = [];
          }
          currentBucketTimestamp = shiftedTime;
          currentBucketRows.push(row);
        }
      }

      if (chunk.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }

    if (isMultiBESS && currentBucketRows.length > 0) {
      flushSummary(currentBucketRows);
    }

    sheet1.commit();
    if (sheet2) sheet2.commit();
    await workbook.commit();
  }

  public async exportVoltageTrend(
    res: Response,
    bessAssetId: string,
    from: Date | undefined,
    to: Date | undefined
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
      ORDER BY th."timestamp" ASC
    `;

    const options = { stream: res, useStyles: true, useSharedStrings: true };
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter(options);
    const sheet1 = workbook.addWorksheet('Voltage Trend', { views: [{ state: 'frozen', xSplit: 0, ySplit: 11 }] });

    const r1 = sheet1.addRow(['Voltage Trend Report']);
    r1.font = { bold: true };
    const r2 = sheet1.addRow(['Client Name:', bessAsset.site?.client?.name || 'Unknown Client']);
    const r3 = sheet1.addRow(['Site Name:', bessAsset.site?.name || 'Unknown Site']);
    const r4 = sheet1.addRow(['Site Identifier:', bessAsset.site?.businessIdentifier || 'N/A']);
    const r5 = sheet1.addRow(['BESS Asset:', bessAsset.name]);
    const r6 = sheet1.addRow(['BESS Identifier:', bessAsset.assetIdentifier || 'N/A']);
    const r7 = sheet1.addRow(['EMU Serial No.:', bessAsset.emuId || 'N/A']);
    const r8 = sheet1.addRow(['BESS Model:', bessAsset.model || 'N/A']);
    const r9 = sheet1.addRow(['Energy Capacity:', bessAsset.energyCapacity != null ? bessAsset.energyCapacity + ' kWh' : 'N/A']);
    const r10 = sheet1.addRow(['Power Rating:', bessAsset.powerRating != null ? bessAsset.powerRating + ' kW' : 'N/A']);
    sheet1.addRow([]); // Blank row 11
    
    [r2, r3, r4, r5, r6, r7, r8, r9, r10].forEach(row => {
      row.getCell(1).font = { bold: true };
      row.commit();
    });
    r1.commit();

    const sheet1Columns: Partial<ExcelJS.Column>[] = [
      { header: 'Time', key: 'timestamp', width: 22 },
      { header: 'BESS Asset', key: 'bessAsset', width: 20 },
      { header: 'EMU Serial No.', key: 'emuId', width: 20 },
      { header: 'Grid Uab (V)', key: 'gridUab', width: 18 },
      { header: 'Grid Ubc (V)', key: 'gridUbc', width: 18 },
      { header: 'Grid Uca (V)', key: 'gridUca', width: 18 },
      { header: 'BESS Ua (V)', key: 'bessUa', width: 18 },
      { header: 'BESS Ub (V)', key: 'bessUb', width: 18 },
      { header: 'BESS Uc (V)', key: 'bessUc', width: 18 },
    ];
    sheet1.columns = sheet1Columns.map((c) => ({ key: c.key, width: c.width }));
    const headerRow = sheet1.addRow(sheet1Columns.map((c) => c.header));
    headerRow.font = { bold: true };
    headerRow.commit();
    sheet1.getColumn('timestamp').numFmt = 'dd mmmm yyyy, hh:mm:ss.000 AM/PM';

    let offset = 0;
    const limit = 5000;
    let hasMore = true;

    while (hasMore) {
      const chunkQuery = `${dataQuery} LIMIT ${limit} OFFSET ${offset}`;
      const chunk = await prisma.$queryRawUnsafe(chunkQuery) as any[];

      for (const row of chunk) {
        const bucketTime = row.timestamp as Date;
        const ms = bucketTime.getUTCMilliseconds();
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: siteTimezone,
          year: 'numeric',
          month: 'numeric',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hourCycle: 'h23',
        });

        const parts = formatter.formatToParts(bucketTime);
        const partMap: Record<string, string> = {};
        for (const p of parts) partMap[p.type] = p.value;

        const shiftedTime = new Date(Date.UTC(
          parseInt(partMap.year, 10),
          parseInt(partMap.month, 10) - 1,
          parseInt(partMap.day, 10),
          parseInt(partMap.hour, 10),
          parseInt(partMap.minute, 10),
          parseInt(partMap.second, 10),
          ms
        ));

        const isGridActive = row.gridOnState === 1;
        const isBessActive = row.gridOnState === 0 && row.gridOffState === 1;

        let exportGridUab = row.gridVoltageUab;
        let exportGridUbc = row.gridVoltageUbc;
        let exportGridUca = row.gridVoltageUca;
        let exportBessUa = row.bessVoltageUa;
        let exportBessUb = row.bessVoltageUb;
        let exportBessUc = row.bessVoltageUc;

        if (isGridActive) {
          exportBessUa = 0;
          exportBessUb = 0;
          exportBessUc = 0;
        } else if (isBessActive) {
          exportGridUab = 0;
          exportGridUbc = 0;
          exportGridUca = 0;
        }

        sheet1.addRow({
          timestamp: shiftedTime,
          bessAsset: bessAsset.name,
          emuId: row.emuId,
          gridUab: exportGridUab,
          gridUbc: exportGridUbc,
          gridUca: exportGridUca,
          bessUa: exportBessUa,
          bessUb: exportBessUb,
          bessUc: exportBessUc
        }).commit();
      }

      if (chunk.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }

    sheet1.commit();
    await workbook.commit();
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

    const options = { stream: res, useStyles: true, useSharedStrings: true };
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter(options);
    const sheet1 = workbook.addWorksheet('Grid State Trend', { views: [{ state: 'frozen', xSplit: 0, ySplit: 11 }] });

    const r1 = sheet1.addRow(['Grid State Trend Report']);
    r1.font = { bold: true };
    const r2 = sheet1.addRow(['Client Name:', bessAsset.site?.client?.name || 'Unknown Client']);
    const r3 = sheet1.addRow(['Site Name:', bessAsset.site?.name || 'Unknown Site']);
    const r4 = sheet1.addRow(['Site Identifier:', bessAsset.site?.businessIdentifier || 'N/A']);
    const r5 = sheet1.addRow(['BESS Asset:', bessAsset.name]);
    const r6 = sheet1.addRow(['BESS Identifier:', bessAsset.assetIdentifier || 'N/A']);
    const r7 = sheet1.addRow(['EMU Serial No.:', bessAsset.emuId || 'N/A']);
    const r8 = sheet1.addRow(['BESS Model:', bessAsset.model || 'N/A']);
    const r9 = sheet1.addRow(['Energy Capacity:', bessAsset.energyCapacity != null ? bessAsset.energyCapacity + ' kWh' : 'N/A']);
    const r10 = sheet1.addRow(['Power Rating:', bessAsset.powerRating != null ? bessAsset.powerRating + ' kW' : 'N/A']);
    sheet1.addRow([]); // Blank row 11
    
    [r2, r3, r4, r5, r6, r7, r8, r9, r10].forEach(row => {
      row.getCell(1).font = { bold: true };
      row.commit();
    });
    r1.commit();

    const sheet1Columns: Partial<ExcelJS.Column>[] = [
      { header: 'Time', key: 'timestamp', width: 22 },
      { header: 'BESS Asset', key: 'bessAsset', width: 20 },
      { header: 'EMU Serial No.', key: 'emuId', width: 20 },
      { header: 'Grid ON State', key: 'gridOnState', width: 18 },
      { header: 'Grid OFF State', key: 'gridOffState', width: 18 },
    ];
    sheet1.columns = sheet1Columns.map((c) => ({ key: c.key, width: c.width }));
    const headerRow = sheet1.addRow(sheet1Columns.map((c) => c.header));
    headerRow.font = { bold: true };
    headerRow.commit();
    sheet1.getColumn('timestamp').numFmt = 'dd mmmm yyyy, hh:mm:ss.000 AM/PM';

    let offset = 0;
    const limit = 5000;
    let hasMore = true;

    while (hasMore) {
      const chunkQuery = `${dataQuery} LIMIT ${limit} OFFSET ${offset}`;
      const chunk = await prisma.$queryRawUnsafe(chunkQuery) as any[];

      for (const row of chunk) {
        const bucketTime = row.timestamp as Date;
        const ms = bucketTime.getUTCMilliseconds();
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: siteTimezone,
          year: 'numeric',
          month: 'numeric',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hourCycle: 'h23',
        });

        const parts = formatter.formatToParts(bucketTime);
        const partMap: Record<string, string> = {};
        for (const p of parts) partMap[p.type] = p.value;

        const shiftedTime = new Date(Date.UTC(
          parseInt(partMap.year, 10),
          parseInt(partMap.month, 10) - 1,
          parseInt(partMap.day, 10),
          parseInt(partMap.hour, 10),
          parseInt(partMap.minute, 10),
          parseInt(partMap.second, 10),
          ms
        ));

        sheet1.addRow({
          timestamp: shiftedTime,
          bessAsset: bessAsset.name,
          emuId: row.emuId,
          gridOnState: row.gridOnState,
          gridOffState: row.gridOffState
        }).commit();
      }

      if (chunk.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }

    sheet1.commit();
    await workbook.commit();
  }
}
export const reportExportService = new ReportExportService();

