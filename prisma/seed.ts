import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const existingAdmin = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN },
  });
  if (existingAdmin) {
    console.log('Admin user already exists. Skipping seed.');
    return;
  }

  const username = process.env.SEED_ADMIN_USERNAME || 'admin';
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'admin123';

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.create({
    data: {
      username,
      email,
      fullName: 'System Administrator',
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  console.log('Seeded admin user:');
  console.log({
    username: admin.username,
    email: admin.email,
    role: admin.role,
  });
  console.log('Login with these credentials, then change the password.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
