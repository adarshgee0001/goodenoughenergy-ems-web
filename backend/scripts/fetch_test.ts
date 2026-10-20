import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const records = await prisma.telemetryHistory.findMany({ 
    take: 10, 
    orderBy: { timestamp: 'desc' },
    include: { device: true }
  });
  console.log(JSON.stringify(records, null, 2));
}

main().finally(() => prisma.$disconnect());
