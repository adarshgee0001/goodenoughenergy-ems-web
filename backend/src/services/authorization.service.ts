import { Role } from '@prisma/client';

import { prisma as globalPrisma } from '../db/prisma';

export let prisma = globalPrisma as any;
export const setMockPrisma = (mock: any) => { prisma = mock; };

export const authorizationService = {
  /**
   * Determines if a user can access a specific client.
   * Fails closed on errors or unknown roles.
   */
  async canAccessClient(
    userId: string,
    role: Role | string,
    targetClientId: string
  ): Promise<boolean> {
    try {
      // 1. Missing Client ID validation
      if (!targetClientId || targetClientId.trim() === '') {
        return false;
      }

      // 2. ADMIN has global access
      if (role === 'ADMIN') {
        return true;
      }

      // 3. CLIENT and DISTRIBUTOR require explicit assignment
      if (role === 'CLIENT' || role === 'DISTRIBUTOR') {
        const accessRecord = await prisma.userClientAccess.findFirst({
          where: {
            userId: userId,
            clientId: targetClientId,
          },
        });
        
        return !!accessRecord;
      }

      // 4. Unknown role
      return false;
    } catch (error) {
      console.error('[Authorization Service] Error:', error);
      // 5. Database errors fail closed
      return false;
    }
  }
};
