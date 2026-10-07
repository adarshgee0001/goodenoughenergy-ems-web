const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany();
  for (const u of users) {
    const pw1 = 'admin@321';
    const pw2 = 'client@321';
    const pw3 = 'password';
    if (await bcrypt.compare(pw1, u.passwordHash)) console.log(u.email, pw1);
    else if (await bcrypt.compare(pw2, u.passwordHash)) console.log(u.email, pw2);
    else if (await bcrypt.compare(pw3, u.passwordHash)) console.log(u.email, pw3);
    else console.log(u.email, "unknown password pattern");
  }
}
main();
