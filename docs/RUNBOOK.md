# Runbook — local setup & operations

## Prerequisites
- Node.js 22 LTS, pnpm 9+
- MongoDB 7+ as a replica set: MongoDB Atlas (free M0 works), or `docker compose up -d`
- For FID PDFs: `npx playwright install chromium` (once), and a Kannada TTF in `assets/fonts/`.

## First-time setup (backend)
```bash
cd kscwc-backend
cp .env.example .env            # fill DATABASE_URL, DIRECT_URL, TEST_DATABASE_URL,
                                # SESSION_SECRET, CSRF_SECRET (32+ chars each)
pnpm install
pnpm db:generate
pnpm db:seed                    # creates collections + indexes, seeds services/content/admin
pnpm db:seed                    # services + demo content + prints a dev SUPER_ADMIN password
pnpm dev                        # http://localhost:4000
```

### Create a test database (for `pnpm test`)
```bash
createdb kscwc_test             # point TEST_DATABASE_URL at it
pnpm test                       # vitest runs; global setup pushes the schema to the test DB
pnpm test:int                   # integration tests only
```

## Frontend
```bash
cd kscwc-frontend
cp .env.example .env            # leave VITE_API_BASE_URL empty for the dev proxy
pnpm install
pnpm dev                        # http://localhost:5173 (proxies /api → :4000)
```

## Environment variables (backend)
Server-only: `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, `CSRF_SECRET`,
`SUPABASE_SERVICE_ROLE_KEY` (only for Supabase file storage), `STORAGE_DIR`.
Operational: `WALLET_TOPUP_MIN/MAX_PAISE`,
`FID_GENERATION_PRICE_PAISE` (500), `MAX_UPLOAD_SIZE_BYTES`, `CORS_ALLOWLIST`.

Env is validated at startup (`config/env.ts`) — the process exits if a required var is missing.

## Payments in dev

## Jobs
`node-cron` registers at boot: payment reconciliation every 10 min, housekeeping daily. Disabled
under `NODE_ENV=test`.

## Storage backend
`lib/storage.ts` picks its backend from env: **Supabase private Storage** when `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` are set (create a **private** bucket named `OBJECT_STORAGE_BUCKET_PRIVATE`
in the Supabase dashboard first), otherwise the **local filesystem** under `STORAGE_DIR` (default
`./storage`). Routes stream downloads after an ownership/visibility check; `getSignedUrl()` is
available if you prefer short-lived signed links. The startup log prints `storage=supabase|local-fs`.

## Monitoring
Set `SENTRY_DSN` to enable server error monitoring (5xx exceptions are reported with request id,
path and user id; disabled when empty). Structured logs (pino) carry a request/correlation id on
every line. Point an uptime check at `GET /health/ready`.

## Health
`GET /health/live` (process up), `GET /health/ready` (DB reachable).
