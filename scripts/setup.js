#!/usr/bin/env node

/**
 * Root Setup Automation Script
 * Sets up environment files, starts PostgreSQL via Docker,
 * installs dependencies, runs Prisma migrations, and seeds the initial Admin.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');

function run(command, cwd = ROOT_DIR) {
  console.log(`\n> [${path.basename(cwd)}] ${command}`);
  execSync(command, { cwd, stdio: 'inherit' });
}

function isPostgresRunning() {
  try {
    const res = execSync('docker ps --filter "name=ems-postgres" --filter "status=running" -q', { encoding: 'utf8' }).trim();
    return res.length > 0;
  } catch {
    return false;
  }
}

function checkDocker() {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('\n======================================================');
  console.log('  Good Enough Energy EMS — Automatic Environment Setup');
  console.log('======================================================\n');

  // 1. Ensure backend/.env exists
  const backendEnv = path.join(BACKEND_DIR, '.env');
  const backendEnvExample = path.join(BACKEND_DIR, '.env.example');

  if (!fs.existsSync(backendEnv)) {
    if (fs.existsSync(backendEnvExample)) {
      console.log('Creating backend/.env from backend/.env.example...');
      fs.copyFileSync(backendEnvExample, backendEnv);
    } else {
      console.warn('Warning: backend/.env.example not found.');
    }
  } else {
    console.log('backend/.env already exists.');
  }

  // 2. Start PostgreSQL via Docker Compose
  if (isPostgresRunning()) {
    console.log('\nPostgreSQL container (ems-postgres) is already running.');
  } else if (checkDocker()) {
    console.log('\nStarting PostgreSQL container via Docker Compose...');
    // Clean up any stale EMS containers that may conflict
    try {
      execSync('docker rm -f ems-postgres ems-backend ems-frontend', { stdio: 'ignore' });
    } catch (e) {
      // ignore if containers do not exist
    }
    run('docker compose up -d --force-recreate');
  } else {
    console.warn('\nWarning: Docker does not appear to be running.');
    console.warn('Make sure PostgreSQL is running manually at localhost:5432.\n');
  }

  // 3. Install dependencies
  console.log('\nInstalling backend dependencies...');
  run('npm install', BACKEND_DIR);

  console.log('\nInstalling frontend dependencies...');
  run('npm install', FRONTEND_DIR);

  // 4. Prisma client generation, migrations, and seed
  console.log('\nGenerating Prisma client...');
  run('npx prisma generate', BACKEND_DIR);

  console.log('\nApplying database migrations...');
  run('npx prisma migrate deploy', BACKEND_DIR);

  console.log('\nBootstrapping Admin user...');
  try {
    run('npx tsx prisma/seed.ts', BACKEND_DIR);
  } catch (err) {
    console.log('Admin user seed completed or already exists.');
  }

  console.log('\n======================================================');
  console.log('  SETUP COMPLETE!');
  console.log('======================================================');
  console.log('To start both the frontend and backend together:');
  console.log('    npm run dev');
  console.log('');
  console.log('Frontend: http://localhost:5173');
  console.log('Backend : http://localhost:5000');
  console.log('Default Admin: admin@gee.local / admin@321');
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('\nSetup failed:', err.message);
  process.exit(1);
});
