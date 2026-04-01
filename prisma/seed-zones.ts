import { PrismaClient, ZoneType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding zones...');

  const zones = [
    // Nouakchott zones
    {
      name: 'Tevragh Zeina',
      nameAr: 'تفرغ زينة',
      nameFr: 'Tevragh Zeina',
      type: 'CITY' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-15.9789, 18.0935],
          [-15.9689, 18.0935],
          [-15.9689, 18.1035],
          [-15.9789, 18.1035],
          [-15.9789, 18.0935],
        ]],
      },
      center: { latitude: 18.0985, longitude: -15.9739 },
      isActive: true,
      surgeMultiplier: 1.0,
    },
    {
      name: 'Ksar',
      nameAr: 'القصر',
      nameFr: 'Ksar',
      type: 'CITY' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-15.9889, 18.0835],
          [-15.9789, 18.0835],
          [-15.9789, 18.0935],
          [-15.9889, 18.0935],
          [-15.9889, 18.0835],
        ]],
      },
      center: { latitude: 18.0885, longitude: -15.9839 },
      isActive: true,
      surgeMultiplier: 1.0,
    },
    {
      name: 'Sebkha',
      nameAr: 'السبخة',
      nameFr: 'Sebkha',
      type: 'CITY' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-15.9989, 18.0735],
          [-15.9889, 18.0735],
          [-15.9889, 18.0835],
          [-15.9989, 18.0835],
          [-15.9989, 18.0735],
        ]],
      },
      center: { latitude: 18.0785, longitude: -15.9939 },
      isActive: true,
      surgeMultiplier: 1.0,
    },
    {
      name: 'Arafat',
      nameAr: 'عرفات',
      nameFr: 'Arafat',
      type: 'CITY' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-15.9589, 18.0635],
          [-15.9489, 18.0635],
          [-15.9489, 18.0735],
          [-15.9589, 18.0735],
          [-15.9589, 18.0635],
        ]],
      },
      center: { latitude: 18.0685, longitude: -15.9539 },
      isActive: true,
      surgeMultiplier: 1.0,
    },
    {
      name: 'Dar Naim',
      nameAr: 'دار النعيم',
      nameFr: 'Dar Naim',
      type: 'CITY' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-15.9389, 18.0535],
          [-15.9289, 18.0535],
          [-15.9289, 18.0635],
          [-15.9389, 18.0635],
          [-15.9389, 18.0535],
        ]],
      },
      center: { latitude: 18.0585, longitude: -15.9339 },
      isActive: true,
      surgeMultiplier: 1.0,
    },
    {
      name: 'Toujounine',
      nameAr: 'توجنين',
      nameFr: 'Toujounine',
      type: 'CITY' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-15.9189, 18.0435],
          [-15.9089, 18.0435],
          [-15.9089, 18.0535],
          [-15.9189, 18.0535],
          [-15.9189, 18.0435],
        ]],
      },
      center: { latitude: 18.0485, longitude: -15.9139 },
      isActive: true,
      surgeMultiplier: 1.0,
    },
    {
      name: 'Nouakchott Airport',
      nameAr: 'مطار نواكشوط',
      nameFr: 'Aéroport de Nouakchott',
      type: 'AIRPORT' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-15.9489, 18.0985],
          [-15.9389, 18.0985],
          [-15.9389, 18.1085],
          [-15.9489, 18.1085],
          [-15.9489, 18.0985],
        ]],
      },
      center: { latitude: 18.1035, longitude: -15.9439 },
      isActive: true,
      surgeMultiplier: 1.5,
    },
    // Service areas
    {
      name: 'Nouakchott Service Area',
      nameAr: 'منطقة خدمة نواكشوط',
      nameFr: 'Zone de service Nouakchott',
      type: 'SERVICE_AREA' as ZoneType,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-16.0189, 18.0335],
          [-15.9089, 18.0335],
          [-15.9089, 18.1185],
          [-16.0189, 18.1185],
          [-16.0189, 18.0335],
        ]],
      },
      center: { latitude: 18.076, longitude: -15.9639 },
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
    } else {
      await prisma.zone.create({
        data: zone,
      });
    }
    console.log(`✓ ${zone.nameAr} (${zone.name})`);
  }

  console.log('Zones seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding zones:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
