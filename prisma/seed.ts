import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedUser(opts: {
  role: UserRole;
  username: string;
  email: string;
  password: string;
  fullName: string;
  skipIfRoleExists?: boolean;
}) {
  const existing = await prisma.user.findFirst({
    where: opts.skipIfRoleExists
      ? { OR: [{ role: opts.role }, { username: opts.username }] }
      : { username: opts.username },
  });
  if (existing) {
    console.log(
      `${opts.role} user already exists (username: ${existing.username}). Skipping.`,
    );
    return;
  }

  const passwordHash = await bcrypt.hash(opts.password, 10);

  const user = await prisma.user.create({
    data: {
      username: opts.username,
      email: opts.email,
      fullName: opts.fullName,
      passwordHash,
      role: opts.role,
    },
  });

  console.log(`Seeded ${user.role} user:`);
  console.log({
    username: user.username,
    email: user.email,
    role: user.role,
  });
}

async function main() {
  await seedUser({
    role: UserRole.ADMIN,
    username: process.env.SEED_ADMIN_USERNAME || 'admin',
    email: process.env.SEED_ADMIN_EMAIL || 'admin@example.com',
    password: process.env.SEED_ADMIN_PASSWORD || 'admin123',
    fullName: 'System Administrator',
  });

  await seedUser({
    role: UserRole.MANAGER,
    username: process.env.SEED_MANAGER_USERNAME || 'manager',
    email: process.env.SEED_MANAGER_EMAIL || 'manager@example.com',
    password: process.env.SEED_MANAGER_PASSWORD || 'manager123',
    fullName: 'Pharmacy Manager',
  });

  await seedUser({
    role: UserRole.SELLER,
    username: process.env.SEED_SELLER_USERNAME || 'seller',
    email: process.env.SEED_SELLER_EMAIL || 'seller@example.com',
    password: process.env.SEED_SELLER_PASSWORD || 'seller123',
    fullName: 'Pharmacy Seller',
  });

  console.log('Login with these credentials, then change the passwords.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
