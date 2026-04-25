const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const drivers = await prisma.driver.findMany({ include: { vehicles: true } });
  console.log('Drivers:', JSON.stringify(drivers, null, 2));
  
  const vehicleTypes = await prisma.vehicleType.findMany();
  console.log('VehicleTypes:', JSON.stringify(vehicleTypes, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
