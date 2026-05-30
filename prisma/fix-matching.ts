import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/// One-off cleanup:
/// 1. Force min_driver_rating to 0 in system_settings so launch-phase
///    drivers with no rating history can still match.
/// 2. Cancel any stuck IN_PROGRESS / DRIVER_* rides older than 1h and
///    free their drivers.
async function main() {
  // 1. Lower the rating floor.
  await prisma.systemSetting.upsert({
    where: { key: 'min_driver_rating' },
    update: { value: '0' as any },
    create: {
      key: 'min_driver_rating',
      value: '0' as any,
      category: 'DRIVER',
      valueType: 'NUMBER',
      descriptionAr: 'الحد الأدنى لتقييم السائق',
    },
  });
  console.log('✅ min_driver_rating = 0');

  // 2. Free stuck drivers.
  const cutoff = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
  const stale = await prisma.ride.findMany({
    where: {
      status: { in: ['DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'IN_PROGRESS'] },
      createdAt: { lt: cutoff },
    },
    select: { id: true, driverId: true, status: true, createdAt: true },
  });
  console.log(`📋 Found ${stale.length} stale ride(s)`);
  for (const r of stale) {
    await prisma.ride.update({
      where: { id: r.id },
      data: {
        status: 'CANCELLED_BY_DRIVER',
        cancelledAt: new Date(),
        cancelledBy: 'DRIVER',
        cancelReason: 'Auto-cancelled (stale)',
      },
    });
    if (r.driverId) {
      await prisma.driver.update({
        where: { id: r.driverId },
        data: { isOnTrip: false },
      });
    }
    console.log(
      `   • ${r.id} (${r.status}, ${r.createdAt.toISOString()}) → cancelled`,
    );
  }
  console.log('✅ Stale rides cleared');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
