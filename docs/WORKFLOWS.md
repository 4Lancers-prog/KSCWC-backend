# Core workflows

## Registration & approval
Sign up → `PENDING_APPROVAL` (password Argon2id-hashed, wallet account created). Admin
approve/reject (audited). Only `ACTIVE` users can log in and reach protected routes.
New sign-ups appear in the admin console automatically (queues poll + refetch on focus; nav badges
from `GET /admin/overview`). Reject/suspend reasons are shown to the user at login; suspending
an active user ends their access on their next request.

## Customer records
Operator adds a customer against an active service. Same owner+mobile+service within 24h prompts a
duplicate warning (confirmable). Status follows PENDING → IN_PROGRESS → COMPLETED (or → CANCELLED),
server-guarded, with a `customer_status_history` row per change. All queries are owner-scoped.

## Wallet top-up (UPI, admin-verified)
1. Operator pays the council's UPI QR, then `POST /wallet/manual-topups` with amount + UTR
   (optional screenshot). The UTR is unique: it can be claimed once.
2. Admin checks the UTR against the bank statement → approve (optionally a corrected amount) or
   reject with a reason. Approval atomically claims the PENDING request and credits the wallet in the
   same transaction (ledger key `manual:<id>`), so it can't be credited twice.
3. Operator sees the status + new balance on the Wallet page (auto-refreshes).

## FID card (₹5 once)
Validate → **reserve**: create generation + debit ₹5 in one tx (rolls back if balance < ₹5) →
**render** PDF (Playwright, 6×4in / 85.6×54mm) → **settle** (SUCCEEDED) or, on failure, post a
compensating REFUND and mark FAILED (net zero). Same `Idempotency-Key` never charges twice.
Re-downloading a generated PDF is free (ownership-checked stream).

## Content
Admin drafts/publishes announcements (videos restricted to safe YouTube embeds), manages
committees (type/district, reorder, archive), government links (https only), and documents
(content-validated upload). Public endpoints return only published/active items.

## Applications
Public submit (insurance/membership/training/grievance); grievance returns a ticket code. Admin
moves each through its state machine; all transitions audited. A signed-in operator sees the
status (and any grievance resolution note) under *My applications* (`GET /me/applications`).
