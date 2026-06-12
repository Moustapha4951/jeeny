const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = 'employer@jeeny.com';
  const phone = '+22245000000';
  const password = 'password123'; // stored in fcmToken for v1 employer auth

  let company = await prisma.company.findFirst();
  if (!company) {
    company = await prisma.company.create({
      data: {
        name: 'Jeeny Test Company',
        nameAr: 'شركة جيني للتجارب',
        address: 'Nouakchott',
        city: 'Nouakchott',
        registrationNumber: 'CR123456',
        contactPerson: 'Admin',
        contactPhone: '+22245000001',
        contactEmail: 'admin@jeeny.com',
      }
    });
    console.log('Created Company:', company.id);
  } else {
    console.log('Using existing Company:', company.id);
  }

  let user = await prisma.user.findUnique({ where: { email } });
  
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        phone,
        firstName: 'Test',
        lastName: 'Employer',
        fcmToken: password, // v1 stores password here
        consumer: {
          create: {
            companyId: company.id
          }
        },
        wallet: {
          create: {
            type: 'CONSUMER',
            balance: 10000,
            currency: 'MRU'
          }
        }
      }
    });
    console.log('Created Employer User!');
  } else {
    // Make sure they have a consumer/company link and password is correct
    await prisma.user.update({
      where: { id: user.id },
      data: { fcmToken: password }
    });
    
    let consumer = await prisma.consumer.findUnique({ where: { userId: user.id }});
    if (!consumer) {
      await prisma.consumer.create({ data: { userId: user.id, companyId: company.id }});
    } else if (!consumer.companyId) {
      await prisma.consumer.update({ where: { id: consumer.id }, data: { companyId: company.id }});
    }
    console.log('Updated existing Employer User!');
  }

  console.log('\n--- CREDENTIALS ---');
  console.log('Email:', email);
  console.log('Password:', password);
  console.log('-------------------\n');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
