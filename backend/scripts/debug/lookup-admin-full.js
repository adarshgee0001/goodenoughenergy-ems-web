const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: 'admin@gee.local' } });
  console.log("Admin User Object:", admin);
}

main().finally(() => prisma.$disconnect());
