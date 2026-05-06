# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm start            # Start production server (node server.js, port 5000)
npm run dev          # Start with auto-reload (nodemon server.js)
```

No build step — this is a pure Node.js/ESM project. No test suite is defined.

**Health check (non-production):** `GET /test`

## Architecture Overview

Pick2Win is a real-money fantasy cricket platform backend. Users create teams, join contests, and win prizes based on live cricket player performance.

**Stack:** Node.js 22 (ESM `"type":"module"`), Express 5, TiDB (MySQL-compatible via `mysql2/promise`), Upstash Redis (HTTP REST), Socket.IO v4, BullMQ + ioredis (queue, currently in `"direct"` mode).

**Entry point:** `server.js` — creates HTTP server + Socket.IO, starts cron jobs, then loads `src/app.js` (Express middleware + routes).

**Routes mount at `/api`** via `src/routes/index.js` — three sub-routers: `/auth`, `/user`, `/employee` (admin).

## Module Pattern

Every feature module under `src/modules/` follows the same 4-file pattern:

```
*.routes.js      → Express router + middleware attachment
*.controller.js  → Request handler (validate, call service, send response)
*.service.js     → Business logic (DB queries, external API calls, calculations)
*.validation.js  → Joi schemas for request bodies/params
```

## Authentication

**Users:** OTP-based (no passwords). JWT (7-day expiry) returned after OTP verification. `authenticate()` middleware verifies JWT and checks Redis blacklist for logged-out tokens. `checkAccountActive()` blocks paused/deleted accounts. `requireKyc()` gates financial actions.

**Admins:** Password-based login. JWT includes `role` claim (`super_admin`, `admin`, `employee`). `adminAuth(roles[])` validates JWT + role, checks Redis blocklist.

## Key Business Flows

**Joining a contest:** Validate wallet ≥ entryFee → deduct wallet → insert `contest_entries` row.

**Match going live:** Admin hits `/api/employee/match-live/:match_id` → SportMonks cron activates (syncs playing XI, then syncs player points every 2 min) → `scoreContestService` recomputes leaderboard after each sync → leaderboard cached in Redis (`LB:{contestId}`, TTL 120s).

**Match result:** Admin hits `/api/employee/match-result/:match_id` → finalize scores → rank entries → apply pre-generated `prize_distribution` JSON → credit winner wallets.

**Deposits:** Stripe PaymentIntent → client completes payment → Stripe webhook at `/api/user/payment/webhook/stripe` (raw body, mounted before JSON middleware) → wallet credited.

## Prize Distribution Engine

See [src/modules/admin/CLAUDE.md](src/modules/admin/CLAUDE.md) for the full spec. Critical points:

- Entry point: `generatePrizeDistribution({ entryFee, maxEntries, winnerPercentage, platformFeePercentage, rank1Percentage })`
- Called when admin creates a contest — result stored as `prize_distribution` JSON on the contest row
- Two-pass algorithm with strict monotonicity and exact pool accounting (`totalPayout === netPool`)
- **Never regress the `budgetCap` fix** in `buildPremiumTop1000` — prevents `rank1` going negative

## Real-time

Socket.IO shares port 5000. Namespace `/home` (in `src/modules/home/`) pushes live match scores, leaderboard updates, and contest notifications.

## Configuration

| File | Purpose |
|------|---------|
| `src/config/db.js` | TiDB pool (SSL via `src/config/tidb-ca.pem`, pool size 20) |
| `src/config/redis.js` | Upstash Redis REST client |
| `src/config/bullRedis.js` | ioredis for BullMQ |
| `src/config/queueMode.js` | `"direct"` (dev) or `"bullmq"` (prod) |

**Required env vars:** `NODE_ENV`, `JWT_SECRET`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `STRIPE_PUBLISHABLE_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.

## Important Constraints

- **ES Modules only** — all files use `import`/`export`, no `require()`.
- **Linux deployment (Render)** — file paths are case-sensitive.
- **TiDB SSL cert** — `src/config/tidb-ca.pem` must be present; it is committed to the repo.
- **Stripe webhook** needs raw body — it is mounted before the JSON body parser in `src/app.js`.
- **SportMonks cron** starts automatically on server boot for any live matches.

## External Integrations

| Service | Purpose | Config |
|---------|---------|--------|
| SportMonks | Live cricket data, player stats | API key in env |
| Sumsub | KYC/identity verification | SDK token endpoint + webhook |
| Stripe | Deposits + bank verification | `STRIPE_*` env vars |
| Firebase Admin | Push notifications (FCM) | Service account in env |
| Expo Server SDK | Push notifications (Expo apps) | |
| Resend / Nodemailer | Transactional email | |
