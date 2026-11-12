# Database

PostgreSQL 16. Prisma schema in `prisma/schema.prisma`; migrations are the source of truth
(`pnpm db:migrate:dev` locally, `pnpm db:migrate` / `prisma migrate deploy` in CI/prod).

## Conventions
- UUID primary keys (`gen_random_uuid`). Money as **integer paise** (`bigint`). Timestamps
  `timestamptz` (UTC), displayed in Asia/Kolkata by the client.
- Foreign keys use `RESTRICT` for financially significant rows; soft-delete/archive
  (`deleted_at` / `archived_at` / `is_active`) where audit history must remain.

## Core tables
`users`, `password_reset_tokens`, `services`, `customers`, `customer_status_history`,
`wallet_accounts`, `wallet_transactions`, `payment_orders`, `payment_events`, `fid_generations`,
`announcements`, `committee_members`, `government_links`, `documents`, `insurance_requests`,
`membership_applications`, `training_registrations`, `grievances`, `audit_logs`, `system_settings`.
Sessions live in a `session` table managed by connect-pg-simple.

## Integrity highlights
- `wallet_accounts.balance_paise` has `CHECK (>= 0)`; one wallet per user (`user_id UNIQUE`).
- `wallet_transactions.idempotency_key UNIQUE` — the double-credit / double-charge guard.
- `payment_orders.razorpay_order_id UNIQUE`, `payment_events.provider_event_id UNIQUE` — payment
  idempotency.
- `fid_generations.idempotency_key UNIQUE`, one linked charge transaction.

## Indexes
`users(phone_normalized)`, `customers(owner_user_id, created_at)`,
`customers(owner_user_id, service_id, status)`, `customers(owner_user_id, mobile_normalized)`,
`wallet_transactions(user_id, created_at)`, `payment_orders(razorpay_order_id)`,
`announcements(status, publish_at)`, `committee_members(committee_type, district, sort_order)`,
and status/date indexes on the application tables.

## Backups
Use managed PITR (Supabase) or scheduled `pg_dump`; test restores before go-live. Keep production
data isolated from staging/test.
