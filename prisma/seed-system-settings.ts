import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding system settings...');

  const settings = [
    // Driver Assignment Strategy
    {
      key: 'driver_assignment_strategy',
      value: 'FIRST_ACCEPT',
      valueType: 'ENUM',
      category: 'DRIVER_ASSIGNMENT',
      descriptionAr: 'استراتيجية تعيين السائقين',
      descriptionEn: 'Driver assignment strategy',
    },
    {
      key: 'max_drivers_to_notify',
      value: 5,
      valueType: 'NUMBER',
      category: 'DRIVER_ASSIGNMENT',
      descriptionAr: 'الحد الأقصى لعدد السائقين المراد إشعارهم',
      descriptionEn: 'Maximum number of drivers to notify',
    },
    {
      key: 'driver_search_radius_km',
      value: 5,
      valueType: 'NUMBER',
      category: 'DRIVER_ASSIGNMENT',
      descriptionAr: 'نطاق البحث عن السائقين (كم)',
      descriptionEn: 'Driver search radius (km)',
    },
    {
      key: 'offer_timeout_seconds',
      value: 30,
      valueType: 'NUMBER',
      category: 'DRIVER_ASSIGNMENT',
      descriptionAr: 'مهلة قبول العرض (ثانية)',
      descriptionEn: 'Offer acceptance timeout (seconds)',
    },
    {
      key: 'priority_factors',
      value: {
        rating: 0.4,
        acceptance_rate: 0.3,
        distance: 0.2,
        completion_rate: 0.1,
      },
      valueType: 'JSON',
      category: 'DRIVER_ASSIGNMENT',
      descriptionAr: 'عوامل الأولوية في تعيين السائقين',
      descriptionEn: 'Priority factors for driver assignment',
    },

    // Ride Settings
    {
      key: 'max_ride_search_time_minutes',
      value: 5,
      valueType: 'NUMBER',
      category: 'RIDE',
      descriptionAr: 'الحد الأقصى لوقت البحث عن سائق (دقيقة)',
      descriptionEn: 'Maximum ride search time (minutes)',
    },
    {
      key: 'allow_ride_scheduling',
      value: true,
      valueType: 'BOOLEAN',
      category: 'RIDE',
      descriptionAr: 'السماح بجدولة الرحلات',
      descriptionEn: 'Allow ride scheduling',
    },
    {
      key: 'max_schedule_days_ahead',
      value: 7,
      valueType: 'NUMBER',
      category: 'RIDE',
      descriptionAr: 'الحد الأقصى لأيام الجدولة المسبقة',
      descriptionEn: 'Maximum days to schedule ahead',
    },
    {
      key: 'cancellation_grace_period_minutes',
      value: 5,
      valueType: 'NUMBER',
      category: 'RIDE',
      descriptionAr: 'فترة السماح للإلغاء المجاني (دقيقة)',
      descriptionEn: 'Free cancellation grace period (minutes)',
    },

    // Payment Settings
    {
      key: 'default_payment_method',
      value: 'CASH',
      valueType: 'ENUM',
      category: 'PAYMENT',
      descriptionAr: 'طريقة الدفع الافتراضية',
      descriptionEn: 'Default payment method',
    },
    {
      key: 'enable_wallet_payment',
      value: true,
      valueType: 'BOOLEAN',
      category: 'PAYMENT',
      descriptionAr: 'تفعيل الدفع بالمحفظة',
      descriptionEn: 'Enable wallet payment',
    },
    {
      key: 'min_wallet_balance',
      value: 50,
      valueType: 'NUMBER',
      category: 'PAYMENT',
      descriptionAr: 'الحد الأدنى لرصيد المحفظة (أوقية)',
      descriptionEn: 'Minimum wallet balance (MRU)',
    },

    // Surge Pricing
    {
      key: 'enable_surge_pricing',
      value: true,
      valueType: 'BOOLEAN',
      category: 'PRICING',
      descriptionAr: 'تفعيل التسعير الديناميكي',
      descriptionEn: 'Enable surge pricing',
    },
    {
      key: 'max_surge_multiplier',
      value: 3.0,
      valueType: 'NUMBER',
      category: 'PRICING',
      descriptionAr: 'الحد الأقصى لمضاعف التسعير الديناميكي',
      descriptionEn: 'Maximum surge multiplier',
    },
    {
      key: 'surge_calculation_method',
      value: 'DEMAND_SUPPLY_RATIO',
      valueType: 'ENUM',
      category: 'PRICING',
      descriptionAr: 'طريقة حساب التسعير الديناميكي',
      descriptionEn: 'Surge calculation method',
    },

    // Driver Settings
    {
      key: 'min_driver_rating',
      value: 3.0,
      valueType: 'NUMBER',
      category: 'DRIVER',
      descriptionAr: 'الحد الأدنى لتقييم السائق',
      descriptionEn: 'Minimum driver rating',
    },
    {
      key: 'min_acceptance_rate',
      value: 70,
      valueType: 'NUMBER',
      category: 'DRIVER',
      descriptionAr: 'الحد الأدنى لمعدل قبول الرحلات (%)',
      descriptionEn: 'Minimum acceptance rate (%)',
    },
    {
      key: 'driver_idle_timeout_minutes',
      value: 30,
      valueType: 'NUMBER',
      category: 'DRIVER',
      descriptionAr: 'مهلة عدم النشاط للسائق (دقيقة)',
      descriptionEn: 'Driver idle timeout (minutes)',
    },

    // Notification Settings
    {
      key: 'enable_push_notifications',
      value: true,
      valueType: 'BOOLEAN',
      category: 'NOTIFICATION',
      descriptionAr: 'تفعيل الإشعارات الفورية',
      descriptionEn: 'Enable push notifications',
    },
    {
      key: 'enable_sms_notifications',
      value: false,
      valueType: 'BOOLEAN',
      category: 'NOTIFICATION',
      descriptionAr: 'تفعيل إشعارات الرسائل النصية',
      descriptionEn: 'Enable SMS notifications',
    },

    // Safety Settings
    {
      key: 'enable_sos_feature',
      value: true,
      valueType: 'BOOLEAN',
      category: 'SAFETY',
      descriptionAr: 'تفعيل ميزة الطوارئ SOS',
      descriptionEn: 'Enable SOS feature',
    },
    {
      key: 'sos_emergency_contacts',
      value: ['+222 12345678'],
      valueType: 'JSON',
      category: 'SAFETY',
      descriptionAr: 'أرقام الطوارئ',
      descriptionEn: 'Emergency contact numbers',
    },
    {
      key: 'enable_ride_sharing',
      value: false,
      valueType: 'BOOLEAN',
      category: 'SAFETY',
      descriptionAr: 'تفعيل مشاركة تفاصيل الرحلة',
      descriptionEn: 'Enable ride sharing',
    },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: setting,
      create: setting,
    });
    console.log(`✓ ${setting.key}`);
  }

  console.log('System settings seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding system settings:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
