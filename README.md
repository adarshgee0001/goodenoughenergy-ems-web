# Good Enough Energy EMS

## Overview

The Good Enough Energy (GEE) EMS platform is an Energy Management System designed for monitoring, managing, and analyzing Battery Energy Storage Systems (BESS) and energy telemetry in real-time.

---

## Architecture

```text
Frontend (React/Vite)
        |
        | REST API + Socket.IO
        v
Backend (Express)
        |
        +---- MQTT / HiveMQ
        |
        +---- Prisma
                 |
                 v
             PostgreSQL
```

### Telemetry Flow

```text
BESS / EMU
   ↓
MQTT
   ↓
Backend MQTT ingestion
   ↓
Telemetry normalization
   ↓
PostgreSQL
   ↓
REST API + WebSocket
   ↓
Frontend dashboard
```

---

## Technology Stack

### Frontend
* React 19
* Vite 8
* TypeScript 6
* Tailwind CSS 4
* Recharts 3

### Backend
* Node.js
* Express 5
* TypeScript 7
* Prisma 6
* PostgreSQL
* MQTT client
* Socket.IO 4
* Vitest 5

---

## Repository Structure

```text
.
├── .github/              # GitHub repository automation/workflows
├── backend/              # Node.js backend (independent npm project)
│   ├── prisma/           # Database schema, migrations, and seed scripts
│   ├── scripts/          
│   │   ├── debug/        # Manual diagnostic and debugging utilities
│   │   ├── operations/   # Operational and maintenance scripts
│   │   └── scratch/      # Temporary investigation/testing files (Do not commit)
│   ├── src/              # Core API, WebSocket, and backend services
│   └── tests/            # Automated test suites (Vitest)
├── frontend/             # React/Vite frontend (independent npm project)
│   ├── public/           # Public frontend assets
│   └── src/              # Frontend application source code
├── .gitignore            # Git ignore rules protecting secrets and artifacts
└── README.md             # Project documentation
```

*Note: The `frontend/` and `backend/` are independent npm projects, not an npm workspace.*

---

## Local Development

### Prerequisites
* Node.js
* PostgreSQL
* MQTT Broker

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
npm install
npm run dev
```

---

## Environment Configuration

* Environment-specific secrets must remain in local `.env` files.
* `.env` files must NEVER be committed to source control.
* Use `.env.example` as a template for setting up local development.
* Never place production credentials in source control.

Required environment variables (Keys only):
* `DATABASE_URL`
* `JWT_SECRET`
* `CORS_ORIGIN`
* `MQTT_BROKER_URL`
* `MQTT_USERNAME`
* `MQTT_PASSWORD`
* `VITE_API_URL` (Required for frontend production build)

---

## Database / Prisma

### Development
Apply migrations to a local development database:
```bash
npx prisma migrate dev
```

### Production
Deploy compiled migrations to a production database:
```bash
npx prisma migrate deploy
```

### Seed
Bootstrap the database with initial users/data:
```bash
npx tsx prisma/seed.ts
```

---

## Build / Test Commands

### Frontend
```bash
npm run lint    # Runs code quality checks
npm run build   # Compiles TypeScript and builds the Vite production bundle
```

### Backend
```bash
npm run build   # Compiles TypeScript to the dist/ output directory
npm test        # Runs all automated tests
npm run start   # Runs the compiled production build
```

---

## Production Deployment

1. Install production dependencies for both frontend and backend.
2. Configure production environment variables securely via your deployment provider.
3. Build the backend:
   ```bash
   cd backend
   npm run build
   ```
4. Deploy Prisma migrations to the production database:
   ```bash
   npx prisma migrate deploy
   ```
5. Start the production backend server:
   ```bash
   npm run start
   ```
6. Build the frontend for production deployment:
   ```bash
   cd frontend
   npm run build
   ```
7. Configure the production reverse proxy or CDN to serve the frontend bundle, proxy API requests to the backend, and handle WebSocket upgrade connections securely.

---

## CORS Configuration

The `CORS_ORIGIN` environment variable securely controls which frontend origins are permitted to communicate with the backend API and WebSocket server. In production, this must be set strictly to the production frontend domain to prevent unauthorized cross-origin requests. It can be set to allow local development origins during local testing.

---

## Security Guidelines

* **Never commit `.env` files.**
* **Never commit production credentials.**
* **Never expose JWT secrets.**
* **Never place MQTT credentials in README or source control.**
* **Never place customer/BESS/EMU identifiers in public documentation.**
* Keep temporary testing and investigation artifacts strictly within `backend/scripts/scratch/` (this directory is ignored by Git).
* Review `git status` before committing to ensure sensitive configuration or scratch files are not accidentally staged.
* Verify ignored files before committing sensitive configuration.

---

## File Placement Rules

### Production/application code
```text
backend/src/
frontend/src/
```

### Database
```text
backend/prisma/
```

### Tests
```text
backend/tests/
```

### Operational scripts
```text
backend/scripts/operations/
```

### Debug utilities
```text
backend/scripts/debug/
```

### Temporary investigation files
```text
backend/scripts/scratch/
```
*(Note: Files in the scratch directory are temporary and should not be committed).*
