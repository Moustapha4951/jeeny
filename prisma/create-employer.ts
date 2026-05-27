import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Create a test employer account so we can log into the masar_employer_app.
 *
 * What this does:
 *   1. Creates a Company (or reuses if it already exists)
 *   2. Creates a User row with email + passwordHash stored in fcmToken
 *      (matches the auth flow in auth.controller.ts → employer/login)
 *   3. Creates a Consumer row linked to the company so the employer can
 *      book rides for any phone they enter through the app
 *   4. Adds an initial 50,000 MRU balance so test bookings succeed
 *
 * Run with:
 *   cd jeeny_backend
 *   npx ts-node prisma/create-employer.ts
 */
async function main() {
  console.log('🏢 Creating test employer account...\n');

  const COMPANY_NAME = 'شركة الاختبار';
  const EMAIL = 'test@masar.mr';
  const PASSWORD = 'masar1234';
  const PHONE = '+22245000001';
  const FIRST_NAME = 'مدير';
  const LAST_NAME = 'الاختبار';

  // 1. Company
  let company = await prisma.company.findFirst({
    where: { contactEmail: EMAIL },
  });

  if (!company) {
    company = await prisma.company.create({
      data: {
        name: 'Masar Test Company',
        nameAr: COMPANY_NAME,
        registrationNumber: `TEST-${Date.now()}`,
        contactPerson: `${FIRST_NAME} ${LAST_NAME}`,
        contactPhone: PHONE,
        contactEmail: EMAIL,
        address: 'نواكشوط، تفرغ زينة',
        city: 'Nouakchott',
        size: 'SMALL',
        status: 'ACTIVE',
        billingType: 'PREPAID',
        currentBalance: 50000,
        canConfigureDispatch: true,
        dispatchRadiusKm: 5,
        resendExpansionKm: 3,
      },
    });
    console.log('✅ Company created:', company.id);
  } else {
    company = await prisma.company.update({
      where: { id: company.id },
      data: {
        status: 'ACTIVE',
        isActive: true,
        currentBalance: 50000,
        canConfigureDispatch: true,
      },
    });
    console.log('♻️  Reused existing company:', company.id);
  }

  // 2. User
  let user = await prisma.user.findUnique({ where: { email: EMAIL } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: EMAIL,
        phone: PHONE,
        firstName: FIRST_NAME,
        lastName: LAST_NAME,
        // Password stored in fcmToken — see employerLogin in auth.controller.ts
        fcmToken: PASSWORD,
        isActive: true,
      },
    });
    console.log('✅ User created:', user.id);
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        firstName: FIRST_NAME,
        lastName: LAST_NAME,
        fcmToken: PASSWORD,
        isActive: true,
      },
    });
    console.log('♻️  Reused existing user:', user.id);
  }

  // 3. Consumer linked to company
  let consumer = await prisma.consumer.findUnique({
    where: { userId: user.id },
  });

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
      where: { id: consumer.id },
      data: { companyId: company.id },
    });
    console.log('♻️  Linked existing consumer to company:', consumer.id);
  } else {
    console.log('♻️  Consumer already linked:', consumer.id);
  }

  console.log('\n────────────────────────────────────────');
  console.log('🎉 Test employer account is ready');
  console.log('────────────────────────────────────────');
  console.log('Email:     ', EMAIL);
  console.log('Password:  ', PASSWORD);
  console.log('Company:   ', company.nameAr ?? company.name);
  console.log('Balance:   ', company.currentBalance.toString(), 'MRU');
  console.log('Login URL: ', '/auth/employer/login');
  console.log('────────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error('❌ Error creating employer:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
