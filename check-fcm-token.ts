import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const driverId = 'e7e8cd2a-1190-490f-91c7-6a85b2fbdd29';
  
  const driver = await prisma.driver.findUnique({
    where: { userId: driverId },
    include: {
      user: {
        select: {
          phone: true,
          fcmToken: true,
        },
      },
    },
  });

  if (driver) {
    console.log('Driver found:');
    console.log('  Phone:', driver.user.phone);
    console.log('  FCM Token:', driver.user.fcmToken);
    console.log('  Token length:', driver.user.fcmToken?.length || 0);
  } else {
    console.log('Driver not found');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
