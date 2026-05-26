import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Create a finance/recharge-review Employee account for testing the
 * masar_employer_app login flow.
 *
 * Run with:
 *   cd jeeny_backend
 *   npx ts-node prisma/create-employee.ts
 *
 * Then login in masar_employer_app with:
 *   email:    finance@masar.mr
 *   password: masar2026
 */
async function main() {
  const email = 'finance@masar.mr';
  const password = 'masar2026';
  const employeeNumber = 'EMP-FINANCE-001';

  console.log('🔐 Creating employee account...\n');

  // 1. User
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      // Plain text in v1; hash later before going public.
      passwordHash: password,
      firstName: 'محمد',
      lastName: 'الموظف',
      isActive: true,
    },
    create: {
      email,
      phone: '+22200000001', // unique placeholder
      firstName: 'محمد',
      lastName: 'الموظف',
      passwordHash: password,
      isActive: true,
    },
  });

  // 2. Wallet (employees still get one for any internal credits)
  await prisma.wallet.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      balance: 0,
      currency: 'MRU',
      type: 'CONSUMER',
    },
  });

  // 3. Employee record
  const employee = await prisma.employee.upsert({
    where: { userId: user.id },
    update: {
      role: 'FINANCE',
      department: 'Finance',
    },
    create: {
      userId: user.id,
      employeeId: employeeNumber,
      role: 'FINANCE',
      department: 'Finance',
      salary: 0,
      hireDate: new Date(),
    },
  });

  console.log('✅ Employee ready');
  console.log('────────────────────────────────────────');
  console.log('Email:      ', email);
  console.log('Password:   ', password);
  console.log('User ID:    ', user.id);
  console.log('Employee ID:', employee.id);
  console.log('Role:       ', employee.role);
  console.log('────────────────────────────────────────');
  console.log('\nLogin in masar_employer_app with the email + password above.');
}

main()
  .catch((e) => {
    console.error('❌ Failed to create employee:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
