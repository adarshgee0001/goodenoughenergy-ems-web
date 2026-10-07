const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("--- START ADMIN LOOKUP ---");
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      forcePasswordChange: true,
      createdAt: true,
      updatedAt: true
    }
  });
  console.log("USERS:", JSON.stringify(users, null, 2));
  console.log("--- END ADMIN LOOKUP ---");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
