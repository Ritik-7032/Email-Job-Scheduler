# ReachInbox Email Job Scheduler

A distributed, rate-limited email job scheduling system built with TypeScript, Express, BullMQ, Redis, PostgreSQL, Prisma, Nodemailer (Ethereal SMTP), and React.

---

## 1. Overview & Architecture

The system enables users to schedule email campaigns with per-sender minimum delay constraints and hourly rate limits. The API server and the background worker run as distinct, decoupled processes to allow independent scaling, graceful restarts, and zero-downtime queue persistence.

```
+-------------------------------------------------------------------------+
|                               React Frontend                            |
|             (Vite + Tailwind CSS, Dashboard, Compose Modal, CSV)        |
+------------------------------------+------------------------------------+
                                     |  HTTP (Credentials: include)
                                     v
+-------------------------------------------------------------------------+
|                               Express API                               |
|        - Google OAuth 2.0 (google-auth-library, HTTP-only JWT)          |
|        - Zod Request Validation (bounds, future times, emails)          |
|        - Staggered Database Ingestion (PostgreSQL via Prisma)           |
|        - Bulk Delayed Job Enqueueing (BullMQ)                           |
+-------------------+---------------------------------+-------------------+
                    |                                 |
           SQL Inserts / Reads                Enqueue Delayed Jobs
                    |                                 |
                    v                                 v
+-------------------+---------+     +-----------------+-------------------+
|       PostgreSQL Database   |     |           Redis (AOF)               |
|  - Users, Senders, Batches  |     |  - BullMQ Delayed Job Queue         |
|  - Emails (Durable Truth)   |     |  - Atomic Lua Rate Limiter Keys     |
+-------------------+---------+     +-----------------+-------------------+
                    ^                                 |
                    | Atomic Claims & State Updates   | Pull Delayed Jobs
                    |                                 v
+-------------------+---------------------------------+-------------------+
|                            Background Worker                            |
|        - BullMQ Delayed Job Consumer (Concurrency: 5)                   |
|        - Redis Lua Gate: Min-Gap (`gap:ID`) & Hourly (`rate:ID:Window`) |
|        - Atomic Claim: Raw SQL Conditional Transition                   |
|        - Dispatch: Nodemailer SMTP with Ethereal Test Accounts          |
|        - Rescheduling: `moveToDelayed` + `DelayedError`                 |
+------------------------------------+------------------------------------+
                                     |
                                     v
+------------------------------------+------------------------------------+
|                         Ethereal SMTP Server                            |
|                   (Preview URLs generated on send)                      |
+-------------------------------------------------------------------------+
```

---

## 2. Tech Stack

- **Backend**: Node.js, TypeScript, Express, BullMQ, ioredis, PostgreSQL, Prisma ORM, Nodemailer, Zod, google-auth-library, jsonwebtoken, Pino.
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide icons.
- **Testing**: Vitest, Supertest.
- **Infrastructure**: Docker & Docker Compose (PostgreSQL 16, Redis 7 with AOF persistence).

---

## 3. Project Structure

```
.
├── backend/
│   ├── prisma/
│   │   └── schema.prisma         # Database models & indexes
│   ├── src/
│   │   ├── config/               # Zod-validated environment config
│   │   ├── controllers/          # Auth & Email route handlers
│   │   ├── lib/                  # Prisma, Redis, Logger singletons
│   │   ├── middleware/           # Auth (JWT) & centralized error middleware
│   │   ├── queue/                # BullMQ queue definition
│   │   ├── repositories/         # Prisma queries & transactional batches
│   │   ├── routes/               # Express route definitions
│   │   ├── scripts/              # Sender seeder & requeue utilities
│   │   ├── services/             # Auth, Scheduling, and Lua Rate Limiter
│   │   ├── types/                # Backend TypeScript types
│   │   ├── validators/           # Zod validation schemas
│   │   ├── workers/              # Email worker processor & factory
│   │   ├── app.ts                # Express application setup
│   │   ├── server.ts             # API entrypoint
│   │   └── worker.ts             # Worker entrypoint (separate process)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/           # Button, Input, Modal, Table, Toast, Header
│   │   ├── lib/                  # Typed API client, CSV parser, Date utilities
│   │   ├── screens/              # Login & Dashboard screens
│   │   ├── types/                # Frontend TypeScript types
│   │   ├── App.tsx               # App root & Auth container
│   │   └── main.tsx              # React entrypoint
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── docker-compose.yml            # PostgreSQL & Redis with persistent volumes
├── package.json                  # Root runner script
└── README.md
```

---

## 4. Environment Configuration

Copy `backend/.env.example` to `backend/.env`:

```bash
cp backend/.env.example backend/.env
```

