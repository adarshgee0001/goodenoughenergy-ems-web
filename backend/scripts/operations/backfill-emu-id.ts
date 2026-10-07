import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Backfilling BESSAsset.emuId from Device.emuId...');

  const devices = await prisma.device.findMany({
    where: { emuId: { not: null } }
  });

  let backfilled = 0;
  for (const device of devices) {
    if (!device.emuId) continue;
    
    // Check if the BESSAsset already has an emuId
    const bess = await prisma.bESSAsset.findUnique({
      where: { id: device.bessAssetId }
    });

    if (bess && !bess.emuId) {
      await prisma.bESSAsset.update({
        where: { id: bess.id },
        data: { emuId: device.emuId }
      });
      console.log(`Backfilled BESSAsset ${bess.id} with emuId ${device.emuId}`);
      backfilled++;
    }
  }

  console.log(`Successfully backfilled ${backfilled} BESSAssets.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
