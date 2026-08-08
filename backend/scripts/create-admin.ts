/**
 * Super-admin bootstrap script (issue #105 follow-up).
 *
 * Creates or repairs a privileged account directly via Prisma — there is
 * intentionally NO self-serve role-elevation API (public registration always
 * yields REPORTER), so provisioning a SUPER_ADMIN must happen out-of-band on the
 * host with DB access.
 *
 * Usage:
 *   ADMIN_EMAIL=ops@example.com ADMIN_PASSWORD='s3cret!' npx ts-node scripts/create-admin.ts
 *
 * Behavior:
 *   - email does not exist  → create user with role=SUPER_ADMIN
 *   - email exists          → reset password + ensure role=SUPER_ADMIN + isActive=true
 *     (this is the supported recovery path when all admins are locked out)
 *
 * Required env: DATABASE_URL (Prisma), ADMIN_EMAIL, ADMIN_PASSWORD.
 * The password is hashed with bcrypt (12 rounds); it is never logged.
 */
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Super Admin';

  if (!email || !password) {
    console.error('ADMIN_EMAIL 和 ADMIN_PASSWORD 必须设置');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('ADMIN_PASSWORD 至少 8 位(不要用弱口令)');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL 未设置');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, name, passwordHash, role: UserRole.SUPER_ADMIN },
      update: { passwordHash, role: UserRole.SUPER_ADMIN, isActive: true },
      select: { id: true, email: true, role: true, isActive: true },
    });
    console.log(
      `超级管理员账号已就绪: ${user.email} (role=${user.role}, active=${user.isActive})`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('超级管理员初始化失败:', e instanceof Error ? e.message : e);
  process.exit(1);
});
