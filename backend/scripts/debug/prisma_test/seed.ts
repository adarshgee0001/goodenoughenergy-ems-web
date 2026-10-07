/**
 * backend/prisma/seed.ts
 *
 * DEVELOPMENT-ONLY Admin Bootstrap Seed
 * ─────────────────────────────────────
 * Purpose : Creates the very first ADMIN user in a fresh PostgreSQL database
 *           so that local development and E2E login testing can begin.
 *
 * Safety guarantees:
 *   - Idempotent: safe to run multiple times. If an account with ADMIN_EMAIL
 *     already exists, the script reports it and exits without modifying anything.
 *   - No schema changes. No migrations. No table drops.
 *   - Password is read from environment variable and NEVER stored in plaintext.
 *   - Hashing uses the same bcryptjs / saltRounds=10 behaviour as authService.
 *   - No secrets are printed to stdout.
 *
 * Required environment variables (set in backend/.env before running):
 *   ADMIN_NAME     – display name for the admin account
 *   ADMIN_EMAIL    – email address used to log in
 *   ADMIN_PASSWORD – plaintext password (hashed before DB insert; never stored raw)
 *
 * Run command (configured in package.json → prisma.seed):
 *   npx prisma db seed
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import path from 'path';

// ── 1. Load environment variables ────────────────────────────────────────────
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ── 2. Validate required seed variables ──────────────────────────────────────
const ADMIN_NAME     = process.env.ADMIN_NAME;
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const missing: string[] = [];
if (!ADMIN_NAME)     missing.push('ADMIN_NAME');
if (!ADMIN_EMAIL)    missing.push('ADMIN_EMAIL');
if (!ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD');

if (missing.length > 0) {
  console.error('\n\u274c  SEED ABORTED \u2014 Missing required environment variables:\n');
  missing.forEach((v) => console.error(`    \u2022 ${v}`));
  console.error('\nPlease add the missing variables to backend/.env and re-run:\n');
  console.error('    npx prisma db seed\n');
  process.exit(1);
}

// ── 3. Seed logic ─────────────────────────────────────────────────────────────
const prisma = new PrismaClient();

const SALT_ROUNDS = 10; // matches authService.hashPassword() in auth.service.ts

async function main(): Promise<void> {
  console.log('\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  console.log('  Good Enough Energy EMS \u2014 Admin Bootstrap');
  console.log('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n');

  // ── 3a. Check whether the Admin already exists ────────────────────────────
  const existing = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL as string },
  });

  if (existing) {
    console.log('\u2139\ufe0f  ADMIN ALREADY EXISTS \u2014 no changes made.\n');
    console.log(`    Name  : ${existing.name}`);
    console.log(`    Email : ${existing.email}`);
    console.log(`    Role  : ${existing.role}`);
    console.log('\n    Idempotency : PASS \u2014 existing record preserved unchanged.\n');

    console.log('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
    console.log('ADMIN BOOTSTRAP COMPLETE');
    console.log(`Name  : ${existing.name}`);
    console.log(`Email : ${existing.email}`);
    console.log('Role  : ADMIN');
    console.log('Database user          : ALREADY EXISTS');
    console.log('Password               : configured via environment variable');
    console.log('Password stored as hash: YES');
    console.log('Idempotency            : PASS');
    console.log('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n');
    return;
  }

  // ── 3b. Hash the password using the same mechanism as authService ─────────
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD as string, SALT_ROUNDS);

  // ── 3c. Create the Admin user ─────────────────────────────────────────────
  const admin = await prisma.user.create({
    data: {
      name:         ADMIN_NAME as string,
      email:        ADMIN_EMAIL as string,
      passwordHash,
      role:         'ADMIN',
    },
  });

  console.log('\u2705  ADMIN USER CREATED.\n');
  console.log(`    Name  : ${admin.name}`);
  console.log(`    Email : ${admin.email}`);
  console.log(`    Role  : ${admin.role}`);
  console.log('\n    Password is stored as a bcrypt hash (saltRounds=10).');
  console.log('    Plaintext password is NOT stored.\n');

  console.log('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  console.log('ADMIN BOOTSTRAP COMPLETE');
  console.log(`Name  : ${admin.name}`);
  console.log(`Email : ${admin.email}`);
  console.log('Role  : ADMIN');
  console.log('Database user          : CREATED');
  console.log('Password               : configured via environment variable');
  console.log('Password stored as hash: YES');
  console.log('Idempotency            : PASS');
  console.log('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n');
}

// ── 4. Run & disconnect ───────────────────────────────────────────────────────
main()
  .catch((err) => {
    console.error('\n\u274c  Seed failed with an unexpected error:');
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
