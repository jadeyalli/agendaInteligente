import { PrismaClient } from '@prisma/client';

import { hashPassword } from '../src/lib/auth/password';

const prisma = new PrismaClient();

async function createSeedUser() {
  const email = process.env.SEED_USER_EMAIL;
  const password = process.env.SEED_USER_PASSWORD;

  if (!email || !password) {
    console.info('Skipping seed user creation: SEED_USER_EMAIL or SEED_USER_PASSWORD not provided.');
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    console.info(`Seed user ${normalizedEmail} already exists.`);
    return;
  }

  const passwordHash = hashPassword(password);

  await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      name: process.env.SEED_USER_NAME ?? 'Agenda Admin',
    },
  });

  console.info(`Seed user ${normalizedEmail} created.`);
}

async function main() {
  await createSeedUser();
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
