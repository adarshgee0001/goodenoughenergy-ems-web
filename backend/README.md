# Good Enough Energy — EMS Backend

Node.js + TypeScript REST API, WebSocket, and MQTT ingestion service for the Energy Management System.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24 |
| Language | TypeScript 7 |
| Framework | Express 5 |
| ORM | Prisma 6 |
| Database | PostgreSQL |
| Real-time | Socket.IO |
| MQTT | mqtt.js (mqtts/TLS) |
| Testing | Vitest |
| Dev runner | tsx watch |

---

## Project Structure

```
backend/
├── src/                        # Production application code
│   ├── app.ts
│   ├── server.ts
│   ├── controllers/
│   ├── services/
│   ├── routes/
│   ├── middleware/
│   ├── db/
│   └── utils/
│
├── tests/                      # ALL automated tests (Vitest)
│   ├── unit/
│   ├── integration/
│   └── setup/
│
├── prisma/                     # Schema, migrations, seed
├── scripts/                    # Human-run utility scripts
│   ├── debug/                  # Manual diagnostic scripts
│   ├── operations/             # Operational/maintenance scripts
│   └── scratch/                # Temporary one-off investigation scripts
│
├── .env
├── .env.example
├── .env.test
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

---

## Getting Started

```bash
npm install
cp .env.example .env
# Edit .env with your local values
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Compile TypeScript to dist/ |
| `npm start` | Run compiled production build |
| `npm test` | Run all tests (unit + integration) |
| `npm run test:unit` | Run unit tests only |
| `npm run test:integration` | Run integration tests only |
| `npm run test:watch` | Run tests in watch mode |

---

## Project Structure & Testing Rules

> **PERMANENT PROJECT CONVENTIONS — applies to all contributors (human and AI).**

### Where new files belong

| File type | Correct location | Never in |
|---|---|---|
| Automated test | tests/unit/ or tests/integration/ | backend/ root |
| Manual debug utility | scripts/debug/ | backend/ root |
| Operational script | scripts/operations/ | backend/ root |
| Temporary investigation | scripts/scratch/ | backend/ root |
| Production code | src/ | Anywhere else |

### Rules

1. **Never create test/debug/scratch files in backend/ root.**
2. **Scratch files must be deleted when no longer needed.**
3. **Automated tests use Vitest** — place under tests/ only.
4. **Before creating any new file, classify it first:**

```
Automated test?        -> tests/unit or tests/integration
Manual debug utility?  -> scripts/debug
Operational script?    -> scripts/operations
Temporary scratch?     -> scripts/scratch
```

### Testing Workflow

```
Feature implementation
      -> Write automated test in tests/unit or tests/integration
      -> npm test
      -> If temporary diagnostic needed: scripts/scratch or scripts/debug
      -> Delete scratch file after investigation
      -> npm test (full suite must pass)
```

---

## Environment Variables

See .env.example for the complete reference.

| Variable | Description |
|---|---|
| DATABASE_URL | PostgreSQL connection string |
| JWT_SECRET | JWT signing secret |
| MQTT_BROKER_URL | HiveMQ broker hostname |
| MQTT_USERNAME | MQTT broker username |
| MQTT_PASSWORD | MQTT broker password |
| CORS_ORIGIN | Allowed frontend origin(s) |
| ADMIN_EMAIL | Bootstrap admin email (seed only) |
| ADMIN_PASSWORD | Bootstrap admin password (seed only) |

---

## Architecture Notes

- **MQTT -> Telemetry**: mqtt.service.ts normalizes signals, persists to TelemetryHistory, broadcasts via WebSocket.
- **WebSocket**: Socket.IO, authenticated via auth_token HttpOnly cookie. Clients subscribe to site:<siteId> rooms.
- **Auth**: HttpOnly cookie (auth_token) + JWT. No localStorage tokens.
- **Multi-tenancy**: All asset endpoints enforce client ownership via authorizationService.
- **Snapshots**: 15-minute telemetry aggregation runs on startup and every 1 minute.
