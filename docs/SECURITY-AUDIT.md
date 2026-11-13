> **Note (Nov 2026):** this audit predates the move to MongoDB and the removal of Razorpay. Ledger
> safety now uses atomic conditional updates inside MongoDB transactions plus unique indexes
> (see `docs/DATABASE.md`); there is no payment webhook. Items below about Prisma/PostgreSQL row locks,
> the DB CHECK constraint and Razorpay secrets no longer apply.

# KSCWC Portal — Complete Security Audit

**Date:** 2026-11-07
**Scope:** `kscwc-backend` (Node 22 · TypeScript · Express · Prisma/PostgreSQL) and `kscwc-frontend` (React · Vite · TypeScript SPA)
**Method:** Full source-level review of every module, middleware, and shared utility, plus the frontend auth/data layer. Dynamic execution was not available in the review environment (sandboxed package registry), so every finding is derived from reading the code as committed. Items that can only be confirmed at deploy time are listed under **Go-live gates**.
**Previous pass:** The first audit (see `SECURITY.md`) found and fixed 4 issues — session fixation, missing session invalidation on password reset, plaintext TOTP secrets, and unthrottled public write endpoints. This pass re-verifies all four are in place and extends coverage to every remaining surface, including the admin edit endpoints, service catalogue, separate admin login, document handling, and the FID renderer.

---

## 1. Verdict

The application is built to a strong security baseline. Authentication, session management, CSRF, RBAC, the money ledger, and the payment paths are all implemented with the right primitives and no exploitable gaps were found. There are **no Critical or High findings.** One **Medium** item (admin MFA is available but not policy-enforced) and a set of **Low/Informational** hardening items are listed below, followed by the deploy-time gates that must be verified before go-live.

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 6 |
| Informational | 4 |

---

## 2. Coverage matrix

| Surface | Reviewed | Result |
|---|---|---|
| Middleware order & app wiring (`app.ts`) | ✓ | Correct — raw webhook body before JSON parser; session → auth → CSRF → rate-limit |
| Security headers / CORS (`security.ts`) | ✓ | helmet on; credentialed CORS allowlist enforced |
| CSRF (`csrf.ts`) | ✓ | Double-submit cookie, timing-safe compare, safe-method exemption |
| Rate limiting (`rate-limit.ts`) | ✓ | Global + login (skip-success) + public-submit limiter |
| Error handling (`error-handler.ts`) | ✓ | No stack/`5xx` detail leakage; Zod/Prisma mapped |
| Auth — register/login/logout/reset/MFA (`auth.*`) | ✓ | Argon2id, uniform failures, session regeneration, MFA on raw-verify |
| Session store (`session-store.ts`, `load-session.ts`) | ✓ | PG-backed, httpOnly, Secure in prod, SameSite=lax, fresh user load per request |
| RBAC (`permissions.ts`, `require-role.ts`, `require-auth.ts`) | ✓ | Server-authoritative permission matrix; account-status gate |
| Ownership / IDOR (`customers.service.ts`) | ✓ | Owner-scoped; privileged bypass gated; existence hidden (`notFound`) |
| Wallet ledger (`wallet-ledger.service.ts`) | ✓ | Row lock, idempotency key, no-negative + DB CHECK backstop, append-only |
| Payments — checkout + webhook (`payments.*`) | ✓ | HMAC on raw bytes, order ownership, credit-once idempotency |
| FID generation + PDF renderer (`fid.*`) | ✓ | Charge-once, compensating refund, HTML-escaped template, validated photo data-URL |
| Documents upload/download (`documents.*`) | ✓ | Magic-byte sniff, type allowlist, size cap, attachment disposition |
| Content: announcements / committees / links / services | ✓ | Permission-gated CRUD; explicit field mapping (no mass assignment) |
| Public applications: insurance/membership/training/grievance | ✓ | Rate-limited, Zod-validated, rendered through React escaping |
| CSV export (`csv.ts`) | ✓ | Formula-injection prefixing + quote/comma/newline escaping |
| URL handling (`safe-url.ts`) | ✓ | Scheme allowlist (https only), validated YouTube embeds |
| Object storage (`storage.ts`) | ✓ | Path-traversal guard; server-generated random keys |
| Crypto at rest (`crypto.ts`) | ✓ | AES-256-GCM authenticated encryption for TOTP secrets |
| Env validation (`env.ts`) | ✓ | Zod fail-fast; secret minimum lengths |
| Frontend api-client + query-client | ✓ | Cookie session + CSRF echo; sanitized error surfacing via toasts |

---

## 3. Confirmed controls (the baseline that holds)

