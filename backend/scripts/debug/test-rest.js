const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const latestRows = await Promise.all(
      ['pcs', 'pmg', 'rjl', 'bcms'].map(cid =>
        prisma.device.findFirst({ where: { componentId: cid } }).then(d =>
          d ? prisma.telemetryHistory.findFirst({ where: { deviceId: d.id }, orderBy: { timestamp: 'desc' } }).then(row => ({ ...row, device: d })) : null
        )
      )
    );
    console.log(JSON.stringify(latestRows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}
run();
