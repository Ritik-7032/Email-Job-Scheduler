# HyperSend

[![CI](https://github.com/Ritik-7032/Email-Job-Scheduler/actions/workflows/ci.yml/badge.svg)](https://github.com/Ritik-7032/Email-Job-Scheduler/actions/workflows/ci.yml)
![Test Suite](https://img.shields.io/badge/Vitest-60%2F60%20Passed-brightgreen)
![Coverage](https://img.shields.io/badge/Coverage-79.4%25%20Lines%20%7C%2071.8%25%20Branch-blue)
![Core Engine](https://img.shields.io/badge/Core%20Queue%20%26%20Limiter-100%25-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)
![Node](https://img.shields.io/badge/Node.js-%3E%3D20-green)
![License](https://img.shields.io/badge/License-MIT-purple)

**HyperSend** is a production-minded background email scheduling and rate-limiting engine built with TypeScript, Express, BullMQ, Redis, PostgreSQL, Prisma, Nodemailer (Ethereal SMTP), and React.

---

## 🌐 Live Deployments

- 🚀 **Frontend Web Application (Vercel)**: [https://hypersend.vercel.app](https://hypersend.vercel.app)
- ⚙️ **Backend API & Queue Worker (Render)**: [https://email-job-scheduler-mtxd.onrender.com](https://email-job-scheduler-mtxd.onrender.com)
- 📦 **GitHub Repository**: [https://github.com/Ritik-7032/Email-Job-Scheduler](https://github.com/Ritik-7032/Email-Job-Scheduler)

---

## 📐 Interface & Dashboard Wireframe
![HyperSend Interface Wireframe](./docs/dashboard-preview.svg)

```text
+---------------------------------------------------------------------------------------------------------+
|  ⚡ HyperSend                              [+ Compose Campaign]   [↻ Refresh]    👤 user@domain.com     |
+---------------------------------------------------------------------------------------------------------+
|  [ Scheduled Emails (12) ]  [ Sent Emails (88) ]               🔍 [ Filter by recipient / subject... ]  |
+---------------------------------------------------------------------------------------------------------+
| Recipient               | Subject             | Scheduled / Sent At | Sender Pool       | Status / Link |
|-------------------------+---------------------+---------------------+-------------------+---------------|
| sarah.t@enterprise.com  | Product Update v2   | Oct 17, 10:00:00 AM | sender1@ethereal  | [Scheduled]   |
| alex.k@growth.io        | Product Update v2   | Oct 17, 10:00:02 AM | sender2@ethereal  | [Scheduled]   |
| maria.v@cloudtech.org   | Product Update v2   | Oct 17, 10:00:04 AM | sender3@ethereal  | [Processing]  |
| david.l@retail.co       | Welcome Onboarding  | Oct 17, 09:58:30 AM | sender1@ethereal  | [Sent ↗ View] |
+---------------------------------------------------------------------------------------------------------+
| Showing 1 - 4 of 100 emails                                                    [< Previous]  [Next >]   |
+---------------------------------------------------------------------------------------------------------+
```

> **Dashboard UI Architecture**: The interface features a sidebar navigation (`Sidebar.tsx`) with real-time status badges (3.5s auto-polling), an interactive email list with instant multi-field search filtering, an email inspection drawer (`EmailDetailView.tsx`) with rendered Markdown/attachments and direct Ethereal preview links, and a campaign composer (`ComposeView.tsx`) with CSV parser and auto-deduplication. A 1-Click Recruiter/Portfolio Demo mode is also provided on the login screen for instant evaluation.

---

## Architecture Overview

The system schedules and sends email batches with per-sender minimum delays and hourly rate limits. The API server and background worker are separate processes.

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
|        - Zod Request Validation (bounds, integer checks, future times)  |
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
|  - Emails (Durable Source)  |     |  - Atomic Lua Rate Limiter Keys     |
+-------------------+---------+     +-----------------+-------------------+
                    ^                                 |
                    | Atomic Claims & State Updates   | Pull Delayed Jobs
                    |                                 v
+-------------------+---------------------------------+-------------------+
|                            Background Worker                            |
|        - BullMQ Delayed Job Consumer (Concurrency: 5)                   |
|        - Redis Lua Gate: Min-Gap (`gap:ID`) & Hourly (`rate:ID:Window`) |
|        - Atomic Claim: Raw SQL Conditional Transition                   |
|        - Dispatch: Nodemailer SMTP with Cached Senders                  |
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

## Stack

- **Backend**: Node.js, TypeScript, Express, BullMQ, ioredis, PostgreSQL, Prisma, Nodemailer, Zod, google-auth-library, jsonwebtoken, Pino.
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide icons, Nginx.
- **Testing**: Vitest, Supertest (60/60 Unit & Integration Tests across 7 test suites).
- **Infra**: Docker Compose (Full-stack containerization with isolated network & persistent volumes).

---

## 🚀 Getting Started

You can run the project either fully containerized via Docker Compose (Option A) or natively for local development (Option B).

### Option A: 1-Command Full-Stack Container (Recommended for Evaluation)

Runs the entire stack in isolated Docker containers: PostgreSQL, Redis (AOF), API Server, Worker process, and Frontend UI.

```bash
# 1. Clone and enter repo
git clone https://github.com/Ritik-7032/Email-Job-Scheduler.git
cd Email-Job-Scheduler

# 2. Build and launch all services
docker-compose up --build
```

**Services Launched:**
- **React Frontend**: [http://localhost:5173](http://localhost:5173) (Served via Nginx)
- **Express API Server**: [http://localhost:5000](http://localhost:5000) (Health: `/health`)
- **BullMQ Worker**: Background processor (`concurrency = 5`)
- **PostgreSQL 16**: Port `5432` with automated schema push
- **Redis 7 (AOF)**: Port `6379` with persistent append-only log

To stop containers:
```bash
docker-compose down
```

---

### Option B: Local Development Setup (Native Node.js)

If developing locally with hot-reloading:

```bash
# 1. Start backing data stores (Postgres & Redis)
docker-compose up -d postgres redis

# 2. Setup backend environment and database
cp backend/.env.example backend/.env
cd backend
npm install
npx prisma db push
npm run seed:senders

# 3. Setup frontend dependencies
cd ../frontend
npm install
cd ..

# 4. Start services in separate terminal tabs
npm run dev        # Terminal 1: Express API (http://localhost:5000)
npm run worker     # Terminal 2: BullMQ Queue Worker
npm run client     # Terminal 3: React Frontend (http://localhost:5173)
```

---

## 🏛️ Core Design Decisions & Architectural Patterns

| Engineering Challenge | Architectural Solution | Production Trade-off & Rationale |
| :--- | :--- | :--- |
| **No Cron / In-Memory Polling** | BullMQ delayed jobs (`jobId = email.id`, `delay = scheduledAt - now`) | Eliminates CPU-saturating $O(N)$ database polling. Delegates millisecond scheduling to Redis Sorted Sets ($ZADD$). |
| **Durable State vs. Fast Cache** | PostgreSQL as system-of-record + Redis with AOF persistence | Guarantees transactional persistence across worker crashes while maintaining high Redis throughput. |
| **Idempotency & Race Conditions** | Stable UUID job IDs + Atomic raw SQL conditional claims (`UPDATE ... WHERE status = 'scheduled'`) | Prevents duplicate sends across distributed workers without requiring heavyweight table-level distributed locks. |
| **Rate Limiting & Minimum Delay** | Atomic Redis Lua script combining sender gap key (`gap:ID`) and UTC hourly counter (`rate:ID:window`) | Single atomic network trip prevents race conditions between checking quota and reserving slots across concurrent workers. |
| **Rescheduling on Rate Limits** | `job.moveToDelayed(Date.now() + waitMs, token)` followed by BullMQ `DelayedError` | Backs off cleanly without burning retry attempt counters or polluting error trackers. |
| **Worker Concurrency** | Dedicated BullMQ Worker process (`concurrency = 5`) | Decouples API event loop from SMTP latency and connection pooling. |
| **Sender Distribution** | PostgreSQL `Sender` table with round-robin sender assignment during batch creation | Maximizes sender reputation and aggregate domain throughput across distinct outbound IPs/accounts. |
| **Crash & Stale Recovery** | Dual-stage reconciler on startup (`enqueuedAt IS NULL` + stale `processing` rows) | Self-heals orphaned batches if the API or worker crashes mid-ingest or mid-dispatch. |
| **Safe SMTP Dispatch** | Nodemailer with Ethereal SMTP accounts and test preview links | Validates full end-to-end SMTP protocol negotiation without sending spam to real recipient inboxes. |
| **Session Authentication** | Google OAuth 2.0 with cryptographic state validation and signed JWT cookies | Secures API access with CSRF protection and HTTP-only cookie tokens. |

---

## 🧪 Test Coverage & Verification

The test suite validates concurrency, rate limiting, and failure recovery. Tests execute on every push and pull request via GitHub Actions CI:

```bash
# Run unit & integration test suite with coverage
npm --prefix backend run test:coverage
```

### Coverage Breakdown (Vitest v8)

| Module / Component | Line Coverage | Branch Coverage | Focus Area |
| :--- | :---: | :---: | :--- |
| **Rate Limiter Lua Script** (`rateLimiter.ts`) | 100% | 100% | Atomic gap TTL checks, UTC hourly resets, slot reservations |
| **Database Transaction Ingestion** (`emailRepository.ts`) | 100% | 100% | Single-roundtrip unnest insert (default), chunked fallback, staggering, rollback |
| **Input Validator** (`scheduleValidator.ts`) | 100% | 100% | Bounds checking, recipient limits, RFC 5322 validation |
| **Email Queue Initialization** (`emailQueue.ts`) | 100% | 100% | BullMQ connection and queue options |
| **Express Application Setup** (`app.ts`) | 97.2% | 88.2% | Deep health probes (`/health`, `/api/health`), CORS allowlist |
| **Requeue & Crash Recovery** (`requeueService.ts`) | 95.1% | 83.0% | Orphaned job requeuing, stale processing reconciliations, Redis crash recovery, timeout retries |
| **Sender Repository & Pool Contention** (`senderRepository.ts`) | 94.6% | 71.4% | Pool exhaustion retries, automatic Ethereal test account seeding |
| **Email Worker Processor** (`emailWorker.ts`) | 85.6% | 71.0% | Atomic SQL claims, moveToDelayed handling, retry exhaustion, Redis dispatch ledger, event listeners |
| **CSRF Defense & Auth Middleware** (`csrf.ts`, `auth.ts`) | 83.6% | 58.3% | OWASP Origin verification, safe method bypass, JWT cookie parsing |
| **Overall Backend Codebase** | **79.4%** | **71.8%** | Full backend source files (60 tests across 7 test suites) |

---

## 📁 Repository Structure

```
email-job-scheduler/
├── .github/
│   └── workflows/
│       └── ci.yml                # GitHub Actions: Lint, Typecheck, Vitest, and Production Build
├── backend/
│   ├── prisma/
│   │   ├── migrations/           # SQL migration files
│   │   └── schema.prisma         # Prisma models & compound indexes
│   ├── src/
│   │   ├── config/               # Zod-validated environment config
│   │   ├── controllers/          # Auth & Email route handlers
│   │   ├── lib/                  # Prisma, Redis, Logger singletons
│   │   ├── middleware/           # Auth (JWT) & centralized error middleware
│   │   ├── queue/                # BullMQ queue definition
│   │   ├── repositories/         # Prisma queries & transactional batches
│   │   ├── routes/               # Express route definitions
│   │   ├── scripts/              # Sender seeder, benchmark & requeue utilities
│   │   ├── services/             # Auth, Scheduling, and Lua Rate Limiter
│   │   ├── types/                # Backend TypeScript types
│   │   ├── validators/           # Zod validation schemas
│   │   ├── workers/              # Email worker processor & factory
│   │   ├── app.ts                # Express application setup
│   │   ├── server.ts             # API entrypoint
│   │   └── worker.ts             # Dedicated worker entrypoint
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/           # Button, Input, Header, Toast, Sidebar, EmailDetailView, ComposeView, EmailTable, compose/
│   │   ├── lib/                  # Typed API client, CSV parser, Date utilities
│   │   ├── screens/              # Login (with 1-Click Demo) & Dashboard screens
│   │   ├── types/                # Frontend TypeScript types
│   │   ├── App.tsx               # App root & Auth container (with cold-start detection)
│   │   └── main.tsx              # React entrypoint
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── docker-compose.yml            # Container orchestration (PostgreSQL, Redis, API, Worker, UI)
├── package.json                  # Root runner script
├── .env.example                  # Environment configuration template
└── README.md
```

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env`:

```bash
cp backend/.env.example backend/.env
```

| Variable | Description | Default |
| :--- | :--- | :--- |
| `NODE_ENV` | Runtime environment (`development`, `production`, `test`) | `development` |
| `PORT` | API server port | `5000` |
| `FRONTEND_URL` | Frontend origin for CORS and redirects | `http://localhost:5173` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://scheduler_admin:scheduler_password@localhost:5432/scheduler_db?schema=public` |
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
| `MIN_DELAY_BETWEEN_EMAILS_MS` | Minimum delay allowed between consecutive sends | `2000` |
| `MAX_EMAILS_PER_HOUR` | Maximum allowed hourly limit per sender | `200` |
| `DEFAULT_DELAY_MS` | Default delay in UI | `2000` |
| `DEFAULT_HOURLY_LIMIT` | Default hourly limit in UI | `200` |
| `MAX_RECIPIENTS_PER_REQUEST` | Maximum recipient count in a single request | `10000` |
| `STALE_PROCESSING_MS` | Crash recovery duration for stuck processing rows | `300000` (5 mins) |
| `SEPARATE_WORKER` | When `true`, stops API server from launching an in-process worker | `false` |
| `DEMO_SIMULATE_SMTP` | Enable offline fallback simulation when outbound SMTP is blocked (e.g. Render free tier) | `false` |

---

## Google OAuth Setup

1. Open the [Google Cloud Console Credentials Page](https://console.cloud.google.com/apis/credentials).
2. Create an OAuth 2.0 Client ID for a Web Application.
3. Configure Authorized redirect URIs:
   `http://localhost:5000/api/auth/callback`
4. Configure Authorized JavaScript origins:
   `http://localhost:5173` and `http://localhost:5000`
5. Place the Client ID and Secret in `backend/.env`.

---

## Ethereal Email Setup

Ethereal is a fake SMTP service used for development and testing. Outbound messages are captured by Ethereal rather than delivered to real inboxes.
- Running `npm run seed:senders` in the backend uses `nodemailer.createTestAccount()` to generate `SENDER_COUNT` unique SMTP accounts and saves their credentials into the `Sender` table in PostgreSQL.
- When an email is sent, the worker retrieves the Ethereal message URL via `nodemailer.getTestMessageUrl(info)` and writes it to the `previewUrl` column in the database.
- The sent table in the frontend displays a direct preview link to view the rendered email.


---

## API Endpoints

| Method | Endpoint | Description | Auth Required | Body / Query |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/health` | Health check endpoint | No | None |
| `GET` | `/api/auth/google` | Initiates Google OAuth with state cookie | No | None |
| `GET` | `/api/auth/callback` | Exchanges code, verifies state, sets JWT cookie | No | Query: `code`, `state` |
| `POST` | `/api/auth/demo` | Authenticates Demo Recruiter session (1-Click portfolio evaluation) | No | None |
| `GET` | `/api/auth/me` | Returns current authenticated user profile | Yes | None |
| `POST` | `/api/auth/logout` | Clears JWT cookie | Yes | None |
| `POST` | `/api/emails/schedule` | Schedules a new email batch | Yes | Body: `{ subject, body, recipients, startAt, delayMs, hourlyLimit }` |
| `GET` | `/api/emails/scheduled` | Returns scheduled and processing emails | Yes | Query: `limit`, `offset` |
| `GET` | `/api/emails/sent` | Returns sent and failed emails | Yes | Query: `limit`, `offset` |
| `GET` | `/api/emails/stats` | Returns real-time BullMQ queue metrics (delayed, active, completed, failed) | Yes | None |

---

## 📊 Observability, Queue Metrics & Dead-Letter Inspection

HyperSend provides real-time visibility into queue depth, concurrency limits, and failure states via `GET /api/emails/stats`.

### Live Queue Metrics Payload (`GET /api/emails/stats`)
```json
{
  "status": "healthy",
  "concurrency": 5,
  "minDelayMs": 2000,
  "maxEmailsPerHour": 200,
  "queue": {
    "waiting": 0,
    "active": 2,
    "completed": 88,
    "failed": 0,
    "delayed": 12,
    "paused": 0
  }
}
```

### Dead-Letter Queue & Transient Retry Management
1. **Dead-Letter Quarantine (`failed` state)**: Jobs exhausting all 3 execution attempts are permanently moved to BullMQ's `failed` set, with the terminal stack trace recorded in the PostgreSQL `errorMessage` column.
2. **Automated Transient Self-Healing (`retryTransientFailedEmails`)**: A background reconciler periodically inspects failed records older than 5 minutes. If failure signatures match recoverable transient network errors (`ETIMEDOUT`, `ECONNREFUSED`, `EHOSTUNREACH`, `terminated unexpectedly`), attempts are reset to 0 and jobs are automatically re-enqueued with staggered backoff without operator intervention.
3. **Queue Health Probes**: Deep health checks at `/health` and `/api/health` verify live ping responsiveness from both PostgreSQL (`prisma.$queryRaw`) and Redis (`redisClient.ping()`), providing Kubernetes/Docker-ready liveness readiness signals.

---

## Scheduling Flow & Rate Limiting Mechanics

### 1. Ingestion & Staggering
1. `POST /api/emails/schedule` validates input with Zod (`delayMs >= 2000`, `hourlyLimit <= 200`, valid future ISO `startAt`, max 10000 recipients).
2. Within a single PostgreSQL transaction:
   - Creates a `Batch` record.
   - Computes staggered `scheduledAt = startAt + index * delayMs` for each recipient.
   - Assigns senders round-robin across active senders in the database.
   - Ingests all Email records in a single round-trip using `INSERT ... SELECT FROM unnest(...)`; the chunked path remains as a fallback.
3. Enqueues jobs to BullMQ via `queue.addBulk()` in chunks of 1,000 with `jobId = email.id` and `delay = max(0, scheduledAt - now)`.
4. Marks `enqueuedAt = now` in PostgreSQL in chunks of 1,000 and returns `{ batchId, count }`.

### 2. Redis Lua Rate Limiter & Minimum Delay Gate
Before dispatching an email, the worker runs an atomic Lua script evaluating two gates for the assigned sender:
- **Minimum Gap Key (`gap:{senderId}`)**: Checks remaining TTL (`PTTL`). If positive, returns the remaining milliseconds to wait.
- **Hourly Window Counter (`rate:{senderId}:{YYYYMMDDHH}`)**: Checks current sent count against the batch's `hourlyLimit`. If the quota is exhausted, returns milliseconds remaining until the start of the next UTC hour.
- **Atomic Reservation**: If both checks pass, increments the counter (sets a 2-hour TTL on initial creation) and sets the gap key with millisecond TTL (`PSETEX gap:{senderId} delayMs 1`). Returns `0`.

### 3. Rescheduling via `moveToDelayed` and `DelayedError`
When the Lua script returns a wait time $> 0$:
1. The worker logs the reschedule event.
2. Calls `job.moveToDelayed(Date.now() + waitMs, token)`.
3. Throws `new DelayedError()` from BullMQ.
4. The job moves back into delayed state without incrementing the retry attempt counter, and the database status remains `scheduled`.

### 4. Hourly Limit Semantics Across Multiple Senders
- Hourly counters are keyed per sender in Redis (`rate:{senderId}:{utcHourWindow}`).
- If a batch specifies an `hourlyLimit` of 200 across 5 seeded senders in round-robin, each sender will send up to 200 emails per hour, yielding an effective aggregate throughput of up to 1,000 emails per hour.
- Multiple batches sharing the same sender pool draw from the same per-sender hourly quota.

---

## Concurrency, Idempotency & Crash Recovery

### Atomic SQL Claim Query
To prevent duplicate sends across concurrent workers:
```sql
UPDATE "Email"
SET "status" = 'processing', "processingStartedAt" = $now, "updatedAt" = $now
WHERE "id" = $id
  AND (
    "status" = 'scheduled'
    OR ("status" = 'processing' AND "processingStartedAt" < $now - INTERVAL '5 minutes')
  )
```
- If 0 rows are affected, the email has either already been claimed by another worker or already sent. The worker releases the reserved hourly slot and inspects the row: if it is currently in `processing` due to a recent crash (< 5 minutes ago), it delays the job until `processingStartedAt + STALE_PROCESSING_MS + 1000` to ensure recovery when stale.

### SMTP Dispatch and Status Persistence
- The SMTP send and the database `status = 'sent'` update are handled in separate stages.
- If SMTP send fails: the reserved hourly slot is decremented, attempts are incremented, and if retry attempts remain within the 3 total attempts limit (1 initial attempt + 2 retries), status is set to `scheduled` and the error is rethrown for BullMQ exponential backoff (5s base). Upon exhausting all 3 attempts, status is permanently set to `failed` with the error reason recorded.
- If SMTP send succeeds: the status update to `sent` is retried with backoff to prevent duplicate dispatches if the database experiences transient contention.

### Enqueue, Crash Recovery & Redis Data Loss Resilience
- **API Crash Mid-Ingestion (`enqueuedAt = null`)**: If the API server crashes after committing database rows but before BullMQ enqueueing finishes, rows remain with `enqueuedAt = null`. On API boot and via `npm run requeue`, `requeueOrphanedEmails()` fetches in chunks of 500 to re-enqueue any volume of orphaned records with their stable UUID `jobId`.
- **Worker Crash Mid-Execution (Stale `processing`)**: `recoverStaleProcessingEmails()` inspects rows stuck in `processing` beyond `STALE_PROCESSING_MS`. If a worker died post-SMTP, it finalizes `sent` using the Redis dispatch ledger; otherwise, it resets status to `scheduled` (or `failed` if attempts $\ge 3$).
- **Redis Crash / Restart with Dropped Jobs (`recoverLostRedisScheduledEmails`)**: If Redis restarts or drops in-memory queue jobs (e.g. within an AOF fsync window), scheduled emails in PostgreSQL already had `enqueuedAt` populated and would otherwise remain permanently stalled. HyperSend's reconciler actively queries overdue scheduled emails (`scheduledAt < now - 2 min`) and checks `emailQueue.getJob(email.id)`. If the job is missing from Redis, it automatically re-enqueues the job into BullMQ with `delay = 0`, restoring at-least-once delivery recovery across Redis restarts.

---

## Performance & Scale: Handling 1,000+ Recipients

The system is architected to handle bulk batches of 1,000+ recipients reliably without blocking the Express event loop, exceeding database parameter limits, or saturating Redis command buffers.

### Measured Performance: End-to-End vs. In-Memory Microbenchmark

To provide complete transparency between CPU-bound serialization and network/database I/O, latency was empirically measured across both layers against remote serverless PostgreSQL (Neon AWS US-East, ping RTT: min 282.7ms, median 344.0ms):

| Layer / Pipeline | 1,000 Recipients | 10,000 Recipients | Details & Guarantees |
| :--- | :---: | :---: | :--- |
| **In-Memory CPU Preprocessing** | `~6.7 ms` | `~65 ms` | Zod RFC 5322 parsing, sender staggering, chunk partitioning, BullMQ payload formatting |
| **Production Single-Roundtrip Unnest (DB Write)** | **1.47s** *(median)* | **2.24s** *(median)* | Single parameterized `INSERT ... SELECT FROM unnest(...)` query inside transaction (12 array params) |
| **Old Chunked Baseline (DB Write)** | **2.43s** *(median)* | **8.48s** *(median)* | Interactive `$transaction` executing 10 sequential 1,000-row `createMany` queries |
| **Real End-to-End API Pipeline (Unnest)** | **2.57s** *(median)* | **13.09s** *(median)* | Validation + unnest DB insert + BullMQ bulk enqueue + enqueued status mark (`scheduleEmails`) |
| **Old End-to-End API Pipeline (Chunked)** | **3.27s** *(median)* | **19.64s** *(median)* | Validation + 10 chunked `createMany` + BullMQ bulk enqueue + enqueued status mark |

> [!NOTE]
> The in-memory microbenchmark (`npm run benchmark`) isolates pure CPU/serialization (~6.7 ms for 1,000 emails). Real-world end-to-end API latency includes remote transatlantic TLS connection negotiation, Prisma interactive transactions, parameter verification, and Redis bulk enqueue writes.

### Ingestion Latency Analysis: Chunked Baseline vs. Single-Roundtrip Unnest (Shipped)

To eliminate the transatlantic round-trip bottleneck, we moved PostgreSQL array unnesting (`INSERT ... SELECT ... FROM unnest(...)`) into the **production path** in `emailRepository.ts`, keeping the old chunked implementation behind `useChunkedStrategy` for benchmarking.

Using `npm --prefix backend run profile:ingestion`, we ran **5 runs each** against Neon PostgreSQL (measured ping RTT: min 282.7ms, median 344.0ms, max 622.1ms). All numbers below are raw empirical measurements:

#### 1. Database-Level Transaction (`createBatchWithEmails`)
- **1,000 Recipients (5 runs)**:
  - Chunked Baseline: Min = `1743.8ms` | Median = `2430.3ms` | Max = `4075.6ms`
  - Unnest Query: Min = `1289.2ms` | Median = `1474.7ms` | Max = `1817.8ms`
  - **Speedup**: **1.65x faster**
- **10,000 Recipients (5 runs)**:
  - Chunked Baseline: Min = `7965.9ms` | Median = `8479.7ms` | Max = `8647.8ms`
  - Unnest Query: Min = `2026.4ms` | Median = `2243.9ms` | Max = `2453.8ms`
  - **Speedup**: **3.78x faster** (collapsed DB write from **8.48s** median down to **2.24s** median)

#### 2. End-to-End API Pipeline (`scheduleEmails`: Validation + DB + BullMQ + Enqueued)
- **1,000 Recipients (5 runs)**:
  - Chunked Baseline: Min = `2946.4ms` | Median = `3269.1ms` | Max = `4633.4ms`
  - Unnest Pipeline: Min = `2501.3ms` | Median = `2572.7ms` | Max = `2886.3ms`
  - **Speedup**: **1.27x faster**
- **10,000 Recipients (5 runs)**:
  - Chunked Baseline: Min = `19217.1ms` | Median = `19639.2ms` | Max = `22154.7ms`
  - Unnest Pipeline: Min = `12688.1ms` | Median = `13091.6ms` | Max = `16620.5ms`
  - **Speedup**: **1.50x faster** (collapsed full end-to-end API latency from **19.64s** median down to **13.09s** median)

> [!TIP]
> **Reproducibility**: Run `npm --prefix backend run profile:ingestion` to execute all 20 benchmark runs (5 runs $\times$ 2 batch sizes $\times$ 2 strategies) against your database.

> [!NOTE]
> **Next Optimization Opportunity**: In the ~13.09s end-to-end API pipeline for 10,000 recipients, database insertion now accounts for only ~2.24s. The remaining ~10.8s bottleneck is dominated by BullMQ `addBulk()` payload serialization over the network and chunked `enqueuedAt` updates. A single `UPDATE "Email" SET "enqueuedAt" = now() WHERE "batchId" = $1` can eliminate the chunked update round-trips entirely.

---

### 🛡️ Multi-Worker Concurrency & Worker Crash Isolation (`npm run test:multiworker`)

To verify race-condition immunity, at-least-once delivery boundaries, and crash recovery, HyperSend includes a multi-process test harness (`npm --prefix backend run test:multiworker`):

```bash
npm --prefix backend run test:multiworker
```

The harness boots 3 isolated worker child processes and verifies delivery using dual tracking: PostgreSQL rows (`status = 'sent'`) and an atomic Redis dispatch ledger (`ledger:dispatches` and `ledger:distinct_emails`).

#### Empirical Multi-Worker Test Results:

| Scenario / Test | Scheduled | Marked Sent (DB) | Dispatches in Ledger | Distinct Email IDs | Duplicate Dispatches | Recovery Time | Total Time |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **TEST 1: 3-Worker Concurrency** *(Normal execution)* | 40 | 40 | 40 | 40 | **0** | N/A | **32.67s** |
| **TEST 2: Worker Mid-Run Crash** *(`kill -9` / SIGKILL on Worker 2)* | 40 | 40 | 40 | 40 | **0** | **34.13s** | **45.00s** |

**Crash Recovery Protocol**: When Worker 2 (PID: 13232) was abruptly terminated via `kill -9` after sending 2 emails, its in-flight locked jobs were isolated. Surviving workers (Worker 1 & Worker 3) detected the orphaned jobs via `BULLMQ_STALLED_INTERVAL_MS` (4s) and `STALE_PROCESSING_MS` (5s), reclaimed the database processing claims, and safely completed all 40 emails with **zero lost updates and zero duplicate dispatches** *(single run of 40 emails with tuned recovery timers; delivery remains at-least-once by design, so this is not a guarantee)*.

---

### Worker Throughput & Rate Control Dynamics
1. **Asynchronous SMTP Dispatch**: The API responds once the batch is durably stored and enqueued (see latency table); SMTP dispatch is fully asynchronous.
2. **Buffer Saturation Prevention**: Bulk inserts and BullMQ enqueuing are chunked in slices of 1,000 to keep memory flat and prevent Redis pipeline timeouts.
3. **Throughput Scaling & Dual Rate Boundaries**:
   - **Burst Dispatch Rate (Inter-Email Delay)**: Staggering is calculated per sender account (`slot = Math.floor(index / senders.length)`). At the configured `DEFAULT_DELAY_MS = 2000` (2 seconds), each sender spaces its dispatches by 2 seconds. Across 5 active senders dispatching in parallel with `WORKER_CONCURRENCY = 5`, this achieves a peak burst rate of **2.5 emails/second** (`5 senders / 2 sec`).
   - **Sustained Hourly Quota**: Sustained throughput is governed by the per-sender hourly quota (`DEFAULT_HOURLY_LIMIT = 200` emails/hour/sender). Across 5 senders, this enforces a strict aggregate ceiling of **1,000 emails/hour**. Once a sender exhausts its 200 emails within a UTC hour, additional jobs for that sender are delayed to the next UTC hour window by the atomic Redis Lua script. (A theoretical ceiling of 9,000 emails/hour would only be reached if the per-sender hourly quota were configured to 1,800 emails/hour).

---

## Assumptions and Shortcuts / Trade-Offs

1. **Google OAuth & Secure Cookie Sessions**: Authenticated via Google OAuth 2.0 with cryptographic state validation and signed HTTP-only JWT session cookies. The frontend client contains no `localStorage` token storage; all API requests use browser-managed secure cookies with `credentials: 'include'`.
2. **Ethereal Test Senders**: Test accounts are generated dynamically on startup/seeding (`npm run seed:senders`) rather than using production SMTP credentials.
3. **UTC Fixed-Window Hourly Quota vs. Rolling Windows**: Hourly limits are tracked against fixed UTC windows (e.g., `rate:{senderId}:2026102114`). This design keeps Redis memory flat ($O(1)$ integer counters with automated 2-hour TTLs). However, fixed windows do not enforce a rolling 60-minute sliding window; an active sender could dispatch up to 200 emails in the final minutes of an hour (e.g. 13:53–13:59) and another 200 at the start of the next hour (14:00–14:07). The **mandatory per-sender minimum delay gate (`gap:{senderId}`)** rate-smooths this boundary so dispatches are paced at $\ge 2$ seconds per sender (leaky-bucket rate pacing), preventing instantaneous socket bursts, but does not guarantee a rolling 60-minute ceiling. For systems requiring strict rolling enforcement, a Redis Sorted Set Sliding Window Log (`ZADD` + `ZREMRANGEBYSCORE`) can be adopted, trading off higher memory footprint.
4. **At-Least-Once Delivery & Dual-Write Mitigation (Redis Dispatch Ledger)**: Sending an email via SMTP is an external network operation that cannot participate in a two-phase commit (2PC) with PostgreSQL. This introduces an unavoidable dual-write boundary:
   - **Mitigation (Redis Dispatch Ledger)**: To minimize duplicate dispatches if a worker process crashes or PostgreSQL experiences lock contention post-SMTP, the worker writes an atomic dispatch receipt to Redis (`dispatched:${emailId}`) before updating the database. The background reconciler (`recoverStaleProcessingEmails`) inspects this ledger before resetting any stale `processing` row; if the receipt exists, it finalizes status directly to `sent` without re-dispatching.
   - **Residual At-Least-Once Risk**: The Redis ledger is a best-effort mitigation layer. If a worker process is terminated abruptly (e.g. SIGKILL / OOM) in the microsecond window between `sendMail` resolving and `redisClient.set` executing, or if Redis is temporarily unreachable, the ledger record cannot be established. In this worst-case dual failure, the reconciler resets the row after the 5-minute stale timeout, resulting in at-least-once re-delivery.
   - **Downstream MTA Deduplication**: As a final defense-in-depth safeguard, outbound emails declare a deterministic RFC 5322 header: `Message-ID: <${emailId}@scheduler.internal>` so downstream Mail Transfer Agents (MTAs) and recipient mailboxes can identify and deduplicate identical deliveries.
5. **Content Sanitization & Safe Markdown**: Rather than relying on fragile regex HTML tag-stripping, the body pipeline strictly escapes all raw HTML input (`&`, `<`, `>`, `"`, `'`) before converting markdown constructs (`**bold**`, `*italic*`, `~~strikethrough~~`, `![alt](url)`, `📎 [Attachment: name](url)`). Images and links are strictly validated against allowlisted protocols (`http://` and `https://`), completely neutralizing arbitrary `<script>`, `<iframe>`, inline `onload/onerror` handlers, and `javascript:` URIs.
6. **Process Model & Cloud SMTP Simulation**: In Docker Compose and multi-container environments, the API server (`src/server.ts`) and Queue Worker (`src/worker.ts`) run as distinct, decoupled OS processes (`SEPARATE_WORKER=true`). On single-container deployments (such as Render's free tier), `server.ts` boots an internal worker runner. Furthermore, because cloud free tiers (e.g. Render) enforce strict outbound firewalls blocking external SMTP connections (port 587), `DEMO_SIMULATE_SMTP=true` is enabled on Render to simulate message delivery and test queue state transitions without socket timeouts. Real Ethereal SMTP dispatch operates natively in Docker and unrestricted environments.
7. **Isolated Demo Recruiter Sessions & Shared Rate Limiting**: Public demo logins (`POST /api/auth/demo`) create isolated, unique ephemeral demo accounts (`demo-guest-*`) with Redis-backed IP rate limiting (maximum 15 sessions/hour per IP, resolving client IPs via Express trusted reverse-proxy headers), ensuring that recruiters evaluating the live app do not collide with or overwrite each other's campaigns across instances.
8. **Clean Distribution Packaging**: Run `npm run package:zip` to export a clean, recruiter-ready distribution archive containing strictly git-tracked files (preventing accidental bundling of local `.env` secrets or database dumps).

---

## Demo & Verification Steps

### 1. Normal Scheduling Flow
1. Start the API, Worker, and Frontend (`docker-compose up -d`, `npm run dev`, `npm run worker`, `npm run client`).
2. Log in with Google at `http://localhost:5173`.
3. Open **Compose New Email**, upload a sample CSV with 10 recipient emails, set delay to 2000ms, and click **Schedule Campaign**.
4. Observe the emails appear in the **Scheduled Emails** tab and progressively move to **Sent Emails** with valid Ethereal preview URLs.

### 2. Worker Restart Persistence Test
1. Schedule 10 emails with a start time 2 minutes in the future.
2. Stop the worker process (`Ctrl+C` in the worker terminal).
3. Confirm in the frontend that the emails remain in `Scheduled Emails`.
4. Restart the worker (`npm run worker`).
5. Verify that the delayed jobs fire at their scheduled time and complete delivery without losing state.

### 3. Rate Limit Rescheduling Test
1. Schedule 20 emails with an hourly limit of 5 and delay of 2000ms.
2. Observe the worker logs: after sending 5 emails, the worker logs `Job rescheduled by rate limit` and delays the remaining jobs until the start of the next UTC hour window.
3. Confirm in the database and dashboard that the remaining emails remain in `scheduled` status without burning retry attempts.

---

## Feature Checklist

### Backend
- [x] Separate API and Worker processes (`src/server.ts` and `src/worker.ts`).
- [x] Pure BullMQ delayed job scheduling (no cron, no `setInterval`, no in-memory schedulers).
- [x] Real Google OAuth 2.0 with state validation and HTTP-only signed JWT cookie.
- [x] Multiple Ethereal sender accounts seeded via `nodemailer.createTestAccount()`.
- [x] Zod validation for request bounds and integer enforcement.
- [x] Single-transaction batch creation and round-robin sender assignment.
- [x] Atomic Redis Lua script combining minimum delay gap and UTC hourly limit.
- [x] BullMQ `moveToDelayed` and `DelayedError` rescheduling.
- [x] Atomic SQL update claim query preventing duplicate worker processing.
- [x] Stalled job recovery handling with delay until stale timeout.
- [x] Structured Pino logger for server, worker, dispatch, failure, and rate-limit events.
- [x] Automatic startup reconciler and standalone `requeue` script.

### Frontend
- [x] Internal-tool UI design with neutral slate palette and 1px borders.
- [x] Google Sign-in authentication flow with HTTP-only session cookies.
- [x] 1-Click Recruiter/Portfolio Demo login for instant evaluation without OAuth setup.
- [x] Sidebar navigation with real-time counters and 3.5s auto-polling refresh.
- [x] Dashboard with Scheduled Emails and Sent Emails tabs.
- [x] Real API-driven paginated tables with loading, error, and empty states.
- [x] Email inspection drawer (`EmailDetailView`) with Markdown rendering and direct Ethereal preview links.
- [x] Compose modal with input validation, datetime-local conversion to UTC ISO, and delay/hourly controls.
- [x] Hand-written CSV/text parser with email regex and deduplication counts.
- [x] Formatted timestamps in user's local timezone.
- [x] Typed API client (`frontend/src/lib/api.ts`).
