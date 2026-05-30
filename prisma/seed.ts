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
    // DRIVER_ASSIGNMENT Category
    { key: 'driver_assignment_strategy', value: 'FIRST_ACCEPT', valueType: 'ENUM', category: 'DRIVER_ASSIGNMENT', descriptionAr: 'استراتيجية تعيين السائقين' },
    { key: 'max_search_radius_km', value: '10', valueType: 'NUMBER', category: 'DRIVER_ASSIGNMENT', descriptionAr: 'نطاق البحث الأقصى (كم)' },
    { key: 'max_drivers_to_notify', value: '10', valueType: 'NUMBER', category: 'DRIVER_ASSIGNMENT', descriptionAr: 'عدد السائقين المراد إشعارهم' },
    { key: 'driver_response_timeout_seconds', value: '30', valueType: 'NUMBER', category: 'DRIVER_ASSIGNMENT', descriptionAr: 'مهلة استجابة السائق (ثانية)' },
    { key: 'priority_weight_rating', value: '0.4', valueType: 'NUMBER', category: 'DRIVER_ASSIGNMENT', descriptionAr: 'وزن التقييم في الأولوية' },
    { key: 'priority_weight_acceptance_rate', value: '0.3', valueType: 'NUMBER', category: 'DRIVER_ASSIGNMENT', descriptionAr: 'وزن معدل القبول في الأولوية' },
    { key: 'priority_weight_distance', value: '0.3', valueType: 'NUMBER', category: 'DRIVER_ASSIGNMENT', descriptionAr: 'وزن المسافة في الأولوية' },
    
    // RIDE Category
    { key: 'enable_ride_scheduling', value: 'true', valueType: 'BOOLEAN', category: 'RIDE', descriptionAr: 'تفعيل جدولة الرحلات' },
    { key: 'max_schedule_days_ahead', value: '7', valueType: 'NUMBER', category: 'RIDE', descriptionAr: 'أقصى عدد أيام للجدولة المسبقة' },
    { key: 'enable_ride_sharing', value: 'false', valueType: 'BOOLEAN', category: 'RIDE', descriptionAr: 'تفعيل مشاركة الرحلات' },
    { key: 'max_waiting_time_minutes', value: '15', valueType: 'NUMBER', category: 'RIDE', descriptionAr: 'أقصى وقت انتظار (دقيقة)' },
    { key: 'enable_stops', value: 'true', valueType: 'BOOLEAN', category: 'RIDE', descriptionAr: 'السماح بالتوقفات أثناء الرحلة' },
    { key: 'max_stops_per_ride', value: '3', valueType: 'NUMBER', category: 'RIDE', descriptionAr: 'أقصى عدد توقفات لكل رحلة' },
    { key: 'auto_cancel_no_driver_minutes', value: '10', valueType: 'NUMBER', category: 'RIDE', descriptionAr: 'إلغاء تلقائي عند عدم وجود سائق (دقيقة)' },
    
    // PAYMENT Category
    { key: 'enable_cash_payment', value: 'true', valueType: 'BOOLEAN', category: 'PAYMENT', descriptionAr: 'تفعيل الدفع نقداً' },
    { key: 'enable_wallet_payment', value: 'true', valueType: 'BOOLEAN', category: 'PAYMENT', descriptionAr: 'تفعيل الدفع بالمحفظة' },
    { key: 'enable_card_payment', value: 'false', valueType: 'BOOLEAN', category: 'PAYMENT', descriptionAr: 'تفعيل الدفع بالبطاقة' },
    { key: 'min_wallet_topup_amount', value: '100', valueType: 'NUMBER', category: 'PAYMENT', descriptionAr: 'الحد الأدنى لشحن المحفظة (أوقية)' },
    { key: 'max_wallet_balance', value: '50000', valueType: 'NUMBER', category: 'PAYMENT', descriptionAr: 'الحد الأقصى لرصيد المحفظة (أوقية)' },
    { key: 'payment_processing_fee_percentage', value: '2.5', valueType: 'NUMBER', category: 'PAYMENT', descriptionAr: 'رسوم معالجة الدفع (%)' },
    
    // PRICING Category
    { key: 'BASE_FARE', value: '50', valueType: 'NUMBER', category: 'PRICING', descriptionAr: 'السعر الأساسي للرحلة' },
    { key: 'PRICE_PER_KM', value: '20', valueType: 'NUMBER', category: 'PRICING', descriptionAr: 'السعر لكل كيلومتر' },
    { key: 'PRICE_PER_MINUTE', value: '5', valueType: 'NUMBER', category: 'PRICING', descriptionAr: 'السعر لكل دقيقة' },
    { key: 'MINIMUM_FARE', value: '100', valueType: 'NUMBER', category: 'PRICING', descriptionAr: 'الحد الأدنى للسعر' },
    { key: 'COMMISSION_RATE', value: '0.15', valueType: 'NUMBER', category: 'PRICING', descriptionAr: 'نسبة العمولة' },
    { key: 'SURGE_MULTIPLIER', value: '1.5', valueType: 'NUMBER', category: 'PRICING', descriptionAr: 'معامل الزيادة في أوقات الذروة' },
    { key: 'CANCELLATION_FEE', value: '50', valueType: 'NUMBER', category: 'PRICING', descriptionAr: 'رسوم الإلغاء' },
    { key: 'enable_dynamic_pricing', value: 'true', valueType: 'BOOLEAN', category: 'PRICING', descriptionAr: 'تفعيل التسعير الديناميكي' },
    { key: 'night_hours_multiplier', value: '1.2', valueType: 'NUMBER', category: 'PRICING', descriptionAr: 'معامل الأسعار الليلية' },
    { key: 'night_hours_start', value: '22:00', valueType: 'STRING', category: 'PRICING', descriptionAr: 'بداية الساعات الليلية' },
    { key: 'night_hours_end', value: '06:00', valueType: 'STRING', category: 'PRICING', descriptionAr: 'نهاية الساعات الليلية' },
    
    // DRIVER Category
    { key: 'driver_minimum_balance', value: '500', valueType: 'NUMBER', category: 'DRIVER', descriptionAr: 'الحد الأدنى لرصيد السائق للعمل' },
    { key: 'min_driver_rating', value: '3.5', valueType: 'NUMBER', category: 'DRIVER', descriptionAr: 'الحد الأدنى لتقييم السائق' },
    { key: 'min_acceptance_rate', value: '70', valueType: 'NUMBER', category: 'DRIVER', descriptionAr: 'الحد الأدنى لمعدل قبول الرحلات (%)' },
    { key: 'max_cancellation_rate', value: '20', valueType: 'NUMBER', category: 'DRIVER', descriptionAr: 'الحد الأقصى لمعدل إلغاء الرحلات (%)' },
    { key: 'driver_auto_suspend_threshold', value: '5', valueType: 'NUMBER', category: 'DRIVER', descriptionAr: 'عدد الشكاوى للتعليق التلقائي' },
    { key: 'require_vehicle_inspection', value: 'true', valueType: 'BOOLEAN', category: 'DRIVER', descriptionAr: 'إلزام فحص المركبة' },
    { key: 'vehicle_inspection_validity_months', value: '6', valueType: 'NUMBER', category: 'DRIVER', descriptionAr: 'صلاحية فحص المركبة (شهر)' },
    { key: 'max_daily_working_hours', value: '12', valueType: 'NUMBER', category: 'DRIVER', descriptionAr: 'أقصى ساعات عمل يومية' },
    
    // NOTIFICATION Category
    { key: 'enable_push_notifications', value: 'true', valueType: 'BOOLEAN', category: 'NOTIFICATION', descriptionAr: 'تفعيل الإشعارات الفورية' },
    { key: 'enable_sms_notifications', value: 'false', valueType: 'BOOLEAN', category: 'NOTIFICATION', descriptionAr: 'تفعيل إشعارات SMS' },
    { key: 'enable_email_notifications', value: 'false', valueType: 'BOOLEAN', category: 'NOTIFICATION', descriptionAr: 'تفعيل إشعارات البريد' },
    { key: 'notify_driver_new_ride', value: 'true', valueType: 'BOOLEAN', category: 'NOTIFICATION', descriptionAr: 'إشعار السائق برحلة جديدة' },
    { key: 'notify_rider_driver_assigned', value: 'true', valueType: 'BOOLEAN', category: 'NOTIFICATION', descriptionAr: 'إشعار الراكب بتعيين سائق' },
    { key: 'notify_rider_driver_arrived', value: 'true', valueType: 'BOOLEAN', category: 'NOTIFICATION', descriptionAr: 'إشعار الراكب بوصول السائق' },
    { key: 'notify_completed_ride', value: 'true', valueType: 'BOOLEAN', category: 'NOTIFICATION', descriptionAr: 'إشعار إتمام الرحلة' },
    
    // SAFETY Category
    { key: 'enable_sos_button', value: 'true', valueType: 'BOOLEAN', category: 'SAFETY', descriptionAr: 'تفعيل زر الطوارئ' },
    { key: 'enable_ride_sharing_contacts', value: 'true', valueType: 'BOOLEAN', category: 'SAFETY', descriptionAr: 'تفعيل مشاركة الرحلة مع جهات الاتصال' },
    { key: 'enable_driver_verification', value: 'true', valueType: 'BOOLEAN', category: 'SAFETY', descriptionAr: 'إلزام التحقق من هوية السائق' },
    { key: 'require_driver_background_check', value: 'true', valueType: 'BOOLEAN', category: 'SAFETY', descriptionAr: 'إلزام فحص السجل الجنائي' },
    { key: 'max_speed_limit_kmh', value: '120', valueType: 'NUMBER', category: 'SAFETY', descriptionAr: 'الحد الأقصى للسرعة (كم/س)' },
    { key: 'enable_route_deviation_alert', value: 'true', valueType: 'BOOLEAN', category: 'SAFETY', descriptionAr: 'تفعيل تنبيه الانحراف عن المسار' },
    { key: 'max_route_deviation_km', value: '2', valueType: 'NUMBER', category: 'SAFETY', descriptionAr: 'أقصى انحراف مسموح (كم)' },
    
    // GENERAL Category
    { key: 'MAX_SEARCH_RADIUS', value: '10', valueType: 'NUMBER', category: 'GENERAL', descriptionAr: 'نطاق البحث الأقصى (كم)' },
    { key: 'app_maintenance_mode', value: 'false', valueType: 'BOOLEAN', category: 'GENERAL', descriptionAr: 'وضع الصيانة' },
    { key: 'support_phone', value: '+22212345678', valueType: 'STRING', category: 'GENERAL', descriptionAr: 'رقم الدعم الفني' },
    { key: 'support_email', value: 'support@jeeny.mr', valueType: 'STRING', category: 'GENERAL', descriptionAr: 'بريد الدعم الفني' },
    { key: 'terms_url', value: 'https://jeeny.mr/terms', valueType: 'STRING', category: 'GENERAL', descriptionAr: 'رابط الشروط والأحكام' },
    { key: 'privacy_url', value: 'https://jeeny.mr/privacy', valueType: 'STRING', category: 'GENERAL', descriptionAr: 'رابط سياسة الخصوصية' },
    { key: 'default_language', value: 'AR', valueType: 'STRING', category: 'GENERAL', descriptionAr: 'اللغة الافتراضية' },
    { key: 'currency', value: 'MRU', valueType: 'STRING', category: 'GENERAL', descriptionAr: 'العملة' },
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

  // Rating tags — chips that show beneath the star picker after a ride.
  // Riders can tag what they liked or didn't about their driver.
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

  for (const t of ratingTags) {
    const existing = await prisma.ratingTag.findFirst({
      where: { nameAr: t.nameAr, applies: t.applies as any, type: t.type as any },
    });
    if (!existing) {
      await prisma.ratingTag.create({ data: t as any });
    }
  }
  console.log(`✅ Created ${ratingTags.length} rating tags`);

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
  console.log(`   - 60+ System settings across 8 categories`);
  console.log('     • DRIVER_ASSIGNMENT (7 settings)');
  console.log('     • RIDE (7 settings)');
  console.log('     • PAYMENT (6 settings)');
  console.log('     • PRICING (11 settings)');
  console.log('     • DRIVER (8 settings)');
  console.log('     • NOTIFICATION (7 settings)');
  console.log('     • SAFETY (7 settings)');
  console.log('     • GENERAL (8 settings)');
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
