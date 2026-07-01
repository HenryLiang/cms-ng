/**
 * One-off QA account seeder for cms_ng_qa.
 *
 * Idempotent: upserts the 6 canonical QA accounts. Safe to re-run.
 * Run with: cd backend && npx ts-node prisma/seed-qa-accounts.ts
 */
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const PASSWORD = 'Test@2026';

const ACCOUNTS: Array<{ email: string; name: string; role: UserRole }> = [
  { email: 'qa-admin@01.com',          name: 'QA Admin',          role: UserRole.ADMIN },
  { email: 'qa-editor@01.com',         name: 'QA Editor',         role: UserRole.EDITOR },
  { email: 'qa-reporter-sc@01.com',    name: 'QA Reporter SC',    role: UserRole.REPORTER },
  { email: 'qa-reporter-en@01.com',    name: 'QA Reporter EN',    role: UserRole.REPORTER },
  { email: 'qa-reporter-hk@01.com',    name: 'QA Reporter HK',    role: UserRole.REPORTER },
  { email: 'qa-reporter-none@01.com',  name: 'QA Reporter None',  role: UserRole.REPORTER },
];

async function main() {
  const prisma = new PrismaClient();
  const passwordHash = bcrypt.hashSync(PASSWORD, 10);
  console.log(`Seeding ${ACCOUNTS.length} QA accounts (password: ${PASSWORD})…`);

  for (const acc of ACCOUNTS) {
    const u = await prisma.user.upsert({
      where: { email: acc.email },
      update: { name: acc.name, role: acc.role, passwordHash, isActive: true },
      create: {
        email: acc.email,
        name: acc.name,
        role: acc.role,
        passwordHash,
        isActive: true,
        preferredLanguage: 'TRADITIONAL_CHINESE_HK',
      },
    });
    console.log(`  ✓ ${u.email.padEnd(28)} role=${u.role.padEnd(8)} id=${u.id}`);
  }

  // Make sure registration is OPEN so registration-switch test can toggle freely.
  // Registration status is stored in Redis; we'll just note it for the runner.
  console.log('Done.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
