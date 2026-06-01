/**
 * Idempotent seed: ensures a bootstrap ADMIN account exists so the API has a
 * first principal capable of creating professors and other users.
 *
 * Run with: `npm run db:seed` (override creds via SEED_ADMIN_EMAIL /
 * SEED_ADMIN_PASSWORD). Change the password immediately in any real setting.
 */
import process from 'node:process';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@facevec.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin already present: ${email}`);
    return;
  }

  const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  await prisma.user.create({
    data: { email, passwordHash, displayName: 'Administrator', role: 'ADMIN' },
  });
  console.log(`Created admin: ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
