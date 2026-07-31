/**
 * One-off QA account seeder for cms_ng_qa.
 *
 * Idempotent: upserts the 6 canonical QA accounts. Safe to re-run.
 * Run with: cd backend && npx ts-node prisma/seed-qa-accounts.ts
 */
// Load backend/.env explicitly: the safety check below reads DATABASE_URL
// BEFORE PrismaClient is constructed, so we cannot rely on @prisma/client's
// require-time .env autoload (adversarial review, round 2).
import 'dotenv/config';
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
  // Safety rail (adversarial review): this seeder plants PUBLICLY KNOWN
  // credentials (the repo is public, password is in this file) including an
  // ADMIN account. It must never run against a non-QA database by accident.
  // Allowed only when DATABASE_URL points at a `cms_ng_qa` database, or when
  // explicitly overridden with --confirm-i-know-this-is-qa.
  const dbUrl = process.env.DATABASE_URL ?? '';
  const confirmed = process.argv.includes('--confirm-i-know-this-is-qa');
  // Parse the URL and compare ONLY the database name — a substring regex
  // would also pass when "cms_ng_qa" appears in the password or host of a
  // production URL (adversarial review, round 2).
  let dbName = '';
  try {
    dbName = new URL(dbUrl).pathname.replace(/^\//, '');
  } catch {
    dbName = '';
  }
  if (!confirmed && dbName !== 'cms_ng_qa') {
    console.error(
      '拒绝执行:DATABASE_URL 未指向 cms_ng_qa 数据库。\n' +
        '本脚本会写入公开仓库里已知的账号凭证(含 ADMIN),只允许用于 QA 库。\n' +
        '如确认目标是 QA 库,请加 --confirm-i-know-this-is-qa 重试。',
    );
    process.exit(1);
  }

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
  // Registration status is stored in MySQL (RegistrationSwitch table).
  console.log('Done.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
