import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  const filePath = 'd:\\apps\\jeeny\\place.dart';
  const content = fs.readFileSync(filePath, 'utf-8');

  // Regex to match Place blocks
  const placeRegex = /Place\(\s*id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*description:\s*'([^']*)',\s*location:\s*const GeoPoint\(([^,]+),\s*([^)]+)\),\s*cityId:\s*'([^']+)',/g;

  let match;
  let count = 0;
  while ((match = placeRegex.exec(content)) !== null) {
    const id = match[1];
    const name = match[2];
    const description = match[3];
    const latitude = parseFloat(match[4]);
    const longitude = parseFloat(match[5]);
    const cityId = match[6];

    await prisma.place.upsert({
      where: { id },
      update: {
        name,
        description,
        latitude,
        longitude,
        cityId,
        isActive: true,
      },
      create: {
        id,
        name,
        description,
        latitude,
        longitude,
        cityId,
        isActive: true,
      },
    });
    count++;
  }

  console.log(`Seeded ${count} places successfully.`);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
