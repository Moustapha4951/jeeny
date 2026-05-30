import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/// One-off seeder for ChatQuickReply chips. Safe to re-run.
async function main() {
  const replies = [
    // RIDER → DRIVER
    { category: 'RIDER', textAr: 'أنا قادم', textFr: 'J\'arrive', textEn: 'On my way', icon: '🏃', sortOrder: 1 },
    { category: 'RIDER', textAr: 'أين أنت؟', textFr: 'Où êtes-vous ?', textEn: 'Where are you?', icon: '📍', sortOrder: 2 },
    { category: 'RIDER', textAr: 'وصلت أم لا؟', textFr: 'Êtes-vous arrivé ?', textEn: 'Are you here?', icon: '❓', sortOrder: 3 },
    { category: 'RIDER', textAr: 'دقيقة واحدة', textFr: 'Une minute', textEn: 'One minute', icon: '⏱️', sortOrder: 4 },
    { category: 'RIDER', textAr: 'شكراً', textFr: 'Merci', textEn: 'Thank you', icon: '🙏', sortOrder: 5 },

    // DRIVER → RIDER
    { category: 'DRIVER', textAr: 'وصلت إلى نقطة الانطلاق', textFr: 'Arrivé au point de départ', textEn: 'Arrived at pickup', icon: '📍', sortOrder: 1 },
    { category: 'DRIVER', textAr: 'سأصل بعد دقائق', textFr: 'J\'arrive dans quelques minutes', textEn: 'Be there in a minute', icon: '⏱️', sortOrder: 2 },
    { category: 'DRIVER', textAr: 'أين موقعك بالضبط؟', textFr: 'Quelle est votre position ?', textEn: 'Where exactly are you?', icon: '🗺️', sortOrder: 3 },
    { category: 'DRIVER', textAr: 'هل وصلت؟', textFr: 'Vous êtes arrivé ?', textEn: 'Did you arrive?', icon: '❓', sortOrder: 4 },
    { category: 'DRIVER', textAr: 'تم بدء الرحلة', textFr: 'Trajet commencé', textEn: 'Trip started', icon: '🚗', sortOrder: 5 },

    // COMMON
    { category: 'COMMON', textAr: 'حسناً', textFr: 'OK', textEn: 'OK', icon: '👍', sortOrder: 10 },
    { category: 'COMMON', textAr: 'لا أفهم', textFr: 'Je ne comprends pas', textEn: 'I don\'t understand', icon: '🤔', sortOrder: 11 },
  ];

  let created = 0;
  for (const r of replies) {
    const existing = await prisma.chatQuickReply.findFirst({
      where: { category: r.category as any, textAr: r.textAr },
    });
    if (!existing) {
      await prisma.chatQuickReply.create({ data: r as any });
      created++;
    }
  }
  console.log(`✅ Seeded ${created} new quick replies (${replies.length - created} already existed)`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
