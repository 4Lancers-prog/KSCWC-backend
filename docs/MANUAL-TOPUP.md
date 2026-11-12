# Manual UPI / QR Wallet Top-up

A second top-up method alongside Razorpay: the council publishes a UPI QR, the user pays from
their own UPI app and declares the UTR, and an admin verifies it and credits the wallet.

## Flow
1. **Admin** uploads the payment QR image + UPI ID + payee name (Admin → *UPI ಟಾಪ್-ಅಪ್*). Stored as a
   private object + a `payment_qr` system setting.
2. **User** (Wallet → *UPI / QR*) scans the QR, pays, then submits **amount + UTR** (+ optional
   screenshot). This creates a `PENDING` `ManualTopupRequest`. The UTR is unique, so the same bank
   reference can never be submitted twice.
3. **Admin** sees the pending queue, opens the screenshot if provided, and **Approves** (optionally
   correcting the amount to what the bank actually received) or **Rejects** with a reason.
4. **Approve** credits the wallet through the normal ledger — row-locked, idempotent
   (`manual:<id>`), never negative, append-only — and writes an audit entry. The user sees the
   credit and the request status flip to *ಅನುಮೋದಿತ*.

## Endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/payment-qr` | user | QR config (UPI ID, payee, note, image URL) |
| GET | `/payment-qr/image` | user | QR image bytes |
| POST | `/wallet/manual-topups` | user | Submit a top-up (multipart: amountPaise, utrNumber, note?, screenshot?) |
| GET | `/wallet/manual-topups` | user | The user's own requests |
| PUT | `/admin/payment-qr` | `settings:manage` | Upload/update QR (multipart) |
| GET | `/admin/manual-topups?status=` | `wallet:read:all` | Review queue |
| GET | `/admin/manual-topups/:id/screenshot` | `wallet:read:all` | View payment proof |
| POST | `/admin/manual-topups/:id/approve` | `wallet:adjust` | Credit wallet (optional amount override) |
| POST | `/admin/manual-topups/:id/reject` | `wallet:adjust` | Reject with reason |

## Safeguards
- UTR unique (DB constraint) → no double submission or reuse across users.
- Approve runs inside a transaction that locks the request row and checks it is still `PENDING`,
  so two admins can't double-credit; the ledger idempotency key `manual:<id>` is a second backstop.
- Amount is bounded by `WALLET_TOPUP_MIN_PAISE`/`WALLET_TOPUP_MAX_PAISE` on both submit and approve.
- Uploads (QR + screenshot) are magic-byte validated (PNG/JPEG only), size-capped, stored private.
- Every approve/reject/QR change is written to the audit log.

## Migration (run locally after pulling)
```bash
cd kscwc-backend
pnpm prisma generate
pnpm prisma migrate dev --name manual_topups   # or: pnpm prisma db push
```
This adds the `manual_topup_requests` table and the `ManualTopupStatus` enum.
