import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting migration validation for EMU ID ownership...');

  const devices = await prisma.device.findMany({
    where: { emuId: { not: null } },
    include: {
      bessAsset: {
        include: {
          site: {
            include: {
              client: true
            }
          }
        }
      }
    }
  });

  const emuToBessMap = new Map<string, Set<string>>();
  const bessToEmuMap = new Map<string, Set<string>>();

  for (const device of devices) {
    if (!device.emuId) continue;
    
    if (!emuToBessMap.has(device.emuId)) {
      emuToBessMap.set(device.emuId, new Set());
    }
    emuToBessMap.get(device.emuId)!.add(device.bessAssetId);

    if (!bessToEmuMap.has(device.bessAssetId)) {
      bessToEmuMap.set(device.bessAssetId, new Set());
    }
    bessToEmuMap.get(device.bessAssetId)!.add(device.emuId);
  }

  const conflicts: any[] = [];

  // Check 1: Same emuId on multiple BESSAssets
  for (const [emuId, bessIds] of emuToBessMap.entries()) {
    if (bessIds.size > 1) {
      const conflictingDevices = devices.filter(d => d.emuId === emuId);
      conflicts.push({
        type: 'Same emuId on multiple BESSAssets',
        emuId,
        details: conflictingDevices.map(d => ({
          bessAssetId: d.bessAssetId,
          siteId: d.bessAsset.siteId,
          clientId: d.bessAsset.site.clientId,
          deviceId: d.id,
          componentId: d.componentId
        }))
      });
    }
  }

  // Check 2: Same BESSAsset containing different emuIds
  for (const [bessId, emuIds] of bessToEmuMap.entries()) {
    if (emuIds.size > 1) {
      const conflictingDevices = devices.filter(d => d.bessAssetId === bessId);
      conflicts.push({
        type: 'Same BESSAsset containing different emuIds',
        bessAssetId: bessId,
        emuIds: Array.from(emuIds),
        details: conflictingDevices.map(d => ({
          emuId: d.emuId,
          siteId: d.bessAsset.siteId,
          clientId: d.bessAsset.site.clientId,
          deviceId: d.id,
          componentId: d.componentId
        }))
      });
    }
  }

  if (conflicts.length > 0) {
    console.error('CRITICAL: Migration validation failed with conflicts!');
    console.error(JSON.stringify(conflicts, null, 2));
    process.exit(1);
  }

  console.log('Migration validation passed. No conflicts detected.');
  
  // Create a raw SQL migration script output that the Prisma migration can use, or just do it here if we use a seed script approach.
  // Actually, we will just use Prisma migration to alter the table, and we can run a raw SQL query inside the migration if needed.
  // But wait, the prompt asked to run Prisma migration. 
  // We can just rely on the standard Prisma migration if there are no conflicts. 
  
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
