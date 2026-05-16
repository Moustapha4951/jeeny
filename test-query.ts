import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  try {
    const latitude = 18.0;
    const longitude = -15.9;
    const radiusKm = 10;
    const drivers = await prisma.$queryRaw`
      SELECT "userId"
      FROM "Driver"
      WHERE 
        "isOnline" = true
        AND "currentLat" IS NOT NULL
        AND "currentLng" IS NOT NULL
        AND (
          6371 * acos(
            cos(radians(${latitude})) * 
            cos(radians("currentLat")) * 
            cos(radians("currentLng") - radians(${longitude})) + 
            sin(radians(${latitude})) * 
            sin(radians("currentLat"))
          )
        ) <= ${radiusKm}
    `;
    console.log(drivers);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
run();
