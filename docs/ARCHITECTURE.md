# Architecture

## Overview
KSCWC is a two-project system:

- **kscwc-frontend** — React 18 + TypeScript + Vite SPA (public site, operator dashboard, admin console).
- **kscwc-backend** — Node 22 + TypeScript + Express modular monolith. Owns all business rules.
  MongoDB (Atlas in production) is the single source of truth.

They are deployed separately. The browser talks to the API over `/api/v1` with cookie sessions
(`credentials: include`) + a double-submit CSRF token. No business data lives in the browser.

```
Browser (SPA) ──/api/v1──► Express API ──► MongoDB (source of truth)
                               │             └─ ledger, orders, audit (transactional)
                               ├──► Playwright/Chromium (FID PDF)
                               └──► Private file storage (local fs or Supabase Storage)
```

## Backend layering
- `config/` — env (Zod-validated, fail-fast), permissions (RBAC matrix), constants.
- `lib/` — infrastructure singletons: Mongoose connection + transactions, pino logger, session store, private storage.
- `middleware/` — request context, security headers + CORS, CSRF, rate limit, session load,
  auth/role/ownership guards, Zod validation, async wrapper, error handler, 404.
- `modules/<feature>/` — each feature is `routes` (Express Router) + `service` (business rules,
  transactions, state guards) + `repository` (Mongoose data access). Boundaries stay clean so a
  module could later be extracted.
- `shared/` — enums/constants + Zod schemas + the API error-envelope types (mirrored on the client).
- `jobs/` — node-cron: payment reconciliation (10 min), housekeeping (daily).

## Key invariants (enforced structurally)
- A balance change happens **only** through `wallet-ledger.service` (atomic conditional update, transaction, no-negative,
  immutable POSTED entries, unique idempotency key).
- A UPI top-up credits **once**: approval atomically claims the PENDING request and posts the
  credit with ledger key `manual:<requestId>` in the same transaction; a UTR can be claimed only once.
- FID generation charges ₹5 once: reserve+debit in one tx → render → settle, or compensating
  refund on failure (net zero). Re-download is free.
- Every privileged mutation writes an append-only `audit_logs` entry with actor + request id.
- Public content is visible only when published/active.

## Frontend layering
Feature-first: `features/<name>/{*.api.ts, components, pages}`. Shared `components/ui` primitives,
`components/layout` shells (public/dashboard/admin), route `guards`, `lib` (api-client, query-client,
formatting), `i18n` (Kannada-first + English helper). TanStack Query for server state; React Hook
Form + Zod for forms (same validation shape as the server).
