import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const employees = await prisma.employee.findMany({
    include: {
      user: {
        select: {
          id: true,
          email: true,
          phone: true,
          fcmToken: true,
          passwordHash: true,
          firstName: true,
        },
      },
    },
  });

  console.log(`\n👥 Employees in DB: ${employees.length}\n`);
  for (const e of employees) {
    console.log('────────────────────────────────────────');
    console.log('User ID    :', e.user.id);
    console.log('Email      :', e.user.email);
    console.log('Phone      :', e.user.phone);
    console.log('Name       :', e.user.firstName);
    console.log('Role       :', e.role);
    console.log('Department :', e.department);
    console.log('Password   :', e.user.passwordHash ?? '(none)');
    console.log('Has fcmToken:', !!e.user.fcmToken);
    console.log(
      'fcmToken   :',
      e.user.fcmToken ? `${e.user.fcmToken.substring(0, 30)}…` : '(none)',
    );
  }
  console.log('────────────────────────────────────────');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
