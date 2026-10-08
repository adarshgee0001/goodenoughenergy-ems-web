# Good Enough Energy EMS

## Overview

The Good Enough Energy (GEE) EMS platform is an Energy Management System designed for monitoring, managing, and analyzing Battery Energy Storage Systems (BESS) and energy telemetry in real-time.

---

## Architecture

```text
Frontend (React 19 / Vite 8)
        │
        │ REST API + Socket.IO WebSockets
        ▼
Backend (Express 5 / Node.js 20)
        │
        ├─── MQTT Client (HiveMQ)
        │
        └─── Prisma ORM 6
                 │
                 ▼
             PostgreSQL 17
```

### Telemetry Flow

```text
BESS / EMU
   ↓
MQTT Broker (HiveMQ)
   ↓
Backend MQTT Ingestion
   ↓
Signal Normalization & Guard Validation
   ↓
PostgreSQL
   ↓
REST API + Socket.IO Broadcast
   ↓
Frontend Real-Time Dashboard
```

---

## Technology Stack

### Frontend
* **Framework**: React 19, Vite 8, TypeScript 6
* **Styling**: Tailwind CSS 4
* **Charts & Visuals**: Recharts 3, Three.js / React Three Fiber
* **Icons & Animation**: Lucide React, Framer Motion, GSAP

### Backend
* **Runtime & Server**: Node.js 20, Express 5, TypeScript 7
* **ORM & Database**: Prisma 6, PostgreSQL 17
* **Real-time & Messaging**: Socket.IO 4, MQTT.js 5
* **Security & Auth**: JWT, bcryptjs, HTTP-only Cookies
* **Testing**: Vitest 5

---

## Repository Structure

```text
.
├── .github/
│   └── workflows/
│       └── ci.yml             # GitHub Actions CI pipeline (parallel backend & frontend)
├── backend/                   # Node.js Express backend
│   ├── prisma/                # Prisma schema, 17 migrations, and seed scripts
│   ├── scripts/               # Diagnostic, debug, and maintenance utilities
│   ├── src/                   # Express routes, controllers, middleware, and services
│   ├── tests/                 # Vitest test suites (unit & integration)
│   ├── Dockerfile             # Multi-stage production container build
│   └── docker-entrypoint.sh   # Container startup script (migrations + seed + server)
├── frontend/                  # React Vite frontend
│   ├── public/                # Static public assets
│   ├── src/                   # React components, pages, contexts, and hooks
│   ├── nginx.conf             # Nginx reverse proxy & SPA router configuration
│   └── Dockerfile             # Multi-stage Nginx container build
├── scripts/
│   └── setup.js               # Cross-platform automated local setup script
├── docker-compose.yml         # Multi-container orchestration (PostgreSQL + Backend + Frontend)
├── package.json               # Root monorepo orchestrator (npm run setup, dev, test, build)
├── .gitignore                 # Git ignore rules protecting secrets and build artifacts
└── README.md                  # Project documentation
```

---

## Quick Start (Run Anywhere)

### Option A: 1-Command Run with Docker (Zero Installation)

If you have Docker installed, you can spin up the entire application (**PostgreSQL + Backend + Frontend**) with a single command:

```bash
docker compose up --build
```