| Variable | Description | Default |
| :--- | :--- | :--- |
| `NODE_ENV` | Runtime environment (`development` / `production` / `test`) | `development` |
| `PORT` | API server port | `5000` |
| `FRONTEND_URL` | Frontend origin for CORS and cookie redirects | `http://localhost:5173` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://reachinbox:reachinbox_password@localhost:5432/reachinbox_scheduler?schema=public` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth Client ID | Required |
| `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth Client Secret | Required |
| `GOOGLE_CALLBACK_URL` | OAuth redirect URI | `http://localhost:5000/api/auth/callback` |
| `JWT_SECRET` | Secret key for signing HTTP-only session JWTs | Min 16 chars |
| `SMTP_HOST` | SMTP server host | `smtp.ethereal.email` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_SECURE` | TLS flag | `false` |
| `SENDER_COUNT` | Number of test sender accounts to seed | `5` |
| `WORKER_CONCURRENCY` | Concurrent jobs per worker process | `5` |
| `MIN_DELAY_BETWEEN_EMAILS_MS` | Minimum gap allowed between consecutive sends | `2000` |
| `MAX_EMAILS_PER_HOUR` | Maximum allowed hourly limit per sender | `200` |
| `DEFAULT_DELAY_MS` | Default delay in UI | `2000` |
| `DEFAULT_HOURLY_LIMIT` | Default hourly limit in UI | `200` |
| `MAX_RECIPIENTS_PER_REQUEST` | Maximum recipient count in a single request | `1000` |
| `STALE_PROCESSING_MS` | Crash recovery duration for stuck processing rows | `300000` (5 mins) |

---

## 5. Google OAuth Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Create an OAuth 2.0 Client ID for a **Web Application**.
3. Set **Authorized redirect URIs** to:
   `http://localhost:5000/api/auth/callback`
4. Set **Authorized JavaScript origins** to:
   `http://localhost:5173` and `http://localhost:5000`
5. Copy the Client ID and Client Secret into `backend/.env`.

---

## 6. Local Setup & Running

### Step 1: Start PostgreSQL and Redis via Docker

```bash
docker-compose up -d
```

### Step 2: Install dependencies & run Prisma migrations

```bash
# In backend
cd backend
npm install
npx prisma db push
```

### Step 3: Seed Ethereal SMTP Senders

```bash
npm run seed:senders
```
*This calls `nodemailer.createTestAccount()` to generate `SENDER_COUNT` accounts and stores their credentials in the PostgreSQL `Sender` table.*

### Step 4: Install Frontend dependencies

```bash
cd ../frontend
npm install
```

### Step 5: Run the Services

Open three terminal windows:

**Terminal 1 — API Server:**
```bash
npm run dev
# or from root: npm run dev
```

**Terminal 2 — Background Worker:**
```bash
npm run worker
# or from root: npm run worker
```

**Terminal 3 — Frontend Dashboard:**
```bash
npm run client
# or from root: npm run client
```

Access the dashboard at `http://localhost:5173`.

---

## 7. Database Schema & Indexes

- **User**: `id`, `googleId` (unique), `name`, `email` (unique), `avatar`, `createdAt`, `updatedAt`
- **Sender**: `id`, `email`, `smtpUser`, `smtpPassword`, `createdAt`
- **Batch**: `id`, `userId`, `delayMs`, `hourlyLimit`, `startAt`, `createdAt`
- **Email**: `id` (UUID), `userId`, `batchId`, `senderId`, `recipient`, `subject`, `body`, `scheduledAt`, `sentAt`, `status` (`scheduled` | `processing` | `sent` | `failed`), `attempts`, `errorMessage`, `messageId`, `previewUrl`, `enqueuedAt`, `processingStartedAt`, `createdAt`, `updatedAt`

**Indexes:**
- `(userId, status, scheduledAt)`: Enables fast queries for scheduled and active items.
- `(userId, status, sentAt)`: Enables fast sorted pagination for sent and failed history.
- `batchId`: Foreign key index for cascade lookups.

---

## 8. Scheduling Flow & Execution Details

### 1. Ingestion (`POST /api/emails/schedule`)
- Validates request payload against Zod bounds: non-empty subject and body, RFC-valid emails, future start time, `delayMs >= MIN_DELAY_BETWEEN_EMAILS_MS`, and `hourlyLimit <= MAX_EMAILS_PER_HOUR`.
- Staggers schedule time: for $i = 0 \dots N-1$, `scheduledAt = startAt + i * delayMs`. Senders are assigned round-robin across seeded senders in the DB.
- Inserts `Batch` and all `Email` rows within a single PostgreSQL transaction.
- Adds jobs to BullMQ in bulk using `queue.addBulk()` with `jobId = email.id` and `delay = max(0, scheduledAt - now)`.
- Updates `enqueuedAt = now()` for all rows.

### 2. Rate Limiting & Gap Control (Atomic Lua Script)
Before sending, each worker evaluates sender gates using an atomic Redis Lua script:
- **Minimum Gap Key (`gap:{senderId}`)**: Checks remaining TTL (`PTTL`). If positive, returns remaining milliseconds.
- **Hourly Window Counter (`rate:{senderId}:{YYYYMMDDHH}`)**: Checks current sent count against `hourlyLimit`. If reached, returns milliseconds until the next UTC hour window.
- **Slot Reservation**: If both checks pass, increments the hourly counter (with a 2-hour TTL) and sets the gap key (`PSETEX gap:{senderId} delayMs 1`). Returns `0`.

