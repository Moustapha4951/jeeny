import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * One-shot fix: for every driver, sync `Vehicle.registrationExpiry` to the
 * latest APPROVED VEHICLE_REG document's `expiresAt`. Necessary because
 * older versions of the upload flow only updated the Document row, leaving
 * the Vehicle row's expiry stale and blocking go-online.
 *
 * Run with:
 *   cd jeeny_backend
 *   npx ts-node prisma/sync-vehicle-expiry.ts
 */
async function main() {
  const drivers = await prisma.driver.findMany({
    include: {
      user: { select: { phone: true, firstName: true, lastName: true } },
      vehicles: true,
    },
  });

  let updated = 0;
  for (const d of drivers) {
    const vehicleRegDoc = await prisma.document.findFirst({
      where: {
        userId: d.userId,
        type: 'VEHICLE_REG',
        status: 'APPROVED',
        expiresAt: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!vehicleRegDoc || !vehicleRegDoc.expiresAt) continue;

    for (const v of d.vehicles) {
      const docExpiry = vehicleRegDoc.expiresAt;
      const vehicleExpiry = v.registrationExpiry
        ? new Date(v.registrationExpiry)
        : null;
      const needsUpdate =
        !vehicleExpiry ||
        vehicleExpiry.getTime() !== new Date(docExpiry).getTime();

      if (needsUpdate) {
        await prisma.vehicle.update({
          where: { id: v.id },
          data: { registrationExpiry: docExpiry },
        });
        updated++;
        console.log(
          `✅ ${d.user.firstName} ${d.user.lastName} (${d.user.phone}) — ` +
            `vehicle ${v.plateNumber}: ${
              vehicleExpiry?.toISOString().split('T')[0] ?? '—'
            } → ${docExpiry.toISOString().split('T')[0]}`,
        );
      }
    }
  }

  console.log(`\nDone. ${updated} vehicle(s) synced.`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