- **Password storage:** Argon2id (`memoryCost 19456, timeCost 2`). Login verifies against the stored hash and returns a **uniform** "Invalid mobile number or password" whether or not the account exists, defeating user enumeration.
- **Session fixation fixed:** `session.regenerate()` is awaited on every successful login before `session.userId` is set (`auth.service.ts:118`).
- **Reset invalidates sessions fixed:** `resetPassword` calls `repo.deleteUserSessions()` (parameterized `$executeRaw` on the session table) so a compromised session cannot survive a password reset.
- **TOTP secrets encrypted fixed:** secrets are stored via `encryptSecret` (AES-256-GCM) and only ever decrypted in-memory for verification; the plaintext secret is returned exactly once, at enrolment, for the QR code.
- **Public writes throttled fixed:** `publicSubmitRateLimit` (20 / 15 min) is applied to `/auth/register` and the public application submit routes.
- **CSRF:** double-submit cookie; mutating requests must echo the non-HttpOnly token cookie in `x-csrf-token`; compared with `crypto.timingSafeEqual`. A cross-site attacker cannot read the cookie, so cannot forge the header.
- **RBAC is server-authoritative:** every admin route is behind `requirePermission(...)`, which checks the user, an ACTIVE account status, and the role→permission matrix. UI hiding is treated as cosmetic only.
- **IDOR-safe ownership:** `getCustomer`/`updateCustomer`/`changeStatus` reject non-owners with `notFound` (not `forbidden`), so record existence is not disclosed; list queries force `ownerUserId = requester.id` unless the caller holds `customers:read:all`.
- **Money integrity:** the ledger is the only path that mutates a balance — it takes a `SELECT … FOR UPDATE` row lock, enforces a unique `idempotencyKey`, refuses to go negative (with a DB CHECK backstop), and only ever INSERTs POSTED rows (immutable, append-only).
- **Payments credit exactly once:** both the Checkout callback (signature-verified, order-ownership-checked) and the webhook (HMAC verified on the **raw** request body before any parsing) converge on `creditCapturedOrder`, which is idempotent under concurrent/duplicate delivery via the order lock and a unique `topup:<orderId>` ledger key.
- **Error hygiene:** `5xx` responses collapse to "Something went wrong"; only `AppError` instances with `expose: true` reveal their message; stack traces never reach the client.
- **Upload safety:** documents are restricted to PDF/PNG/JPEG/DOCX by a magic-byte sniff (not just the declared MIME), size-capped at both multer and service layers, stored under a random key, and served with `Content-Disposition: attachment`, so a crafted file cannot execute as inline content.

---

## 4. Findings

### MEDIUM

**M1 — Admin MFA policy enforcement — RESOLVED (config-gated).**
Previously TOTP MFA was enforced at login only *when already enabled*, so an admin with `mfaEnabled = false` could use a password alone. Now, when `ADMIN_MFA_REQUIRED=true`, an admin/super-admin who has not enrolled TOTP is logged in with a restricted session (`session.mfaSetupRequired`) that the `enforceMfaSetup` middleware confines to the MFA-setup routes (`/auth/mfa/setup`, `/auth/mfa/confirm`, `/auth/me`, `/auth/logout`, `/auth/csrf`) until enrolment completes; the flag is lifted on successful `confirmMfa`. The flag defaults **off** so first-run and local setup are not broken — production sets it to `true` per the go-live checklist.
*Remaining (frontend):* the SPA still needs an MFA-enrolment screen (QR from `/auth/mfa/setup`, code confirm to `/auth/mfa/confirm`) and handling of the `mfaSetupRequired` flag returned by login/`/me`. The backend endpoints and enforcement are in place.

### LOW

**L1 — Payment/Razorpay secrets default to placeholders in `env.ts`.**
`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SESSION_SECRET`/`CSRF_SECRET` (min 16) have permissive defaults or low minimums. A production boot with the placeholders unset would start successfully but fail payment verification (fails *closed*, not a credit bypass). *Recommendation:* in `env.ts`, when `NODE_ENV === 'production'`, require the real Razorpay values and raise the secret minimum to 32 bytes.

**L2 — `PRIVATE` documents are readable by any authenticated user.**
`getForDownload` only checks that a requester id exists for `PRIVATE` docs — there is no per-role or per-owner scoping. If `PRIVATE` is meant as "staff-only" or "owner-only," any logged-in operator can fetch any private document by id. If `PRIVATE` simply means "logged-in users only" (shared council material), this is by design. *Recommendation:* confirm intent; if staff-only, gate the private branch behind `documents:manage` or a role check.

