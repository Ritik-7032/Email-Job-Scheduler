# ReachInbox Email Job Scheduler

An email job scheduling system built with TypeScript, Express, BullMQ, Redis, PostgreSQL, Prisma, Nodemailer (Ethereal SMTP), and React.

---

## 🌐 Live Deployments

- 🚀 **Frontend Web Application (Vercel)**: [https://email-job-scheduler-alpha.vercel.app](https://email-job-scheduler-alpha.vercel.app)
- ⚙️ **Backend API & Queue Worker (Render)**: [https://reachinbox-scheduler-backend.onrender.com](https://reachinbox-scheduler-backend.onrender.com)
- 📦 **GitHub Repository**: [https://github.com/Ritik-7032/Email-Job-Scheduler](https://github.com/Ritik-7032/Email-Job-Scheduler)

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
- **Testing**: Vitest, Supertest (30/30 Unit Tests).
- **Infra**: Docker Compose (Full-stack containerization with isolated network & persistent volumes).

---

## 🚀 1-Command Docker Quickstart (For Sharing & Evaluation)

You can run the **entire full-stack application** with a single command:

```bash
docker-compose up --build
```

**What this launches automatically:**
- **PostgreSQL 16** (`reachinbox-postgres`) on port `5432` with automated schema push.
- **Redis 7** (`reachinbox-redis`) on port `6379` with AOF persistence.
- **Backend API Server** (`reachinbox-api`) on port `5000` with auto-seeded Ethereal test senders.
- **BullMQ Background Worker** (`reachinbox-worker`) processing scheduled email jobs.
- **React Frontend UI** (`reachinbox-frontend`) served via Nginx on **[http://localhost:5173](http://localhost:5173)**.

To stop the containers:
```bash
docker-compose down
```

---

## 💻 Local Development Setup (Without Docker)

If you prefer to run services individually in separate terminals:

```bash
# 1. Install dependencies
npm install

# 2. Seed Ethereal sender accounts in database (first time)
npm --prefix backend run seed:senders

# 3. Start Backend API (Terminal 1)
npm run dev

# 4. Start BullMQ Worker (Terminal 2)
npm run worker

# 5. Start React Frontend (Terminal 3)
npm run client
```

---

## Requirement to Implementation Mapping

| Assignment Requirement | Technical Implementation |
| :--- | :--- |
| **No cron / No in-memory scheduler** | BullMQ delayed jobs (`jobId = email.id`, `delay = scheduledAt - now`) |
| **Persistence across restarts** | PostgreSQL relational DB (source of truth) + Redis AOF persistence |
| **Idempotency & Concurrency** | Stable UUID job IDs + Atomic raw SQL conditional claims (`UPDATE ... WHERE status = 'scheduled'`) |
| **Rate Limiting & Minimum Delay** | Atomic Redis Lua script combining sender gap key (`gap:ID`) and UTC hourly counter (`rate:ID:window`) |
| **Rescheduling on Limit** | `job.moveToDelayed(Date.now() + waitMs, token)` followed by BullMQ `DelayedError` |
| **Worker Concurrency** | Separate BullMQ Worker process (`concurrency = 5`) |
| **Multiple Senders** | PostgreSQL `Sender` table with round-robin sender assignment during batch creation |
| **Restart Recovery** | Redis AOF queue survival + Startup orphan requeuer (`enqueuedAt IS NULL`) |
| **SMTP Delivery** | Nodemailer with dynamically seeded Ethereal accounts and test preview links |
| **Authentication** | Real Google OAuth 2.0 with state verification and signed HTTP-only JWT cookies |
| **Frontend Dashboard** | React + Vite + Tailwind CSS with Scheduled/Sent tabs, paginated tables, CSV parser, and Compose Modal |

---

## Folder Structure

```
reachinbox-scheduler/
├── backend/
│   ├── prisma/
│   │   ├── migrations/           # SQL migration files
│   │   └── schema.prisma         # Prisma models & indexes
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
| `MIN_DELAY_BETWEEN_EMAILS_MS` | Minimum delay allowed between consecutive sends | `2000` |
| `MAX_EMAILS_PER_HOUR` | Maximum allowed hourly limit per sender | `200` |
| `DEFAULT_DELAY_MS` | Default delay in UI | `2000` |
| `DEFAULT_HOURLY_LIMIT` | Default hourly limit in UI | `200` |
| `MAX_RECIPIENTS_PER_REQUEST` | Maximum recipient count in a single request | `10000` |
| `STALE_PROCESSING_MS` | Crash recovery duration for stuck processing rows | `300000` (5 mins) |

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

## Setup & Running Instructions

### 1. Start Database & Redis
```bash
docker-compose up -d
```

### 2. Run Database Migrations & Seed Senders
```bash
cd backend
npm install
npx prisma migrate dev
npm run seed:senders
```

### 3. Install Frontend Dependencies
```bash
cd ../frontend
npm install
```

### 4. Start the Application

Run the three processes in separate terminal tabs:

- **API Server**:
  ```bash
  npm run dev
  # or from root: npm run dev
  ```
- **Background Worker**:
  ```bash
  npm run worker
  # or from root: npm run worker
  ```
- **Frontend Client**:
  ```bash
  npm run client
  # or from root: npm run client
  ```

Access the dashboard at `http://localhost:5173`.

---

## API Endpoints

| Method | Endpoint | Description | Auth Required | Body / Query |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/health` | Health check endpoint | No | None |
| `GET` | `/api/auth/google` | Initiates Google OAuth with state cookie | No | None |
| `GET` | `/api/auth/callback` | Exchanges code, verifies state, sets JWT cookie | No | Query: `code`, `state` |
| `GET` | `/api/auth/me` | Returns current authenticated user profile | Yes | None |
| `POST` | `/api/auth/logout` | Clears JWT cookie | Yes | None |
| `POST` | `/api/emails/schedule` | Schedules a new email batch | Yes | Body: `{ subject, body, recipients, startAt, delayMs, hourlyLimit }` |
| `GET` | `/api/emails/scheduled` | Returns scheduled and processing emails | Yes | Query: `limit`, `offset` |
| `GET` | `/api/emails/sent` | Returns sent and failed emails | Yes | Query: `limit`, `offset` |

---

## Scheduling Flow & Rate Limiting Mechanics

### 1. Ingestion & Staggering
1. `POST /api/emails/schedule` validates input with Zod (`delayMs >= 2000`, `hourlyLimit <= 200`, valid future ISO `startAt`, max 10000 recipients).
2. Within a single PostgreSQL transaction:
   - Creates a `Batch` record.
   - Computes staggered `scheduledAt = startAt + index * delayMs` for each recipient.
   - Assigns senders round-robin across active senders in the database.
   - Ingests `Email` records into PostgreSQL in chunks of 1,000 (`DB_CHUNK_SIZE = 1000`) to prevent parameter overflow and high peak memory.
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

### Enqueue & Crash Recovery Window
- If the API server crashes after inserting database rows but before BullMQ enqueueing finishes, the rows remain with `enqueuedAt = null`.
- On API startup and via `npm run requeue`, `requeueOrphanedEmails()` executes a chunked while-loop (fetching in chunks of 500) to recover any volume of orphaned records (>500 or 1000+) without loading the entire backlog into memory, enqueueing them with their stable UUID `jobId`.
- Additionally, `recoverStaleProcessingEmails()` inspects rows stuck in `processing`: if `messageId` was already assigned, status is safely reconciled to `sent`; if attempts are exhausted, status is marked `failed`; otherwise, status is reset to `scheduled` for safe re-enqueueing and retry.

---

## Handling 1000+ Emails

The system easily scales to 1,000+ and 10,000 recipients without blocking the API or exhausting resources:
1. **Request Payload**: Express JSON body size is configured for 2MB, accommodating large recipient arrays.
2. **Database Ingestion**: Uses a single `Batch` creation and chunked `prisma.email.createMany` in slices of 1,000 (`DB_CHUNK_SIZE`) inside a single transaction.
3. **Queue Enqueueing**: Uses `queue.addBulk(jobs)` in chunks of 1,000 to prevent Redis command buffer saturation.
4. **Non-blocking API**: The API immediately returns `{ batchId, count }` upon queue dispatch; SMTP delivery is handled purely asynchronously by background workers.
5. **Worker Concurrency & Rate Control**: Concurrency (`WORKER_CONCURRENCY = 5`) and Lua rate gating govern throughput smoothly without spikes.

---

## Assumptions and Shortcuts / Trade-Offs

1. **Google OAuth**: A single verified Google account creates or logs into a user account with signed HTTP-only JWT session cookies.
2. **Ethereal Test Senders**: Test accounts are generated dynamically on startup/seeding rather than using production SMTP credentials.
3. **UTC Hourly Windows**: Hourly limits reset at the start of each UTC hour (e.g. `14:00:00 UTC`), rather than on a rolling 60-minute sliding window.
4. **SMTP/DB Failure Window Trade-off**: Sending an email via SMTP is an external non-transactional network operation that cannot be joined into an atomic two-phase commit (2PC) with PostgreSQL. Under normal operations, atomic SQL row claims prevent duplicate worker dispatches. If a worker process crashes precisely after SMTP accepts a message but before PostgreSQL commits the `sent` status, the recovery process uses `messageId` tracking and backoff retries to minimize any risk of duplicate sending. True exactly-once delivery across external SMTP gateways is physically impossible without downstream mail server idempotency keying.

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
- [x] Google Sign-in authentication flow.
- [x] Dashboard with Scheduled Emails and Sent Emails tabs.
- [x] Real API-driven paginated tables with loading, error, and empty states.
- [x] Direct Ethereal preview links for sent emails.
- [x] Compose modal with input validation, datetime-local conversion to UTC ISO, and delay/hourly controls.
- [x] Hand-written CSV/text parser with email regex and deduplication counts.
- [x] Formatted timestamps in user's local timezone.
- [x] Typed API client (`frontend/src/lib/api.ts`).
