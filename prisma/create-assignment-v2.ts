import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Create a fresh assignment for testing: complete 2 rides today and earn
 * a 100 MRU bonus. Smaller target so the driver can hit it on a single
 * test pass. Different metric value than the existing one so progress is
 * tracked from zero.
 *
 * Run with:
 *   cd jeeny_backend
 *   npx ts-node prisma/create-assignment-v2.ts
 */
async function main() {
  console.log('🎯 Creating new test assignment...\n');

  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  // First, archive any old test assignments so the home card surfaces
  // only the new one.
  const oldCount = await prisma.assignment.updateMany({
    where: {
      status: 'ACTIVE',
      titleAr: { contains: 'رحلات اليوم' },
    },
    data: { status: 'ARCHIVED' },
  });
  if (oldCount.count > 0) {
    console.log(`🧹 Archived ${oldCount.count} previous test assignment(s)\n`);
  }

  const assignment = await prisma.assignment.create({
    data: {
      titleAr: 'أكمل رحلتين اليوم واربح 100 أوقية',
      titleFr: 'Complétez 2 courses aujourd\'hui et gagnez 100 MRU',
      titleEn: 'Complete 2 rides today and earn 100 MRU',

      descriptionAr:
        'أكمل رحلتين قبل نهاية اليوم لتحصل على مكافأة 100 أوقية تُضاف فوراً لمحفظتك',
      descriptionFr:
        'Complétez 2 courses avant la fin de la journée pour gagner 100 MRU directement sur votre portefeuille',
      descriptionEn:
        'Complete 2 rides before the day ends to earn 100 MRU added directly to your wallet',

      metric: 'RIDES_COMPLETED',
      targetValue: 2,

      rewardType: 'WALLET_CREDIT',
      rewardAmount: 100,
      rewardDescriptionAr: '100 أوقية تُضاف لمحفظتك',
      rewardDescriptionFr: '100 MRU ajoutés à votre portefeuille',
      rewardDescriptionEn: '100 MRU added to your wallet',

      startsAt: now,
      endsAt: endOfToday,

      driverIds: [], // empty = all approved drivers
      status: 'ACTIVE',
    },
  });

  console.log('✅ Assignment created!');
  console.log('────────────────────────────────────────');
  console.log('ID:        ', assignment.id);
  console.log('Title (ar):', assignment.titleAr);
  console.log('Title (en):', assignment.titleEn);
  console.log('Goal:      ', `${assignment.targetValue} rides`);
  console.log('Reward:    ', `${assignment.rewardAmount} MRU`);
  console.log('Starts:    ', assignment.startsAt.toISOString());
  console.log('Ends:      ', assignment.endsAt.toISOString());
  console.log('Status:    ', assignment.status);
  console.log('Visible to:', 'all approved drivers');
  console.log('────────────────────────────────────────');

  // Print all currently active assignments so we know what the driver sees
  const active = await prisma.assignment.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  });
  console.log(`\n📋 Active assignments now: ${active.length}`);
  for (const a of active) {
    console.log(
      `  • ${a.id.slice(0, 8)}…  ${a.titleAr}  →  ${a.targetValue} ${a.metric}, ${a.rewardAmount} MRU`,
    );
  }
}

main()
  .catch((e) => {
    console.error('❌ Error creating assignment:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
