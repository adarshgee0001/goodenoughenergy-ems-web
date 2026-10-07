import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  const devices = await prisma.device.findMany({
    include: { bessAsset: { include: { site: { include: { client: true } } } } }
  });
  
  const bessAssets = await prisma.bESSAsset.findMany();
  
  console.log(`Total Devices: ${devices.length}`);
  console.log(`Total BESS Assets: ${bessAssets.length}`);
  
  let conflicts = 0;
  
  const bessEmuMap = new Map();
  for (const d of devices) {
    if (!d.emuId) {
      console.log(`Device missing emuId: ${d.id}`);
      conflicts++;
      continue;
    }
    
    if (!bessEmuMap.has(d.bessAssetId)) {
      bessEmuMap.set(d.bessAssetId, new Set());
    }
    bessEmuMap.get(d.bessAssetId).add(d.emuId);
  }
  
  for (const [bessId, emus] of bessEmuMap.entries()) {
    if (emus.size > 1) {
      console.log(`BESS ${bessId} has multiple emuIds:`, Array.from(emus));
      conflicts++;
    }
  }
  
  const emuBessMap = new Map();
  for (const d of devices) {
    if (!d.emuId) continue;
    if (!emuBessMap.has(d.emuId)) {
      emuBessMap.set(d.emuId, new Set());
    }
    emuBessMap.get(d.emuId).add(d.bessAssetId);
  }
  
  for (const [emuId, besses] of emuBessMap.entries()) {
    if (besses.size > 1) {
      console.log(`EMU ID ${emuId} is mapped to multiple BESS Assets:`, Array.from(besses));
      conflicts++;
    }
  }
  
  console.log(`Total Conflicts: ${conflicts}`);
  await prisma.$disconnect();
}

check().catch(console.error);
