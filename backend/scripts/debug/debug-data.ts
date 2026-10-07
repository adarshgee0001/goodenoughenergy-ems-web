import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();



if (process.env.NODE_ENV === "production" || process.env.DATABASE_URL?.includes("ems?schema")) {
  throw new Error("This script cannot run against a production environment.");
}

async function debugData() {
  const testBess = await prisma.bESSAsset.findUnique({
    where: { id: 'c4ed25cf-0758-4a2e-aae5-91712982a29a' },
    include: { site: true }
  });
  console.log('Test BESS:', testBess?.id, 'Site:', testBess?.siteId, 'Client:', testBess?.site?.clientId);

  if (testBess?.site?.clientId) {
      const clientAUser = await prisma.user.findFirst({
          where: { clientAccess: { some: { clientId: testBess.site.clientId } } }
      });
      console.log('ClientA User:', clientAUser?.id, clientAUser?.email, clientAUser?.role);
  }

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  console.log('Admin:', admin?.id, admin?.email);

  if (testBess?.site?.clientId) {
      const siteB = await prisma.site.findFirst({
          where: { clientId: { not: testBess.site.clientId } },
          include: { bessAssets: true }
      });
      console.log('SiteB:', siteB?.id, 'ClientB:', siteB?.clientId);
  }
}

debugData().finally(() => prisma.$disconnect());
