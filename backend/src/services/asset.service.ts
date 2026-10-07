
import { prisma as globalPrisma } from '../db/prisma';

export let prisma = globalPrisma as any;
export const setMockPrisma = (mock: any) => { prisma = mock; };

export const assetService = {
  async resolveSiteOwnership(siteId: string): Promise<string | null> {
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { clientId: true }
    });
    return site ? site.clientId : null;
  },

  async resolveBessOwnership(bessId: string): Promise<string | null> {
    const bess = await prisma.bESSAsset.findUnique({
      where: { id: bessId },
      select: { site: { select: { clientId: true } } }
    });
    return bess ? bess.site.clientId : null;
  },

  async resolveDeviceOwnership(deviceId: string): Promise<string | null> {
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      select: { bessAsset: { select: { site: { select: { clientId: true } } } } }
    });
    return device ? device.bessAsset.site.clientId : null;
  }
};
