# Core workflows

## Registration & approval
Sign up → `PENDING_APPROVAL` (password Argon2id-hashed, wallet account created). Admin
approve/reject (audited). Only `ACTIVE` users can log in and reach protected routes.

## Customer records
Operator adds a customer against an active service. Same owner+mobile+service within 24h prompts a
duplicate warning (confirmable). Status follows PENDING → IN_PROGRESS → COMPLETED (or → CANCELLED),
server-guarded, with a `customer_status_history` row per change. All queries are owner-scoped.

## Wallet top-up (Razorpay)
1. `POST /wallet/topups` → create local `payment_orders` row + Razorpay order (server secret).
2. Browser opens Checkout with the order id; on success posts identifiers+signature to
   `POST /payments/verify`.
3. Server verifies `HMAC(order|payment, key_secret)`, then credits once.
4. Webhook (`payment.captured`) verifies `HMAC(rawBody, webhook_secret)` and credits once too.
   Both paths lock the order row and use ledger key `topup:<orderId>` → exactly one credit, in any
   order, any number of deliveries. Reconciliation job catches missed callbacks.

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
moves each through its state machine; all transitions audited.
