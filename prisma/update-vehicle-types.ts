import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting vehicle type update...');

  // Find Sedan vehicle type
  const sedan = await prisma.vehicleType.findFirst({
    where: {
      OR: [
        { name: { contains: 'Sedan', mode: 'insensitive' } },
        { nameAr: { contains: 'سيدان', mode: 'insensitive' } },
      ],
    },
  });

  if (sedan) {
    console.log('Found Sedan vehicle type:', sedan.id);

    // Create Economy vehicle type first
    const economy = await prisma.vehicleType.create({
      data: {
        name: 'Economy',
        nameAr: 'اقتصادية',
        nameFr: 'Économique',
        description: 'سيارة اقتصادية مريحة للرحلات اليومية',
        image: 'سيارة.png',
        basePrice: 0, // No base price mentioned
        pricePerKm: 25,
        pricePerMin: 5,
        minFare: 100,
        nightPriceMultiplier: 1.25, // 25% increase after 00:00
        adminCommission: 15.0, // 15%
        driverCommission: 85.0, // 85%
        cancellationFee: 5, // 5 أوقية
        capacity: 4,
        icon: 'car',
        isActive: true,
        supportsIntercity: false,
      },
    });

    console.log('Created Economy vehicle type:', economy.id);

    // Update all rides using Sedan to use Economy
    const updatedRides = await prisma.ride.updateMany({
      where: { vehicleTypeId: sedan.id },
      data: { vehicleTypeId: economy.id },
    });
    console.log(`Updated ${updatedRides.count} rides to use Economy`);

    // Delete Sedan vehicle type
    await prisma.vehicleType.delete({
      where: { id: sedan.id },
    });
    console.log('Deleted Sedan vehicle type');
  } else {
    console.log('Sedan vehicle type not found, creating Economy only');
    
    // Create Economy vehicle type
    const economy = await prisma.vehicleType.create({
      data: {
        name: 'Economy',
        nameAr: 'اقتصادية',
        nameFr: 'Économique',
        description: 'سيارة اقتصادية مريحة للرحلات اليومية',
        image: 'سيارة.png',
        basePrice: 0,
        pricePerKm: 25,
        pricePerMin: 5,
        minFare: 100,
        nightPriceMultiplier: 1.25,
        adminCommission: 15.0,
        driverCommission: 85.0,
        cancellationFee: 5,
        capacity: 4,
        icon: 'car',
        isActive: true,
        supportsIntercity: false,
      },
    });

    console.log('Created Economy vehicle type:', economy);
  }

  console.log('Vehicle type update completed!');
}

main()
  .catch((e) => {
    console.error('Error updating vehicle types:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
