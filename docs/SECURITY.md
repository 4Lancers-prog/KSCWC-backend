# Security & privacy controls

## AuthN / AuthZ
- Argon2id password hashing; login failures are uniform (no user enumeration) and rate-limited.
- Sessions are server-side (MongoDB via connect-mongo, TTL-expired), cookie is **HttpOnly, SameSite=lax,
  Secure in production**. No tokens in localStorage.
- Admin/super-admin accounts support **TOTP MFA**; the TOTP secret is **encrypted at rest** (AES-256-GCM, `lib/crypto.ts`).
- The session id is **regenerated on login** (anti session-fixation); a **password reset invalidates all existing sessions** for that user.
- Registration and public form submissions are **rate-limited** (stricter than the global limit) to curb abuse.
- Every protected endpoint re-checks session + ACTIVE status + role/permission. Hiding a button is
  never access control. Ownership is enforced in the service layer (`owner_user_id = self` unless a
  role grants cross-user access); cross-user reads return 404 (no existence leak) — see AC-03 tests.

## Transport / headers
- HTTPS in production, `helmet` security headers, CORS allowlist (credentialed) from
  `CORS_ALLOWLIST`, double-submit CSRF on all mutating routes (no route is exempt;
  instead verified by HMAC on the raw body).

## Payments / money
- Secrets (`DATABASE_URL`, session/CSRF/MFA keys) stay server-side; nothing secret reaches the browser.
- Money is integer paise; balances change only through the ledger; POSTED entries are immutable;
  corrections are compensating entries. Admin adjustments require a reason and are audited.

## Uploads & content
- Uploads validated by **content (magic bytes)**, size and type; stored under randomised keys in a
  private bucket; downloads are visibility/ownership-checked. No path traversal (`lib/storage`).
- Admin-entered content is escaped on render; video embeds are restricted to parsed YouTube embed
  URLs; links are https-only. CSV exports escape formula-injection (`= + - @`).

## Privacy
- Aadhaar is minimised: only the last 4 digits are accepted/stored for the FID card; never logged.
- PII is redacted from logs (pino redact) and from audit snapshots.
- The FID card carries a non-official disclaimer; no government emblem/validation is implied.

## Audit & ops
- Append-only `audit_logs` for approvals, wallet adjustments, payments, content changes, FID
  generate/refund — each with actor, action, entity, request id, ip hash (PII redacted).
- Never deploy demo credentials, demo wallet credit, or any localStorage "database".
