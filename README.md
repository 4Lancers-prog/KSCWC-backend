# KSCWC Backend

Node 22 + TypeScript + Express modular monolith. **MongoDB** (Atlas in production) is the source
of truth. Owns all business rules: auth/RBAC, customers, ledger-backed wallet with **manual UPI
top-ups verified by an admin**, government service portal links, admin content, audit logs.
(FID card generation runs on a separate site; add it as a portal link in Admin → ಕೊಂಡಿಗಳು.)

## Quick start with MongoDB Atlas (free)
1. Create a free account at mongodb.com/atlas → **Create cluster** → choose **M0 (Free)**.
2. **Database Access** → add a database user (username + password).
3. **Network Access** → add your server's IP (for testing you can add `0.0.0.0/0`).
4. **Connect → Drivers** → copy the connection string. Add the database name `/kscwc` before
   the `?`, and put it in `.env`:
   ```
   DATABASE_URL=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/kscwc?retryWrites=true&w=majority
   ```
   (URL-encode special characters in the password, e.g. `@` → `%40`.)
5. Fill in `SESSION_SECRET`, `CSRF_SECRET` (32+ random characters each), `SEED_ADMIN_PHONE`
   and `SEED_ADMIN_PASSWORD`.
6. Run:
   ```
   npm install
   npm run db:seed      # creates collections + indexes, services, demo content, the SUPER_ADMIN
   npm run dev          # API on :4000
   ```

Local MongoDB instead of Atlas: `docker compose up -d` and use
`DATABASE_URL=mongodb://127.0.0.1:27017/kscwc?replicaSet=rs0` (a replica set is required: the
wallet uses transactions).

## Top-ups (UPI only)
Admin uploads the council's UPI QR (Admin → UPI ಟಾಪ್-ಅಪ್). Operators pay, then submit the
amount + UTR (optionally a screenshot). Admin verifies against the bank statement and approves;
the wallet is credited exactly once. A UTR can only be used once. See `docs/MANUAL-TOPUP.md`.

## Tests
Integration tests need a **separate** test database on a replica set:
`TEST_DATABASE_URL=mongodb://127.0.0.1:27017/kscwc_test?replicaSet=rs0` (or an Atlas test DB), then `npm test`.

## Files
Uploads (UPI QR, payment screenshots, documents, portal logos) are stored under `./storage/private/`
(override with `STORAGE_DIR`), or in Supabase Storage when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set.

See `docs/` for API, database and security references.
