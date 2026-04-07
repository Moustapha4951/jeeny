import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Adding comprehensive system settings...');

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
      create: setting as any,
    });
  }

  console.log('✅ Added/Updated 61 system settings across 8 categories');
  console.log('   • DRIVER_ASSIGNMENT (7 settings)');
  console.log('   • RIDE (7 settings)');
  console.log('   • PAYMENT (6 settings)');
  console.log('   • PRICING (11 settings)');
  console.log('   • DRIVER (8 settings)');
  console.log('   • NOTIFICATION (7 settings)');
  console.log('   • SAFETY (7 settings)');
  console.log('   • GENERAL (8 settings)');
}

main()
  .catch((e) => {
    console.error('❌ Error adding settings:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
