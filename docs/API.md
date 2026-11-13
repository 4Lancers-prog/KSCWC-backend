# API reference

Base path: `/api/v1`. JSON in/out except file downloads and the webhook. Errors use one envelope:
`{ code, message, fieldErrors?, requestId }`. Cookie session auth; mutating requests need the
`x-csrf-token` header (fetch `GET /auth/csrf` first — the SPA's api-client does this automatically).

## Auth
| Method | Path | Notes |
|---|---|---|
| GET | `/auth/csrf` | issue CSRF token (sets `kscwc.csrf` cookie) |
| POST | `/auth/register` | → PENDING_APPROVAL |
| POST | `/auth/login` | rate-limited; admin TOTP via `mfaToken` |
| POST | `/auth/logout` | |
| GET | `/auth/me` | current session user |
| POST | `/auth/forgot-password` · `/auth/reset-password` | single-use hashed token |
| POST | `/auth/mfa/setup` · `/auth/mfa/confirm` | admin MFA enrolment |

## Users (admin) — `users:*`
`GET /admin/users` · `GET /admin/users/:id` · `POST /admin/users/:id/{approve,reject,suspend,reactivate}`
(reject/suspend take `{ reason }`; the user sees it when they try to log in)

`GET /admin/overview` (`users:read`) — counts waiting on staff: pendingUsers, pendingManualTopups,
openGrievances, newApplications (+ per kind), activeUsers, totalCustomers.

## Me (operator)
`GET /me/applications` — the signed-in operator's insurance / membership / training / grievance
submissions with the admin's status and grievance `resolutionNote`.

## Services
`GET /services` (public active) · admin: `GET/POST /admin/services`, `PATCH /admin/services/:id`,
`POST /admin/services/:id/deactivate` (`services:manage`)

## Customers (owner-scoped)
`POST /customers` · `GET /customers` · `GET /customers/:id` · `PATCH /customers/:id` ·
`POST /customers/:id/status` · admin `GET /admin/customers` (`customers:read:all`)

## Reports
`GET /reports/my-customers` · `GET /reports/export.csv` · admin `/admin/reports/customers`,
`/admin/reports/export.csv` (`reports:read:all`)

## Wallet & payments
`GET /wallet` · `GET /wallet/transactions` · `POST /wallet/manual-topups` (amount + UTR, optional screenshot) · `GET /wallet/manual-topups` ·
`POST /payments/verify` (checkout signature) · `GET /payments/:id/status` ·
admin `GET /admin/wallets`, `POST /admin/wallets/:userId/adjustments` (`wallet:adjust`).

## FID
`POST /fid-generations` (header `Idempotency-Key`) · `GET /fid-generations` ·
`GET /fid-generations/:id` · `GET /fid-generations/:id/download` (owner, free).

## Content
Public: `/public/announcements`, `/public/committees`, `/public/government-links`,
`/public/documents`, `/public/documents/:id/download`.
Admin CRUD under `/admin/announcements`, `/admin/committees` (+`/reorder`), `/admin/government-links`,
`/admin/documents` (multipart upload) — each gated by the matching permission.

## Applications
Public submit: `POST /applications/{insurance,membership,training,grievance}`.
Admin: `GET /admin/applications/:kind`, `POST /admin/applications/:kind/:id/status`
(`applications:manage`).

## Audit / health
`GET /admin/audit-logs` (`audit:read`) · `GET /health/live` · `GET /health/ready`.
