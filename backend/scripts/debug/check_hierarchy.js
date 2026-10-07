const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const clients = await prisma.client.findMany({
      include: {
        sites: {
          include: {
            bessAssets: {
              include: {
                devices: true,
                _count: {
                  select: { telemetrySnapshots: true }
                }
              }
            }
          }
        }
      }
    });
    
    console.log(JSON.stringify(clients, null, 2));

    const devices = await prisma.device.findMany({
      include: {
        _count: { select: { telemetry: true, alarms: true } }
      }
    });
    console.log("Devices with telemetry count:");
    console.log(JSON.stringify(devices.map(d => ({ id: d.id, comp: d.componentId, telCount: d._count.telemetry })), null, 2));

    const users = await prisma.userClientAccess.findMany({
      include: { user: { select: { name: true, role: true } }, client: { select: { name: true } } }
    });
    console.log("UserClientAccess:");
    console.log(JSON.stringify(users, null, 2));

  } catch(e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
check();
