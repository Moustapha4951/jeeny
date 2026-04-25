const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const drivers = await prisma.driver.findMany({ include: { user: true } });
  console.log('Driver Users:', JSON.stringify(drivers.map(d => ({id: d.id, userId: d.userId, phone: d.user.phone, fcmToken: d.user.fcmToken})), null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