### 3. Worker Rescheduling
If the Lua script returns a wait time $> 0$:
- The worker logs the rate limit reschedule.
- Calls `job.moveToDelayed(Date.now() + waitMs, token)`.
- Throws `new DelayedError()` from BullMQ.
- The email in PostgreSQL remains `scheduled` without counting as a failed attempt.

### 4. Atomic Claim Query
To prevent double sends across concurrent workers:
```sql
UPDATE "Email"
SET "status" = 'processing', "processingStartedAt" = $now, "updatedAt" = $now
WHERE "id" = $id
  AND (
    "status" = 'scheduled'
    OR ("status" = 'processing' AND "processingStartedAt" < $now - INTERVAL '5 minutes')
  )
```
If 0 rows are affected, another worker has already claimed the record or it is no longer schedulable, and the job terminates safely.

### 5. SMTP Dispatch & Failure Handling
- Dispatches email through the assigned sender's Nodemailer transporter.
- On success: sets `status = 'sent'`, records `sentAt`, `messageId`, and `previewUrl` from Ethereal.
- On error: decrements the hourly counter (`releaseHourlySlot`), updates `attempts`, and rethrows if retries remain for exponential backoff (base 5s). On final attempt exhaustion, marks `status = 'failed'`.

---

## 9. Failure Modes, Restart Persistence & Trade-offs

### Restart Persistence
- Redis is configured with `appendonly yes` (AOF) and backed by a Docker named volume.
- Delayed BullMQ jobs survive worker and Redis restarts without manual re-insertion.

### Enqueue-Failure Window & Reconciliation
- If the API crashes after database insert but before queue enqueueing, `enqueuedAt` remains `NULL`.
- On server startup and via `npm run requeue`, the system queries only rows where `status = 'scheduled' AND enqueuedAt IS NULL AND createdAt < (now - 1 minute)` and enqueues them idempotently using their stable UUID `jobId`.

### Duplicate Delivery vs Exactly-Once Trade-off
- Database state and atomic conditional updates prevent normal duplicate processing across concurrent workers.
- If a catastrophic network partition or worker crash occurs **after** the SMTP server accepts the message but **before** the database status is updated to `sent`, the job may be retried and result in a duplicate send. Achieving true exactly-once delivery requires recipient/provider-level idempotency key support.
- A job stuck in `processing` due to an abrupt worker termination is automatically reclaimed after `STALE_PROCESSING_MS` (5 minutes), reflecting the same trade-off.

---

## 10. Verification & Test Suite

Run the Vitest test suite in the backend:

```bash
cd backend
npm test
```

The test suite covers:
1. **Schedule API Validation**: bad email, past start timestamp, delay below minimum, limit above maximum, unauthenticated requests.
2. **Batch Ingestion & Staggering**: correct `scheduledAt` offsets and round-robin sender assignment.
3. **Queue Enqueueing**: job creation with `jobId = email.id` and correct delayed timestamp calculation.
4. **Rate Limiter Lua Script**: atomic gap verification, hourly quota gating, wait duration to next UTC hour, and slot rollback.
5. **Worker Rescheduling**: `moveToDelayed` and `DelayedError` invocation when rate-limited without burning retry attempts.
6. **Idempotency & Concurrency**: skipping already resolved emails and atomic raw SQL claim fencing.
7. **Worker Lifecycle**: success path with preview URLs and retry/failure paths with slot release.

---

## 11. Feature Checklist

### Backend Requirements
- [x] Separate API and Worker entrypoints (`src/server.ts`, `src/worker.ts`).
- [x] No cron libraries, no `setInterval` scheduling, no in-memory rate limiting.
- [x] Real Google OAuth 2.0 with state verification and HTTP-only signed JWT cookies.
- [x] Senders dynamically seeded into PostgreSQL via `nodemailer.createTestAccount()`.
- [x] Zod validation for all bounds and rejection with 400.
- [x] Database transactions for batch creation and round-robin sender assignment.
- [x] Atomic Redis Lua script combining minimum delay gap and UTC hourly limit.
- [x] Worker rescheduling with BullMQ `moveToDelayed` and `DelayedError`.
- [x] Atomic SQL claim preventing race conditions across concurrent workers.
- [x] Structured Pino logger for key lifecycle events.
- [x] Automatic startup reconciler and standalone `requeue` script.

### Frontend Requirements
- [x] Internal-tool design with neutral slate palette and 1px borders.
- [x] Google Sign-in authentication flow.
- [x] Dashboard with "Scheduled Emails" and "Sent Emails" tabs.
- [x] Real API-driven tables with pagination, loading, error, and empty states.
- [x] Ethereal preview URLs for sent test emails.
- [x] Compose modal with subject, body, start time, delay, and hourly limit.
- [x] Hand-written CSV/TXT parser with email regex and deduplication counts.
- [x] Times formatted in the user's local timezone.
- [x] Centralized typed API client (`frontend/src/lib/api.ts`).
