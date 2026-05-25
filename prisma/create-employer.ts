import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Create an employer (company) account for testing.
 *
 * Employer login flow (per auth.controller.ts):
 *   - Endpoint: POST /auth/employer/login  { email, password }
 *   - The User must have an `email`
 *   - The password is stored in the `fcmToken` field (v1 design)
 *   - The User must have a Consumer record linked to a Company (companyId)
 */
async function main() {
  // ── Configurable test credentials ──
  const EMAIL = 'employer@masar.test';
  const PASSWORD = 'masar2026';
  const COMPANY_NAME = 'شركة مسار للنقل';
  const COMPANY_NAME_EN = 'Masar Transport Company';
  const PHONE = '+22231112233';
  const FIRST_NAME = 'مدير';
  const LAST_NAME = 'الشركة';

  console.log('🏢 Creating employer account...\n');

  // ── 1. Create or find the company ──
  let company = await prisma.company.findFirst({
    where: { name: COMPANY_NAME },
  });

  if (!company) {
    company = await prisma.company.create({
      data: {
        name: COMPANY_NAME,
        nameAr: COMPANY_NAME,
        registrationNumber: `RC-${Date.now()}`,
        taxId: 'TAX-MASAR-001',
        industry: 'Transportation',
        size: 'MEDIUM',
        contactPerson: `${FIRST_NAME} ${LAST_NAME}`,
        contactPhone: PHONE,
        contactEmail: EMAIL,
        address: 'حي تفرغ زينة',
        city: 'نواكشوط',
        status: 'ACTIVE',
        isActive: true,
        billingType: 'PREPAID',
        creditLimit: 100000,
        currentBalance: 50000,
        paymentTermDays: 30,
        canConfigureDispatch: true,
        dispatchRadiusKm: 5.0,
        resendExpansionKm: 2.0,
      },
    });
    console.log('✅ Company created:', company.name, '(', company.id, ')');
  } else {
    console.log('ℹ️  Company already exists:', company.name);
  }

  // ── 2. Create or update the User ──
  let user = await prisma.user.findFirst({
    where: { email: EMAIL },
    include: { consumer: true },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: EMAIL,
        phone: PHONE,
        phoneVerified: true,
        firstName: FIRST_NAME,
        lastName: LAST_NAME,
        language: 'AR',
        isActive: true,
        // Password is stored in fcmToken field for employer accounts (v1)
        fcmToken: PASSWORD,
      },
      include: { consumer: true },
    });
    console.log('✅ User created:', user.email);
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        firstName: FIRST_NAME,
        lastName: LAST_NAME,
        fcmToken: PASSWORD,
        isActive: true,
        phoneVerified: true,
      },
      include: { consumer: true },
    });
    console.log('ℹ️  User updated:', user.email);
  }

  // ── 3. Create or update the Consumer linked to the company ──
  if (!user.consumer) {
    await prisma.consumer.create({
      data: {
        userId: user.id,
        companyId: company.id,
        rating: 5.0,
        totalTrips: 0,
        totalSpent: 0,
        preferredPayment: 'COMPANY_ACCOUNT',
      },
    });
    console.log('✅ Consumer profile linked to company');
  } else if (user.consumer.companyId !== company.id) {
    await prisma.consumer.update({
      where: { id: user.consumer.id },
      data: { companyId: company.id },
    });
    console.log('✅ Consumer profile updated with company link');
  } else {
    console.log('ℹ️  Consumer profile already linked');
  }

  // ── 4. Ensure wallet exists ──
  const wallet = await prisma.wallet.findUnique({
    where: { userId: user.id },
  });
  if (!wallet) {
    await prisma.wallet.create({
      data: {
        userId: user.id,
        type: 'CONSUMER',
        balance: 0,
        currency: 'MRU',
      },
    });
    console.log('✅ Wallet created');
  }

  // ── Done ──
  console.log('\n══════════════════════════════════════════════════');
  console.log('🎉 Employer account ready!');
  console.log('══════════════════════════════════════════════════');
  console.log('Login URL:  https://api.chaddistore.com/auth/employer/login');
  console.log('Email:      ', EMAIL);
  console.log('Password:   ', PASSWORD);
  console.log('Company:    ', company.name);
  console.log('Phone:      ', PHONE);
  console.log('══════════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('❌ Error creating employer account:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
