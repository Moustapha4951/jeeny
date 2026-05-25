import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const progress = await p.driverAssignmentProgress.findMany({
    include: {
      assignment: true,
      driver: { include: { user: { select: { phone: true, firstName: true } } } },
    },
  });

  console.log(`\n📊 Progress rows: ${progress.length}\n`);
  for (const r of progress) {
    console.log('────────────────────────────────────────');
    console.log('Driver:    ', r.driver.user.phone, '(' + r.driver.user.firstName + ')');
    console.log('Assignment:', r.assignment.titleAr);
    console.log('Current:   ', r.currentValue.toString(), '/', r.assignment.targetValue.toString());
    console.log('Completed: ', r.isCompleted, r.completedAt ? `at ${r.completedAt.toISOString()}` : '');
    console.log('Claimed:   ', r.isClaimed, r.claimedAt ? `at ${r.claimedAt.toISOString()}` : '');
  }

  // Also list recent completed rides for context
  const recent = await p.ride.findMany({
    where: { status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
    take: 5,
    include: { driver: { include: { user: { select: { phone: true } } } } },
  });
  console.log(`\n🚗 Recent COMPLETED rides: ${recent.length}\n`);
  for (const r of recent) {
    console.log('Ride:', r.id, '| Driver:', r.driver?.user?.phone, '| Fare:', r.finalFare?.toString(), '| Completed:', r.completedAt?.toISOString());
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