**L3 — No dedicated rate limit on `/payments/verify`.**
Only the global limiter applies. Brute-forcing an HMAC-SHA256 signature is infeasible and the order-ownership check blocks cross-user attempts, so impact is negligible — but a tight per-user limiter here is cheap defense-in-depth.

**L4 — MFA key derives from `SESSION_SECRET` when `MFA_ENC_KEY` is unset.**
`crypto.ts` derives the AES key from `MFA_ENC_KEY || SESSION_SECRET`. Rotating `SESSION_SECRET` (e.g. during an incident) would make all stored TOTP secrets undecryptable and lock admins out of MFA. *Recommendation:* set a dedicated, stable `MFA_ENC_KEY` in production and document that it must not be rotated casually (rotation needs a re-enrolment flow).

**L5 — FID renderer launches Chromium with `--no-sandbox`.**
`fid-pdf.renderer.ts:108`. The template is safe (all text is HTML-escaped; the only unescaped field, the photo, is validated to a strict `data:image/(png|jpeg);base64,…` shape, so no markup/URL injection is possible). The residual risk is purely the disabled Chromium sandbox. *Recommendation:* run the renderer process as a non-root user and/or apply a seccomp profile in the container; remove `--no-sandbox` if the base image permits.

**L6 — FID generation performs a synchronous headless render per request.**
Each call launches a browser and renders a PDF. It is self-limited (each costs the ₹5 wallet charge), but a burst from funded accounts could exhaust memory/CPU. *Recommendation:* add a small concurrency cap or a render queue, and reuse a single browser instance.

### INFORMATIONAL

**I1 — Admin-login separation is a client-side UX gate only.** The separate `/admin/login` route and `RequireStaff` guard improve UX but are *not* access control; server RBAC (`requirePermission`) is authoritative and was verified on every admin route. Documented here so the client gate is never mistaken for the control.

**I2 — Dead stub `require-ownership.ts`.** The file is an empty comment; ownership is enforced in the service layer. Remove it so a future contributor doesn't assume middleware-level enforcement exists.

**I3 — CORS rejection surfaces as `500`.** A disallowed origin throws inside the `cors` origin callback, which the error handler renders as a generic 500 rather than a clean 403. Cosmetic.

**I4 — `crypto.decryptSecret` accepts legacy plaintext.** Values without the `iv.tag.ct` shape are returned as-is for backward compatibility. Harmless once all secrets are encrypted; consider removing the fallback after a migration window.

---

## 5. Go-live gates (verify at deploy time)

These cannot be confirmed from source alone and must be checked against the running environment:

1. **`trust proxy` hop count** — `app.set('trust proxy', 1)` assumes exactly one proxy in front of the app. If there are zero or two+ hops, `req.ip` (and therefore rate limiting) and Secure-cookie detection can be wrong or spoofable. Set it to the real hop count.
2. **Strong secrets set** — `SESSION_SECRET`, `CSRF_SECRET` ≥ 32 random bytes; dedicated `MFA_ENC_KEY`; real `RAZORPAY_KEY_SECRET` + `RAZORPAY_WEBHOOK_SECRET`; `CORS_ALLOWLIST` restricted to the real frontend origin(s). None left at defaults.
3. **HTTPS everywhere** — so `secure` cookies are sent; add HSTS at the edge.
4. **CSP actually applied** — the frontend ships `public/_headers` (CSP + security headers). This is inert unless the host (Netlify/Vercel/your nginx) honors it. Confirm the response carries the CSP.
5. **Shared stores for multi-instance** — rate limiting is in-memory; behind more than one instance, limits are per-process and bypassable. Move to a shared store (e.g. Redis) if horizontally scaled. Sessions are already in Postgres, so they are fine.
6. **DB CHECK constraint present** — confirm the migration that enforces `balance_paise >= 0` on `wallet_accounts` is applied; it is the backstop behind the application-level no-negative check.
7. **Chromium in the container** — ensure the renderer process is not running as root (see L5), and that `assets/fonts/NotoSansKannada*.ttf` is present for correct Kannada output.
8. **Backups & audit retention** — the append-only `audit_log` and `wallet_transactions` are the system of record; ensure they are backed up and retained per policy.

---

## 6. Not findings (reviewed, accepted)

- Global BigInt→Number `toJSON` patch — money is paise and stays within `2^53`; correct and not a security issue.
- Password-reset `devToken` in the response — gated to non-production only (`isProd ? {} : { devToken }`).
- Public document/announcement/committee/link read endpoints are intentionally unauthenticated (published content).
- Webhook route has no CSRF — correct; it is a server-to-server callback authenticated by HMAC, mounted before the CSRF middleware with a raw-body parser.
- Prisma raw queries (`FOR UPDATE`, session delete) all use tagged-template parameterization — no SQL injection.
