import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Create a sample assignment: complete 3 rides today, earn 50 MRU.
 * Run with: npx ts-node prisma/create-assignment.ts
 */
async function main() {
  console.log('🎯 Creating assignment...\n');

  // Window: now → end of today (driver's local "today")
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const assignment = await prisma.assignment.create({
    data: {
      titleAr: 'أكمل 3 رحلات اليوم',
      titleFr: 'Complétez 3 courses aujourd\'hui',
      titleEn: 'Complete 3 rides today',

      descriptionAr: 'استلم 50 أوقية مكافأة عند إكمال 3 رحلات قبل نهاية اليوم',
      descriptionFr:
        'Recevez 50 MRU en récompense en complétant 3 courses avant la fin de la journée',
      descriptionEn:
        'Earn 50 MRU when you complete 3 rides before the end of today',

      metric: 'RIDES_COMPLETED',
      targetValue: 3,

      rewardType: 'WALLET_CREDIT',
      rewardAmount: 50,
      rewardDescriptionAr: '50 أوقية تُضاف لمحفظتك',
      rewardDescriptionFr: '50 MRU ajoutés à votre portefeuille',
      rewardDescriptionEn: '50 MRU added to your wallet',

      startsAt: now,
      endsAt: endOfToday,

      driverIds: [], // empty = all approved drivers
      status: 'ACTIVE',
    },
  });

  console.log('✅ Assignment created!');
  console.log('────────────────────────────────────────');
  console.log('ID:        ', assignment.id);
  console.log('Title:     ', assignment.titleAr);
  console.log('Goal:      ', `${assignment.targetValue} rides`);
  console.log('Reward:    ', `${assignment.rewardAmount} MRU`);
  console.log('Starts:    ', assignment.startsAt.toISOString());
  console.log('Ends:      ', assignment.endsAt.toISOString());
  console.log('Status:    ', assignment.status);
  console.log('Visible to:', 'all approved drivers');
  console.log('────────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error('❌ Error creating assignment:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