* **Frontend Dashboard**: [http://localhost:5173](http://localhost:5173)
* **Backend API**: [http://localhost:5000](http://localhost:5000)
* **Default Admin Credentials**:
  * **Email**: `admin@gee.local`
  * **Password**: `admin@321`

> Database migrations and the default admin user are automatically provisioned on startup.

To stop the containers:
```bash
docker compose down
```

---

### Option B: Local Development with Node.js

#### Step 1: Automated Setup (Run Once)
```bash
npm run setup
```
This single script automatically:
1. Copies `backend/.env.example` to `backend/.env` if not already present.
2. Ensures the PostgreSQL container is running via Docker.
3. Installs backend and frontend dependencies.
4. Generates Prisma Client (`npx prisma generate`).
5. Deploys all 17 schema migrations (`npx prisma migrate deploy`).
6. Seeds the default admin account.

#### Step 2: Start Development Servers
```bash
npm run dev
```
Runs both the backend API and frontend Vite dev server concurrently in a single terminal with live hot-reloading (HMR).

---

## Root Commands Reference

| Command | Action |
| :--- | :--- |
| `npm run setup` | Automated end-to-end setup (Docker DB + npm install + migrations + seed) |
| `npm run dev` | Runs backend (`localhost:5000`) and frontend (`localhost:5173`) concurrently |
| `npm run build` | Compiles TypeScript for backend and builds the production frontend bundle |
| `npm run test` | Runs backend Vitest unit tests |
| `npm run lint` | Runs frontend code linter (`oxlint`) |
| `npm run db:up` | Starts only the PostgreSQL container in the background |
| `npm run db:down` | Stops the PostgreSQL container |
| `npm run db:migrate`| Applies pending Prisma migrations to the database |
| `npm run db:seed` | Seeds the database with the default Admin user |
| `docker compose up --build` | Full-stack containerized run (PostgreSQL + Backend + Frontend) |

---

## Environment Configuration

* Environment-specific secrets remain in local `.env` files.
* Local `.env` files must **NEVER** be committed to source control.
* Use `backend/.env.example` as a template for setting up local variables.

### Required Environment Variables

| Variable | Description |
| :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string (`postgresql://user:pass@host:5432/ems?schema=public`) |
| `JWT_SECRET` | Secret key used for signing authentication tokens |
| `JWT_EXPIRES_IN` | Token expiration duration (default: `1d`) |
| `CORS_ORIGIN` | Allowed frontend origins (e.g. `http://localhost:5173`) |
| `MQTT_BROKER_URL` | Broker URL (e.g. `mqtts://...s1.eu.hivemq.cloud`) |
| `MQTT_PORT` | Broker port (default: `8883`) |
| `MQTT_USERNAME` | HiveMQ broker username |
| `MQTT_PASSWORD` | HiveMQ broker password |
| `VITE_API_URL` | Backend URL for frontend builds (e.g. `http://localhost:5000`) |

---

## CI/CD Pipeline

Continuous Integration is automated via GitHub Actions in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

The pipeline runs parallel jobs on every push and pull request to `main`, `master`, `staging`, and `debug_deploy`:

1. **`backend-ci`**:
   - Spins up a live PostgreSQL 17 container service.
   - Generates Prisma client bindings.
   - Tests migration deployment (`npx prisma migrate deploy`).
   - Tests admin user seeding (`npx tsx prisma/seed.ts`).
   - Runs Vitest unit tests.
   - Verifies TypeScript compilation (`npm run build`).

2. **`frontend-ci`**:
   - Installs dependencies.
   - Runs linting checks (`oxlint`).
   - Builds production Vite bundle with build environment validation.

---

## Free Cloud Deployment Guide

Because the backend maintains persistent MQTT broker connections and WebSockets, a persistent container host is recommended.

```text
┌───────────────────────────────┐
│       Frontend (Vite)         │
│  • Firebase Hosting (FREE)    │
│  • OR Vercel (FREE)           │
└───────────────┬───────────────┘
                │ REST / WebSockets
┌───────────────▼───────────────┐
│       Backend (Express)       │
│  • Render.com (FREE Tier)     │
│  • OR Koyeb (FREE Tier)       │
└───────────────┬───────────────┘
                │ Prisma ORM
┌───────────────▼───────────────┐
│     Database (PostgreSQL)     │
│  • Neon.tech (FREE Tier)      │
│  • OR Supabase (FREE Tier)    │
└───────────────────────────────┘
```

### 1. Database (Neon or Supabase)
1. Create a free PostgreSQL database at [Neon.tech](https://neon.tech) or [Supabase](https://supabase.com).
2. Copy your connection string.
3. Set `DATABASE_URL` in your backend environment variables.

### 2. Backend (Render.com Web Service)
1. Connect your GitHub repository to [Render](https://render.com).
2. Create a new **Web Service**:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npx prisma generate && npm run build`
   - **Start Command**: `npx prisma migrate deploy && npm run start`
3. Configure environment variables (`DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `MQTT_*`).

### 3. Frontend (Firebase Hosting or Vercel)

#### Using Vercel (Recommended):
1. Import repository on [Vercel](https://vercel.com).
2. Set **Root Directory**: `frontend`.
3. Set Environment Variable: `VITE_API_URL=https://your-backend.onrender.com`.
4. Deploy.

#### Using Firebase Hosting:
```bash
npm install -g firebase-tools
cd frontend
firebase login
firebase init hosting   # Set public directory to 'dist', configure as SPA: Yes
npm run build
firebase deploy --only hosting
```

---

## Security Guidelines

* **Never commit `.env` files.**
* **Never commit production credentials or JWT secrets.**
* **Never place MQTT credentials or BESS hardware IDs in public documentation.**
* Keep temporary testing and diagnostic scripts within `backend/scripts/scratch/` (ignored by Git).
* Verify `git status` before committing to prevent accidental secret leakage.
