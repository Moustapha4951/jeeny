import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const assignments = await prisma.assignment.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { progress: true } } },
  });

  console.log(`\n📋 Total assignments: ${assignments.length}\n`);
  for (const a of assignments) {
    const isActive =
      a.status === 'ACTIVE' &&
      a.startsAt <= new Date() &&
      a.endsAt >= new Date();
    console.log('────────────────────────────────────────');
    console.log('ID:        ', a.id);
    console.log('Title:     ', a.titleAr);
    console.log('Metric:    ', a.metric);
    console.log('Target:    ', a.targetValue.toString());
    console.log('Reward:    ', `${a.rewardAmount.toString()} MRU (${a.rewardType})`);
    console.log('Window:    ', a.startsAt.toISOString(), '→', a.endsAt.toISOString());
    console.log('Status:    ', a.status, isActive ? '(ACTIVE NOW)' : '(not visible)');
    console.log('Driver IDs:', a.driverIds.length === 0 ? 'all drivers' : a.driverIds);
    console.log('Progress:  ', `${a._count.progress} drivers tracked`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
