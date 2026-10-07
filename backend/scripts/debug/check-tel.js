const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const tel = await prisma.telemetryHistory.findMany({
    where: { device: { componentId: 'bcms' } },
    orderBy: { timestamp: 'desc' },
    take: 10
  });
  console.log(JSON.stringify(tel.map(t => ({ ts: t.timestamp, soc: t.soc, soh: t.soh, raw: t.rawPayload })), null, 2));
  await prisma.$disconnect();
}
run();
