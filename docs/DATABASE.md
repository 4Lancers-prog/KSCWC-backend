# Database — MongoDB

MongoDB (Atlas in production) via **Mongoose**. All collections are defined in
`src/db/models.ts`; there are no migrations. Collections and indexes are created by
`npm run db:seed` / `npm run db:indexes`, and missing indexes are also built on startup.

**A replica set is required**, because wallet operations use multi-document transactions.
Every Atlas cluster, including the free M0 tier, is a replica set. Locally, run `mongod --replSet rs0`
once and `rs.initiate()` (see RUNBOOK), or use the provided `docker-compose.yml`.

## Conventions
- `_id` is a **string UUID** (same id format as before), so API ids are unchanged.
- Money is **integer paise** stored as a Number, validated as a whole number ≥ 0.
- `createdAt` / `updatedAt` are managed by Mongoose timestamps (UTC).
- Relations are stored as id fields (`ownerUserId`, `serviceId`, …). Customers embed their
  service + owner in API responses via populate.

## Collections
users · password_reset_tokens · services · customers · customer_status_history ·
wallet_accounts · wallet_transactions · manual_topup_requests · fid_generations ·
announcements · committee_members · government_links · documents · insurance_requests ·
membership_applications · training_registrations · grievances · audit_logs · system_settings ·
sessions (login sessions, managed by connect-mongo with a TTL index).

## Integrity rules (unique indexes)
- `users.phoneNormalized` unique; `users.emailNormalized` unique when present.
- `services.code`, `grievances.ticketCode`, `password_reset_tokens.tokenHash` unique.
- `wallet_accounts.userId` unique — one wallet per user.
- `wallet_transactions.idempotencyKey` unique — the same money operation can never post twice.
- `manual_topup_requests.utrNumber` unique — one bank payment can only be claimed once.
- `fid_generations.idempotencyKey` unique — a double click generates (and charges) once.

## Money safety
`wallet-ledger.service.ts` is the only code that changes a balance:
- A debit is a single conditional update `{ userId, balancePaise ≥ amount } → $inc −amount`,
  so the balance can never go below zero.
- Every post runs inside a transaction together with its ledger entry. Two concurrent posts for
  the same wallet conflict on the wallet document; MongoDB aborts one and it is retried, after
  which the idempotency check sees the first one's committed entry.
- Top-up approval atomically flips `PENDING → APPROVED` before crediting (two admins can't both
  credit), inside the same transaction as the credit.

## Backups
Atlas: enable **Cloud Backup** (point-in-time restore on paid tiers; M0 has no automatic backups,
so take periodic `mongodump` exports). Test a restore before go-live.
