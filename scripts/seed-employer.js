/**
 * Seed script: Create Masar employer account
 *
 * Usage: node scripts/seed-employer.js
 *
 * Creates:
 *   User         email=masar@gmail.com, fcmToken=masar123 (used as password in v1)
 *   Consumer     linked to the user
 *   Company      name="مسار", status=ACTIVE
 *   Wallet       type=COMPANY, balance=0
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding employer account...');

  // 1. Upsert the Company
  let company = await prisma.company.findFirst({
    where: { registrationNumber: 'MASAR-001' },
  });

  if (!company) {
    company = await prisma.company.create({
      data: {
        name: 'Masar مسار',
        nameAr: 'مسار',
        registrationNumber: 'MASAR-001',
        contactPerson: 'مسار',
        contactPhone: '+22200000001',
        contactEmail: 'masar@gmail.com',
        address: 'نواكشوط، موريتانيا',
        city: 'نواكشوط',
        status: 'ACTIVE',
        isActive: true,
        billingType: 'PREPAID',
        creditLimit: 0,
        currentBalance: 0,
      },
    });
    console.log('✅ Company created:', company.id);
  } else {
    console.log('ℹ️  Company already exists:', company.id);
  }

  // 2. Upsert the User
  let user = await prisma.user.findUnique({
    where: { email: 'masar@gmail.com' },
    include: { consumer: true },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        phone: '+22200000001',   // placeholder phone
        phoneVerified: true,
        email: 'masar@gmail.com',
        firstName: 'مسار',
        lastName: 'شركة',
        isActive: true,
        // fcmToken stores the password for employer accounts in v1
        fcmToken: 'masar123',
      },
      include: { consumer: true },
    });
    console.log('✅ User created:', user.id);
  } else {
    // Update password if needed
    user = await prisma.user.update({
      where: { email: 'masar@gmail.com' },
      data: { fcmToken: 'masar123' },
      include: { consumer: true },
    });
    console.log('ℹ️  User already exists, password refreshed:', user.id);
  }

  // 3. Upsert Consumer linked to company
  let consumer = user.consumer;
  if (!consumer) {
    consumer = await prisma.consumer.create({
      data: {
        userId: user.id,
        companyId: company.id,
      },
    });
    console.log('✅ Consumer created:', consumer.id);
  } else if (consumer.companyId !== company.id) {
    consumer = await prisma.consumer.update({
      where: { userId: user.id },
      data: { companyId: company.id },
    });
    console.log('✅ Consumer linked to company:', consumer.id);
  } else {
    console.log('ℹ️  Consumer already linked to company:', consumer.id);
  }

  // 4. Create wallet for user if not exists
  const existingWallet = await prisma.wallet.findUnique({
    where: { userId: user.id },
  });
  if (!existingWallet) {
    await prisma.wallet.create({
      data: {
        userId: user.id,
        type: 'CONSUMER',
        balance: 0,
        currency: 'MRU',
      },
    });
    console.log('✅ Wallet created');
  } else {
    console.log('ℹ️  Wallet already exists');
  }

  console.log('\n🎉 Done! Employer account ready:');
  console.log('   Email:    masar@gmail.com');
  console.log('   Password: masar123');
  console.log('   Company:  مسار (', company.id, ')');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
