import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚗 Seeding vehicle types...');

  // Economy
  await prisma.vehicleType.upsert({
    where: { id: 'economy' },
    update: {},
    create: {
      id: 'economy',
      name: 'Economy',
      nameAr: 'اقتصادي',
      nameFr: 'Économique',
      basePrice: 50,
      pricePerKm: 15,
      pricePerMin: 3,
      minFare: 80,
      capacity: 4,
      icon: 'economy',
      isActive: true,
    },
  });

  // Comfort
  await prisma.vehicleType.upsert({
    where: { id: 'comfort' },
    update: {},
    create: {
      id: 'comfort',
      name: 'Comfort',
      nameAr: 'مريح',
      nameFr: 'Confort',
      basePrice: 75,
      pricePerKm: 20,
      pricePerMin: 5,
      minFare: 120,
      capacity: 4,
      icon: 'comfort',
      isActive: true,
    },
  });

  // Premium
  await prisma.vehicleType.upsert({
    where: { id: 'premium' },
    update: {},
    create: {
      id: 'premium',
      name: 'Premium',
      nameAr: 'فاخر',
      nameFr: 'Premium',
      basePrice: 100,
      pricePerKm: 30,
      pricePerMin: 8,
      minFare: 180,
      capacity: 4,
      icon: 'premium',
      isActive: true,
    },
  });

  console.log('✅ Vehicle types seeded successfully!');
  console.log('   - Economy (اقتصادي)');
  console.log('   - Comfort (مريح)');
  console.log('   - Premium (فاخر)');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding vehicle types:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
