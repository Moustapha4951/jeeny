import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * One-off seeder for default rating tags. Safe to re-run — it skips
 * tags whose (nameAr, applies, type) already exist.
 */
async function main() {
  const ratingTags = [
    // Positive — DRIVER (rider rating their driver)
    { nameAr: 'سياقة هادئة', nameFr: 'Conduite calme', nameEn: 'Smooth driving', type: 'POSITIVE', applies: 'DRIVER', icon: '🚗', sortOrder: 1 },
    { nameAr: 'سيارة نظيفة', nameFr: 'Voiture propre', nameEn: 'Clean car', type: 'POSITIVE', applies: 'DRIVER', icon: '✨', sortOrder: 2 },
    { nameAr: 'محترم', nameFr: 'Respectueux', nameEn: 'Respectful', type: 'POSITIVE', applies: 'DRIVER', icon: '🙌', sortOrder: 3 },
    { nameAr: 'يعرف الطريق', nameFr: 'Connaît le chemin', nameEn: 'Knows the route', type: 'POSITIVE', applies: 'DRIVER', icon: '🧭', sortOrder: 4 },
    { nameAr: 'وصل بسرعة', nameFr: 'Arrivée rapide', nameEn: 'Arrived fast', type: 'POSITIVE', applies: 'DRIVER', icon: '⚡', sortOrder: 5 },
    // Negative — DRIVER
    { nameAr: 'سياقة عنيفة', nameFr: 'Conduite agressive', nameEn: 'Aggressive driving', type: 'NEGATIVE', applies: 'DRIVER', icon: '⚠️', sortOrder: 11 },
    { nameAr: 'تأخر كثيراً', nameFr: 'Très en retard', nameEn: 'Very late', type: 'NEGATIVE', applies: 'DRIVER', icon: '⏰', sortOrder: 12 },
    { nameAr: 'سيارة غير نظيفة', nameFr: 'Voiture sale', nameEn: 'Dirty car', type: 'NEGATIVE', applies: 'DRIVER', icon: '🧹', sortOrder: 13 },
    { nameAr: 'سلوك غير لائق', nameFr: 'Comportement inapproprié', nameEn: 'Unprofessional', type: 'NEGATIVE', applies: 'DRIVER', icon: '😠', sortOrder: 14 },
    { nameAr: 'تاه في الطريق', nameFr: 'Perdu en route', nameEn: 'Got lost', type: 'NEGATIVE', applies: 'DRIVER', icon: '🗺️', sortOrder: 15 },
    // Positive — RIDER (driver rating their rider)
    { nameAr: 'راكب لطيف', nameFr: 'Passager agréable', nameEn: 'Pleasant rider', type: 'POSITIVE', applies: 'RIDER', icon: '🙂', sortOrder: 1 },
    { nameAr: 'كان جاهزاً', nameFr: 'Était prêt', nameEn: 'Was ready', type: 'POSITIVE', applies: 'RIDER', icon: '✅', sortOrder: 2 },
    { nameAr: 'دفع بدون مشاكل', nameFr: 'Paiement facile', nameEn: 'Easy payment', type: 'POSITIVE', applies: 'RIDER', icon: '💵', sortOrder: 3 },
    // Negative — RIDER
    { nameAr: 'تأخر كثيراً', nameFr: 'Très en retard', nameEn: 'Very late', type: 'NEGATIVE', applies: 'RIDER', icon: '⏰', sortOrder: 11 },
    { nameAr: 'سلوك غير لائق', nameFr: 'Comportement inapproprié', nameEn: 'Disrespectful', type: 'NEGATIVE', applies: 'RIDER', icon: '😠', sortOrder: 12 },
    { nameAr: 'وجهة خاطئة', nameFr: 'Mauvaise destination', nameEn: 'Wrong destination', type: 'NEGATIVE', applies: 'RIDER', icon: '📍', sortOrder: 13 },
  ];

  let created = 0;
  for (const t of ratingTags) {
    const existing = await prisma.ratingTag.findFirst({
      where: { nameAr: t.nameAr, applies: t.applies as any, type: t.type as any },
    });
    if (!existing) {
      await prisma.ratingTag.create({ data: t as any });
      created++;
    }
  }
  console.log(`✅ Seeded ${created} new rating tags (${ratingTags.length - created} already existed)`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
