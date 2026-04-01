import { PrismaClient, ZoneType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding comprehensive zones for Mauritania...');

  const zones = [
    // ===== CITIES =====
    {
      name: 'Nouakchott',
      nameAr: 'نواكشوط',
      nameFr: 'Nouakchott',
      type: 'CITY' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-16.0500, 18.0200],
          [-15.9000, 18.0200],
          [-15.9000, 18.1300],
          [-16.0500, 18.1300],
          [-16.0500, 18.0200],
        ]],
      },
      center: { latitude: 18.0735, longitude: -15.9582 },
      isActive: true,
      surgeMultiplier: 1.0,
    },
    {
      name: 'Nouadhibou',
      nameAr: 'نواذيبو',
      nameFr: 'Nouadhibou',
      type: 'CITY' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-17.0700, 20.8500],
          [-16.9000, 20.8500],
          [-16.9000, 20.9500],
          [-17.0700, 20.9500],
          [-17.0700, 20.8500],
        ]],
      },
      center: { latitude: 20.9000, longitude: -17.0300 },
      isActive: true,
      surgeMultiplier: 1.0,
    },

    // ===== NOUAKCHOTT NEIGHBORHOODS (Communes/مقاطعات) =====
    // Nouakchott Nord (North)
    {
      name: 'Tevragh Zeina',
      nameAr: 'تفرغ زينة',
      nameFr: 'Tevragh Zeina',
      type: 'NEIGHBORHOOD' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-15.9889, 18.0885],
          [-15.9689, 18.0885],
          [-15.9689, 18.1085],
          [-15.9889, 18.1085],
          [-15.9889, 18.0885],
        ]],
      },
      center: { latitude: 18.0985, longitude: -15.9789 },
      isActive: true,
      surgeMultiplier: 1.0,
    },
    {
      name: 'Ksar',
      nameAr: 'القصر',
      nameFr: 'Ksar',
      type: 'NEIGHBORHOOD' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-15.9989, 18.0785],
          [-15.9789, 18.0785],
          [-15.9789, 18.0985],
          [-15.9989, 18.0985],
          [-15.9989, 18.0785],
        ]],
      },
      center: { latitude: 18.0885, longitude: -15.9889 },
      isActive: true,
      surgeMultiplier: 1.0,
    },
    {
      name: 'Teyarett',
      nameAr: 'تيارت',
      nameFr: 'Teyarett',
      type: 'NEIGHBORHOOD' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-15.9589, 18.1085],
          [-15.9389, 18.1085],
          [-15.9389, 18.1285],
          [-15.9589, 18.1285],
          [-15.9589, 18.1085],
        ]],
      },
      center: { latitude: 18.1185, longitude: -15.9489 },
      isActive: true,
      surgeMultiplier: 1.0,
    },

    // Nouakchott Ouest (West)
    {
      name: 'Sebkha',
      nameAr: 'السبخة',
      nameFr: 'Sebkha',
      type: 'NEIGHBORHOOD' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-16.0089, 18.0685],
          [-15.9889, 18.0685],
          [-15.9889, 18.0885],
          [-16.0089, 18.0885],
          [-16.0089, 18.0685],
        ]],
      },
      center: { latitude: 18.0785, longitude: -15.9989 },
      isActive: true,
      surgeMultiplier: 1.0,
    },
    {
      name: 'El Mina',
      nameAr: 'الميناء',
      nameFr: 'El Mina',
      type: 'NEIGHBORHOOD' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-16.0189, 18.0785],
          [-15.9989, 18.0785],
          [-15.9989, 18.0985],
          [-16.0189, 18.0985],
          [-16.0189, 18.0785],
        ]],
      },
      center: { latitude: 18.0885, longitude: -16.0089 },
      isActive: true,
      surgeMultiplier: 1.0,
    },

    // Nouakchott Sud (South)
    {
      name: 'Arafat',
      nameAr: 'عرفات',
      nameFr: 'Arafat',
      type: 'NEIGHBORHOOD' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-15.9689, 18.0585],
          [-15.9489, 18.0585],
          [-15.9489, 18.0785],
          [-15.9689, 18.0785],
          [-15.9689, 18.0585],
        ]],
      },
      center: { latitude: 18.0685, longitude: -15.9589 },
      isActive: true,
      surgeMultiplier: 1.0,
    },
    {
      name: 'Dar Naim',
      nameAr: 'دار النعيم',
      nameFr: 'Dar Naim',
      type: 'NEIGHBORHOOD' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-15.9489, 18.0485],
          [-15.9289, 18.0485],
          [-15.9289, 18.0685],
          [-15.9489, 18.0685],
          [-15.9489, 18.0485],
        ]],
      },
      center: { latitude: 18.0585, longitude: -15.9389 },
      isActive: true,
      surgeMultiplier: 1.0,
    },
    {
      name: 'Toujounine',
      nameAr: 'توجنين',
      nameFr: 'Toujounine',
      type: 'NEIGHBORHOOD' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-15.9289, 18.0385],
          [-15.9089, 18.0385],
          [-15.9089, 18.0585],
          [-15.9289, 18.0585],
          [-15.9289, 18.0385],
        ]],
      },
      center: { latitude: 18.0485, longitude: -15.9189 },
      isActive: true,
      surgeMultiplier: 1.0,
    },
    {
      name: 'Riyadh',
      nameAr: 'الرياض',
      nameFr: 'Riyadh',
      type: 'NEIGHBORHOOD' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-15.9889, 18.0285],
          [-15.9689, 18.0285],
          [-15.9689, 18.0485],
          [-15.9889, 18.0485],
          [-15.9889, 18.0285],
        ]],
      },
      center: { latitude: 18.0385, longitude: -15.9789 },
      isActive: true,
      surgeMultiplier: 1.0,
    },

    // Additional Nouakchott neighborhoods
    {
      name: 'Hay Saken',
      nameAr: 'حي ساكن',
      nameFr: 'Hay Saken',
      type: 'NEIGHBORHOOD' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-15.9789, 18.0985],
          [-15.9589, 18.0985],
          [-15.9589, 18.1185],
          [-15.9789, 18.1185],
          [-15.9789, 18.0985],
        ]],
      },
      center: { latitude: 18.1085, longitude: -15.9689 },
      isActive: true,
      surgeMultiplier: 1.0,
    },
    {
      name: 'Socogim',
      nameAr: 'سوكوجيم',
      nameFr: 'Socogim',
      type: 'NEIGHBORHOOD' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-15.9989, 18.0985],
          [-15.9789, 18.0985],
          [-15.9789, 18.1185],
          [-15.9989, 18.1185],
          [-15.9989, 18.0985],
        ]],
      },
      center: { latitude: 18.1085, longitude: -15.9889 },
      isActive: true,
      surgeMultiplier: 1.0,
    },
    {
      name: 'Ilot K',
      nameAr: 'إيلوت ك',
      nameFr: 'Ilot K',
      type: 'NEIGHBORHOOD' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-15.9889, 18.0685],
          [-15.9689, 18.0685],
          [-15.9689, 18.0885],
          [-15.9889, 18.0885],
          [-15.9889, 18.0685],
        ]],
      },
      center: { latitude: 18.0785, longitude: -15.9789 },
      isActive: true,
      surgeMultiplier: 1.0,
    },
    {
      name: 'Cinquieme',
      nameAr: 'الخامس',
      nameFr: 'Cinquieme',
      type: 'NEIGHBORHOOD' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-15.9589, 18.0785],
          [-15.9389, 18.0785],
          [-15.9389, 18.0985],
          [-15.9589, 18.0985],
          [-15.9589, 18.0785],
        ]],
      },
      center: { latitude: 18.0885, longitude: -15.9489 },
      isActive: true,
      surgeMultiplier: 1.0,
    },
    {
      name: 'Sixieme',
      nameAr: 'السادس',
      nameFr: 'Sixieme',
      type: 'NEIGHBORHOOD' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-15.9389, 18.0785],
          [-15.9189, 18.0785],
          [-15.9189, 18.0985],
          [-15.9389, 18.0985],
          [-15.9389, 18.0785],
        ]],
      },
      center: { latitude: 18.0885, longitude: -15.9289 },
      isActive: true,
      surgeMultiplier: 1.0,
    },

    // ===== NOUADHIBOU NEIGHBORHOODS =====
    {
      name: 'Centre Ville Nouadhibou',
      nameAr: 'وسط المدينة نواذيبو',
      nameFr: 'Centre Ville',
      type: 'NEIGHBORHOOD' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-17.0500, 20.8900],
          [-17.0300, 20.8900],
          [-17.0300, 20.9100],
          [-17.0500, 20.9100],
          [-17.0500, 20.8900],
        ]],
      },
      center: { latitude: 20.9000, longitude: -17.0400 },
      isActive: true,
      surgeMultiplier: 1.0,
    },
    {
      name: 'Numerowatt',
      nameAr: 'نوميروات',
      nameFr: 'Numerowatt',
      type: 'NEIGHBORHOOD' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-17.0300, 20.8900],
          [-17.0100, 20.8900],
          [-17.0100, 20.9100],
          [-17.0300, 20.9100],
          [-17.0300, 20.8900],
        ]],
      },
      center: { latitude: 20.9000, longitude: -17.0200 },
      isActive: true,
      surgeMultiplier: 1.0,
    },
    {
      name: 'Cansado',
      nameAr: 'كانسادو',
      nameFr: 'Cansado',
      type: 'NEIGHBORHOOD' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-17.0100, 20.8900],
          [-16.9900, 20.8900],
          [-16.9900, 20.9100],
          [-17.0100, 20.9100],
          [-17.0100, 20.8900],
        ]],
      },
      center: { latitude: 20.9000, longitude: -17.0000 },
      isActive: true,
      surgeMultiplier: 1.0,
    },
    {
      name: 'Port Nouadhibou',
      nameAr: 'ميناء نواذيبو',
      nameFr: 'Port de Nouadhibou',
      type: 'NEIGHBORHOOD' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-17.0700, 20.8700],
          [-17.0500, 20.8700],
          [-17.0500, 20.8900],
          [-17.0700, 20.8900],
          [-17.0700, 20.8700],
        ]],
      },
      center: { latitude: 20.8800, longitude: -17.0600 },
      isActive: true,
      surgeMultiplier: 1.0,
    },
    {
      name: 'Boulenoir',
      nameAr: 'بولنوار',
      nameFr: 'Boulenoir',
      type: 'NEIGHBORHOOD' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-17.0500, 20.9100],
          [-17.0300, 20.9100],
          [-17.0300, 20.9300],
          [-17.0500, 20.9300],
          [-17.0500, 20.9100],
        ]],
      },
      center: { latitude: 20.9200, longitude: -17.0400 },
      isActive: true,
      surgeMultiplier: 1.0,
    },

    // ===== AIRPORTS =====
    {
      name: 'Nouakchott Airport',
      nameAr: 'مطار نواكشوط الدولي',
      nameFr: 'Aéroport International de Nouakchott',
      type: 'AIRPORT' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-15.9589, 18.0935],
          [-15.9389, 18.0935],
          [-15.9389, 18.1135],
          [-15.9589, 18.1135],
          [-15.9589, 18.0935],
        ]],
      },
      center: { latitude: 18.1035, longitude: -15.9489 },
      isActive: true,
      surgeMultiplier: 1.5,
    },
    {
      name: 'Nouadhibou Airport',
      nameAr: 'مطار نواذيبو الدولي',
      nameFr: 'Aéroport International de Nouadhibou',
      type: 'AIRPORT' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-17.0400, 20.9300],
          [-17.0200, 20.9300],
          [-17.0200, 20.9500],
          [-17.0400, 20.9500],
          [-17.0400, 20.9300],
        ]],
      },
      center: { latitude: 20.9400, longitude: -17.0300 },
      isActive: true,
      surgeMultiplier: 1.5,
    },

    // ===== SERVICE AREAS =====
    {
      name: 'Nouakchott Service Area',
      nameAr: 'منطقة خدمة نواكشوط',
      nameFr: 'Zone de service Nouakchott',
      type: 'SERVICE_AREA' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-16.0500, 18.0200],
          [-15.9000, 18.0200],
          [-15.9000, 18.1300],
          [-16.0500, 18.1300],
          [-16.0500, 18.0200],
        ]],
      },
      center: { latitude: 18.0750, longitude: -15.9750 },
      isActive: true,
      surgeMultiplier: 1.0,
    },
    {
      name: 'Nouadhibou Service Area',
      nameAr: 'منطقة خدمة نواذيبو',
      nameFr: 'Zone de service Nouadhibou',
      type: 'SERVICE_AREA' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-17.0700, 20.8500],
          [-16.9000, 20.8500],
          [-16.9000, 20.9500],
          [-17.0700, 20.9500],
          [-17.0700, 20.8500],
        ]],
      },
      center: { latitude: 20.9000, longitude: -17.0000 },
      isActive: true,
      surgeMultiplier: 1.0,
    },
  ];

  for (const zone of zones) {
    const existing = await prisma.zone.findFirst({
      where: { name: zone.name },
    });

    if (existing) {
      await prisma.zone.update({
        where: { id: existing.id },
        data: zone,
      });
      console.log(`✓ Updated: ${zone.nameAr} (${zone.name}) - ${zone.type}`);
    } else {
      await prisma.zone.create({
        data: zone,
      });
      console.log(`✓ Created: ${zone.nameAr} (${zone.name}) - ${zone.type}`);
    }
  }

  console.log('\n=== Summary ===');
  const cities = zones.filter(z => z.type === 'CITY').length;
  const neighborhoods = zones.filter(z => z.type === 'NEIGHBORHOOD').length;
  const airports = zones.filter(z => z.type === 'AIRPORT').length;
  const serviceAreas = zones.filter(z => z.type === 'SERVICE_AREA').length;
  
  console.log(`Cities: ${cities}`);
  console.log(`Neighborhoods: ${neighborhoods}`);
  console.log(`Airports: ${airports}`);
  console.log(`Service Areas: ${serviceAreas}`);
  console.log(`Total: ${zones.length}`);
  console.log('\nZones seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding zones:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
