import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/// Quick diagnostic for "no drivers found" — prints the state of every
/// online driver and any active rides locking them on isOnTrip=true.
async function main() {
  const drivers = await prisma.driver.findMany({
    where: { isOnline: true },
    include: {
      user: { select: { firstName: true, lastName: true, phone: true } },
      vehicles: { where: { isActive: true } },
    },
  });

  console.log(`\n📍 ${drivers.length} online driver(s)\n`);
  for (const d of drivers) {
    const fullName = `${d.user?.firstName ?? ''} ${d.user?.lastName ?? ''}`.trim();
    console.log(`Driver ${d.id} (${fullName || d.user?.phone || 'unknown'}):`);
    console.log(`  status=${d.status}`);
    console.log(`  isOnTrip=${d.isOnTrip}`);
    console.log(`  rating=${d.rating}`);
    console.log(`  currentLat=${d.currentLat}  currentLng=${d.currentLng}`);
    console.log(`  vehicles=${d.vehicles.map(v => `${v.typeId}/${v.status}`).join(', ') || 'none'}`);

    if (d.isOnTrip) {
      const lockedRide = await prisma.ride.findFirst({
        where: {
          driverId: d.id,
          status: { in: ['DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'IN_PROGRESS'] },
        },
        select: { id: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      });
      if (lockedRide) {
        console.log(
          `  ⚠️ Locked by ride ${lockedRide.id} (${lockedRide.status}, created ${lockedRide.createdAt.toISOString()})`,
        );
      } else {
        console.log(
          `  ⚠️ STUCK isOnTrip=true with no active ride — will auto-clear`,
        );
        await prisma.driver.update({
          where: { id: d.id },
          data: { isOnTrip: false },
        });
        console.log(`     ✅ cleared`);
      }
    }
    console.log('');
  }
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
