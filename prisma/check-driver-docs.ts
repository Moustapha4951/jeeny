import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Print every document row for every driver, so we can spot stale rows
 * with old expiresAt values that are blocking go-online.
 *
 * Run with:
 *   cd jeeny_backend
 *   npx ts-node prisma/check-driver-docs.ts
 */
async function main() {
  const drivers = await prisma.driver.findMany({
    include: {
      user: { select: { phone: true, firstName: true, lastName: true } },
      vehicles: {
        select: {
          id: true,
          plateNumber: true,
          status: true,
          registrationExpiry: true,
        },
      },
    },
  });

  const now = new Date();
  console.log(`\n📋 Total drivers: ${drivers.length}\n`);

  for (const d of drivers) {
    console.log('─────────────────────────────────────────────');
    console.log(
      `Driver: ${d.user.firstName} ${d.user.lastName}  ${d.user.phone}  status=${d.status}`,
    );
    console.log(`Driver ID: ${d.id}  userId: ${d.userId}`);

    const docs = await prisma.document.findMany({
      where: {
        userId: d.userId,
        type: {
          in: ['LICENSE', 'NATIONAL_ID', 'VEHICLE_REG', 'INSURANCE'],
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (docs.length === 0) {
      console.log('  (no expiry-bearing documents)');
    } else {
      console.log(`  Documents (${docs.length}):`);
      for (const doc of docs) {
        const expired =
          doc.status === 'APPROVED' &&
          doc.expiresAt &&
          new Date(doc.expiresAt) < now;
        const flag = expired ? ' ⚠️ EXPIRED' : '';
        console.log(
          `    [${doc.id.slice(0, 8)}] ${doc.type.padEnd(13)} ` +
            `status=${doc.status.padEnd(9)} ` +
            `expires=${doc.expiresAt ? doc.expiresAt.toISOString().split('T')[0] : '—'} ` +
            `created=${doc.createdAt.toISOString().split('T')[0]}${flag}`,
        );
      }
    }

    if (d.vehicles.length > 0) {
      for (const v of d.vehicles) {
        const expiredVeh =
          v.registrationExpiry && new Date(v.registrationExpiry) < now;
        const flag = expiredVeh ? ' ⚠️ EXPIRED' : '';
        console.log(
          `  Vehicle: ${v.plateNumber}  status=${v.status}  reg-expiry=${
            v.registrationExpiry
              ? v.registrationExpiry.toISOString().split('T')[0]
              : '—'
          }${flag}`,
        );
      }
    } else {
      console.log('  (no vehicle)');
    }
  }
  console.log('─────────────────────────────────────────────\n');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
