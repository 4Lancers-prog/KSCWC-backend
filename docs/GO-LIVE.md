# Go-live checklist

## Decisions to confirm with the client (BPD §19)
- [ ] Legal org name/logo and the non-official FID card wording/disclaimer approved.
- [ ] Exact service list and which customer fields vary by service.
- [ ] Registration approval policy; login identifier (mobile + password) and any OTP/email.
- [ ] Wallet min/max top-up, receipt/tax handling, refund/chargeback policy.
- [ ] FID price (₹5) and whether a regeneration after editing is a new charge.
- [ ] Aadhaar: confirmed that only last-4 is collected (or legal approval for more).
- [ ] Which committee contact fields are public; who approves photos/bios.
- [ ] Hosting, expected load, uptime target, backup policy.

## Technical gates
- [ ] Production DB + storage separate from staging; migrations reviewed; backups + a tested restore.
- [ ] No demo credentials, demo wallet credit, fake payment paths, or localStorage persistence.
- [ ] Razorpay **live** keys + webhook secret configured; webhook reachable; tested with a small
      real transaction; reconciliation alerts on.
- [ ] Admin MFA enabled; initial SUPER_ADMIN created securely; least-privilege roles verified.
- [ ] HTTPS, secure cookies, CORS allowlist, security headers, rate limits confirmed in prod config.
- [ ] Private buckets by default; signed/authenticated downloads tested; IDOR tests pass.
- [ ] `npx playwright install chromium` on the API host; Kannada font present; PDF verified on
      print preview (mobile, desktop) at 6×4in / 85.6×54mm.
- [ ] `pnpm test` green (unit + integration incl. AC-03/05/06/07/08/09); e2e flow passes.
- [ ] Lighthouse mobile ≥ 90 on the public home; images lazy-loaded; tables paginated.
- [ ] Error monitoring (e.g. Sentry), uptime checks, structured logs with request ids.
- [ ] Privacy notice, consent wording, retention policy approved.
- [ ] Client UAT sign-off across all screens, status transitions, fees, wallet, reports, admin.
