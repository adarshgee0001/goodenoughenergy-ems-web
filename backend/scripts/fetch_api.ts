import fs from 'fs';
import path from 'path';
const ExcelJS = require('exceljs');

async function main() {
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@gee.local', password: 'admin@321' })
  });
  const cookie = loginRes.headers.get('set-cookie');

  const assetId = '370e7642-359e-4206-9343-7e68e37d6c82';
  const start = '2026-10-10T03:25:00.000Z';
  const end = '2026-10-10T03:35:00.000Z';

  // Test Excel Export
  const url = `http://localhost:5000/api/bess/${assetId}/voltage-trend/export?from=${start}&to=${end}`;
  const res = await fetch(url, { headers: { 'Cookie': cookie || '' } });
  
  const destPath = path.join(__dirname, 'test-export.xlsx');
  const buffer = await res.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buffer));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(destPath);
  const sheet = workbook.getWorksheet('Voltage Trend');
  
  let targetRows: any[] = [];
  
  sheet.eachRow((row: any, rowNumber: number) => {
    if (rowNumber < 13) return; // Skip headers
    if (targetRows.length < 15) {
      targetRows.push({
        ts: row.getCell(1).text || row.getCell(1).value?.toString(),
        source: row.getCell(4).text,
        gUab: row.getCell(5).text,
        bUa: row.getCell(8).text,
        rawGUab: row.getCell(11).text,
        rawBUa: row.getCell(14).text
      });
    }
  });

  console.table(targetRows);
}
main().catch(console.error);
