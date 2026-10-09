#!/bin/sh
set -e

echo "=== GEE EMS Backend Starting ==="

echo "Waiting for PostgreSQL at ${DB_HOST:-postgres}:${DB_PORT:-5432}..."
while ! nc -z ${DB_HOST:-postgres} ${DB_PORT:-5432}; do
  sleep 1
done
echo "PostgreSQL is reachable!"

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Bootstrapping Admin account..."
npx tsx prisma/seed.ts || true

echo "Starting Backend API on port 5000..."
exec node dist/server.js
