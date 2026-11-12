# Milestones & status

| Phase | Scope | Status |
|---|---|---|
| 1 Foundation | env, Prisma schema + migrations, Express app, security/CSRF/rate-limit/sessions, auth (Argon2id + admin MFA), RBAC, audit log | Code complete |
| 2 Core ops | services catalogue, customer CRUD (owner-scoped) + status history + duplicate warning, reports, CSV export | Code complete |
| 3 Wallet/payment | ledger (FOR UPDATE, no-negative, idempotent), Razorpay order + checkout verify + signed webhook, admin adjustments, reconciliation | Code complete |
| 4 FID maker | Playwright PDF (6×4in / 85.6×54mm), ₹5-once reserve→render→settle/refund, free re-download, private storage | Code complete |
| 5 Content & forms | announcements/videos (safe embeds), committees, links, documents (upload), 4 public forms, admin console | Code complete |
| 6 Hardening | jobs (reconciliation/cleanup), e2e flow, docs, go-live checklist | Code complete |

"Code complete" = written and reviewed; run `pnpm test` + `pnpm build` to verify in your environment
(the authoring environment could not reach the npm registry to compile).

## Acceptance-criteria coverage (automated tests)
- AC-01/02 registration validation + approval gating — `auth.flow.test.ts`
- AC-03/04 IDOR / ownership, duplicate, status transitions — `customers.ownership.test.ts`
- AC-05 report totals + CSV injection — `customers.ownership.test.ts`, `csv.test.ts`
- AC-06/07 Razorpay credit-once / bad-signature / failed — `payments.webhook.test.ts`
- AC-08 concurrent spend never negative — `wallet.concurrency.test.ts`
- AC-09 FID ₹5-once / free re-download / failure refund — `fid.charge.test.ts`
- AC-10 valid PDF render (visual dims via UAT print preview) — `fid.render.test.ts`
- AC-11 publish → public visibility — `content.test.ts`, `flows.e2e.test.ts`
- AC-12 unsafe URL/embed + non-https rejected — `safe-url.test.ts`, `content.test.ts`
- AC-13 wallet adjustment needs reason + audit, ledger immutable — ledger design + admin route
- End-to-end journeys — `flows.e2e.test.ts`

## Known gaps / client decisions
- AC-14/15 (responsive at 320px, Lighthouse ≥90) — verify on target devices; layout built mobile-first.
- AC-16 backup restore + monitoring — set up in the deployment environment (see GO-LIVE).
- Storage uses local fs by default; swap `lib/storage.ts` for Supabase private Storage + signed URLs.
- Email/SMS/WhatsApp notifications are out of scope unless separately approved (BPD §3.3).
- Dual-approval for high-value wallet adjustments (BPD 6.6) is configurable future work.
