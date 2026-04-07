import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create Admin User
  console.log('Creating admin user...');
  const adminUser = await prisma.user.upsert({
    where: { phone: '+22212345678' },
    update: {},
    create: {
      phone: '+22212345678',
      firstName: 'أحمد',
      lastName: 'المدير',
      email: 'admin@jeeny.mr',
      phoneVerified: true,
    },
  });

  const admin = await prisma.admin.upsert({
    where: { userId: adminUser.id },
    update: {},
    create: {
      userId: adminUser.id,
      role: 'SUPER_ADMIN',
      permissions: { all: true },
    },
  });

  console.log('✅ Admin created:', adminUser.phone);

  // Create Consumer Users
  console.log('Creating consumer users...');
  const consumers = [];
  for (let i = 1; i <= 5; i++) {
    const user = await prisma.user.create({
      data: {
        phone: `+2221234567${i}`,
        firstName: `محمد${i}`,
        lastName: `المستخدم`,
        email: `consumer${i}@jeeny.mr`,
        phoneVerified: true,
      },
    });

    const consumer = await prisma.consumer.create({
      data: {
        userId: user.id,
        rating: 4.5 + Math.random() * 0.5,
        totalTrips: Math.floor(Math.random() * 50),
      },
    });

    // Create wallet for consumer
    await prisma.wallet.create({
      data: {
        userId: user.id,
        type: 'CONSUMER',
        balance: 1000 + Math.random() * 5000,
        holdBalance: 0,
        currency: 'MRU',
      },
    });

    consumers.push({ user, consumer });
  }

  console.log(`✅ Created ${consumers.length} consumers`);

  // Create Driver Users
  console.log('Creating driver users...');
  const drivers = [];
  const driverStatuses = ['PENDING', 'APPROVED', 'APPROVED', 'APPROVED', 'SUSPENDED'];

  for (let i = 1; i <= 5; i++) {
    const user = await prisma.user.create({
      data: {
        phone: `+2229876543${i}`,
        firstName: `عبدالله${i}`,
        lastName: `السائق`,
        email: `driver${i}@jeeny.mr`,
        phoneVerified: true,
      },
    });

    const driver = await prisma.driver.create({
      data: {
        userId: user.id,
        status: driverStatuses[i - 1] as any,
        isOnline: i <= 3,
        isOnTrip: false,
        rating: 4.0 + Math.random(),
        totalTrips: Math.floor(Math.random() * 200),
        licenseNumber: `LIC${10000 + i}`,
        licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        nationalId: `NID${20000 + i}`,
        dateOfBirth: new Date(1990, 0, 1),
        gender: 'MALE',
        address: `شارع ${i}، نواكشوط`,
        city: 'نواكشوط',
        state: 'نواكشوط',
        approvedById: i > 1 ? admin.id : undefined,
        approvedAt: i > 1 ? new Date() : undefined,
      },
    });

    // Create wallet for driver
    await prisma.wallet.create({
      data: {
        userId: user.id,
        type: 'DRIVER',
        balance: 5000 + Math.random() * 10000,
        holdBalance: 0,
        currency: 'MRU',
      },
    });

    // Create driver location for online drivers
    if (i <= 3) {
      await prisma.driverLocation.create({
        data: {
          driverId: driver.id,
          lat: 18.0735 + (Math.random() - 0.5) * 0.1,
          lng: -15.9582 + (Math.random() - 0.5) * 0.1,
          heading: Math.random() * 360,
          speed: Math.random() * 60,
        },
      });
    }

    drivers.push({ user, driver });
  }

  console.log(`✅ Created ${drivers.length} drivers`);

  // Create Vehicle Type
  console.log('Creating vehicle type...');
  const vehicleType = await prisma.vehicleType.upsert({
    where: { id: 'default-sedan' },
    update: {},
    create: {
      id: 'default-sedan',
      name: 'Sedan',
      nameAr: 'سيدان',
      nameFr: 'Berline',
      basePrice: 50,
      pricePerKm: 20,
      pricePerMin: 5,
      minFare: 100,
      capacity: 4,
      icon: 'sedan',
      isActive: true,
    },
  });

  console.log('✅ Created vehicle type');

  // Create Saved Places
  console.log('Creating saved places...');
  for (const { user } of consumers.slice(0, 3)) {
    await prisma.savedPlace.create({
      data: {
        userId: user.id,
        name: 'المنزل',
        address: 'تفرغ زينة، نواكشوط',
        lat: 18.0735,
        lng: -15.9582,
      },
    });

    await prisma.savedPlace.create({
      data: {
        userId: user.id,
        name: 'العمل',
        address: 'السوق المركزي، نواكشوط',
        lat: 18.0865,
        lng: -15.9750,
      },
    });
  }

  console.log('✅ Created saved places');

  // Create Promo Codes
  console.log('Creating promo codes...');
  await prisma.promoCode.create({
    data: {
      code: 'WELCOME50',
      descriptionAr: 'خصم 50% على أول رحلة',
      descriptionFr: '50% de réduction sur le premier trajet',
      descriptionEn: '50% off on first ride',
      type: 'PERCENTAGE',
      value: 50,
      maxDiscount: 200,
      minRideAmount: 100,
      perUserLimit: 1,
      usageLimit: 1000,
      usageCount: 45,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      isActive: true,
      applicableRideTypes: ['CITY'],
      applicableVehicleTypes: [],
      applicableCities: [],
      createdById: admin.id,
    },
  });

  await prisma.promoCode.create({
    data: {
      code: 'RAMADAN2024',
      descriptionAr: 'خصم 100 أوقية على كل رحلة',
      descriptionFr: '100 MRU de réduction sur chaque trajet',
      descriptionEn: '100 MRU off on every ride',
      type: 'FIXED_AMOUNT',
      value: 100,
      minRideAmount: 200,
      perUserLimit: 5,
      usageLimit: 5000,
      usageCount: 234,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      isActive: true,
      applicableRideTypes: ['CITY'],
      applicableVehicleTypes: [],
      applicableCities: [],
      createdById: admin.id,
    },
  });

  console.log('✅ Created promo codes');

  // Create System Settings
  console.log('Creating system settings...');
  const settings = [
    { key: 'BASE_FARE', value: '50', valueType: 'NUMBER', category: 'PRICING', descriptionAr: 'السعر الأساسي للرحلة' },
    { key: 'PRICE_PER_KM', value: '20', valueType: 'NUMBER', category: 'PRICING', descriptionAr: 'السعر لكل كيلومتر' },
    { key: 'PRICE_PER_MINUTE', value: '5', valueType: 'NUMBER', category: 'PRICING', descriptionAr: 'السعر لكل دقيقة' },
    { key: 'MINIMUM_FARE', value: '100', valueType: 'NUMBER', category: 'PRICING', descriptionAr: 'الحد الأدنى للسعر' },
    { key: 'COMMISSION_RATE', value: '0.15', valueType: 'NUMBER', category: 'PRICING', descriptionAr: 'نسبة العمولة' },
    { key: 'SURGE_MULTIPLIER', value: '1.5', valueType: 'NUMBER', category: 'PRICING', descriptionAr: 'معامل الزيادة في أوقات الذروة' },
    { key: 'CANCELLATION_FEE', value: '50', valueType: 'NUMBER', category: 'PRICING', descriptionAr: 'رسوم الإلغاء' },
    { key: 'MAX_SEARCH_RADIUS', value: '10', valueType: 'NUMBER', category: 'GENERAL', descriptionAr: 'نطاق البحث الأقصى (كم)' },
    { key: 'driver_minimum_balance', value: '500', valueType: 'NUMBER', category: 'DRIVER', descriptionAr: 'الحد الأدنى لرصيد السائق للعمل' },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: {
        ...setting,
        updatedById: admin.id,
      } as any,
    });
  }

  console.log('✅ Created system settings');

  console.log('');
  console.log('🎉 Database seeding completed successfully!');
  console.log('');
  console.log('📊 Summary:');
  console.log(`   - 1 Admin user (phone: +22212345678)`);
  console.log(`   - 5 Consumer users`);
  console.log(`   - 5 Driver users (3 online, 1 pending, 1 suspended)`);
  console.log(`   - 1 Vehicle type (Sedan)`);
  console.log(`   - Saved places for 3 users`);
  console.log(`   - 2 Active promo codes`);
  console.log(`   - 9 System settings (including driver minimum balance: 500 MRU)`);
  console.log('');
  console.log('🔐 Test Login:');
  console.log('   Admin: +22212345678');
  console.log('   Consumer: +22212345671 to +22212345675');
  console.log('   Driver: +22298765431 to +22298765435');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
