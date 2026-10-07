const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("--- START DB AUDIT ---");
  
  // 1. Table Sizes
  const sizeQuery = await prisma.$queryRaw`
    SELECT pg_class.relname as table_name,
           pg_size_pretty(pg_total_relation_size(pg_class.oid)) as total_size,
           pg_size_pretty(pg_relation_size(pg_class.oid)) as data_size,
           pg_size_pretty(pg_indexes_size(pg_class.oid)) as index_size,
           pg_stat_user_tables.n_live_tup as row_count
    FROM pg_catalog.pg_stat_user_tables
    JOIN pg_class ON pg_class.oid = pg_stat_user_tables.relid
    WHERE pg_stat_user_tables.schemaname = 'public'
    ORDER BY pg_total_relation_size(pg_class.oid) DESC;
  `;
  console.log("TABLE SIZES:");
  console.log(JSON.stringify(sizeQuery, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));

  // 2. Telemetry History Stats
  const telStats = await prisma.telemetryHistory.aggregate({
    _count: true,
    _min: { timestamp: true },
    _max: { timestamp: true }
  });
  console.log("TELEMETRY STATS:");
  console.log(telStats);

  // 3. Snapshot Stats
  const snapStats = await prisma.telemetrySnapshot15m.aggregate({
    _count: true,
    _min: { bucketTimestamp: true },
    _max: { bucketTimestamp: true }
  });
  console.log("SNAPSHOT STATS:");
  console.log(snapStats);

  // 4. Alarm Stats
  const alarmStats = await prisma.alarm.aggregate({
    _count: true,
    _min: { timestamp: true },
    _max: { timestamp: true }
  });
  console.log("ALARM STATS:");
  console.log(alarmStats);

  // 5. Largest BESS & Device (Approximate by grouping telemetry if safe, but we'll use device counts)
  const deviceCounts = await prisma.telemetryHistory.groupBy({
    by: ['deviceId'],
    _count: true,
    orderBy: { _count: { deviceId: 'desc' } },
    take: 5
  });
  console.log("TOP DEVICES BY TELEMETRY:");
  console.log(deviceCounts);

  // Find Device Types and BESS mappings for top devices
  const deviceIds = deviceCounts.map(d => d.deviceId);
  const devices = await prisma.device.findMany({
    where: { id: { in: deviceIds } },
    select: { id: true, type: true, bessAssetId: true }
  });
  console.log("TOP DEVICE DETAILS:");
  console.log(devices);

  console.log("--- END DB AUDIT ---");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
