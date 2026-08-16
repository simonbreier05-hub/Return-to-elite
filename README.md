# StayClean — Real-Time Room Cleaning & Release

Production-quality **prototype** of a cross-departmental, real-time room-cleaning and
room-release system for a 145-room luxury hotel. Built to later integrate with
**Oracle OPERA Cloud via OHIP** (connector interface included); runs today on
mock/local data.

> **StayClean** is the system. **Elite** is the fictional hotel it is deployed
> for in this prototype — that is the name you see in the app header and in the
> seeded demo data.

| | |
|---|---|
| Framework | Next.js (App Router, TypeScript, React) — custom server with Socket.IO |
| Database | Prisma ORM — SQLite by default (zero setup), Postgres via docker-compose |
| Realtime | Socket.IO — every status change broadcasts instantly to all clients |
| Auth | Credentials login → signed JWT (httpOnly cookie), role-based |
| Validation | Zod on every API boundary; RBAC + state machine enforced **server-side** |
| UI | Tailwind CSS, tablet-first (large touch targets, iPad-landscape friendly) |
| Tests | Vitest — state machine, permission rule, priority engine (32 tests) |

## Quick start (SQLite, no Docker needed)

```bash
npm install
cp .env.example .env          # defaults are fine
npm run db:push               # create SQLite schema (prisma/dev.db)
npm run db:seed               # 145 rooms, users, demo arrivals/defects
npm run dev                   # custom server: Next.js + Socket.IO on :3000
```

Open http://localhost:3000 — the login screen has one-tap demo users.
**All seeded passwords: `elite123`.**

| Email | Role |
|---|---|
| maria@ / aylin@ / petra@ / hausdame@hotel.test | room_attendant |
| supervisor@hotel.test | supervisor |
| frontoffice@hotel.test | front_office |
| concierge@hotel.test | concierge |
| engineering@hotel.test | engineering |
| manager@hotel.test | duty_manager (admin) |

Try it live: open the **supervisor board** in one browser and the **attendant view**
(maria@) in another — every tap propagates instantly via WebSocket.

### Postgres instead of SQLite

```bash
docker compose up -d
export DATABASE_URL="postgresql://elite:elite@localhost:5432/elite_hk?schema=public"
npm run db:push:postgres && npm run db:generate:postgres
npm run db:seed
npm run dev
```

(The schema stores enum-like fields as validated strings so the identical model set
runs on both providers; `prisma/schema.postgres.prisma` is the pg variant.)

### Live-Sync while someone else edits the code

Next.js dev mode hot-reloads on file change, but only for files on *your*
machine. To follow changes that are pushed to the branch, run the watcher in a
second terminal — it fast-forwards your working copy, which triggers the hot
reload:

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run sync            # polls origin/<current branch> every 10s
npm run sync -- main 5  # optional: other branch / interval
```

The watcher prints a warning when a change needs more than a hot reload
(`package.json` → `npm install`, Prisma schema → `npm run db:push`,
`server.js` → restart). It only fast-forwards, so it never overwrites your own
uncommitted edits — it tells you instead.

### Tests

```bash
npm test
```

Covers:
- **State machine** — legal/illegal transitions (`tests/stateMachine.test.ts`)
- **The critical permission rule** — only `supervisor`/`duty_manager` may set
  `INSPECTED`; every other role gets **403** (also audit-logged server-side)
- **Priority engine** — each weighted signal, explainability invariant
  (score ≡ sum of reasons), and the `predictCleaningMinutes` baseline

## Deployment on Railway

The repo ships with `railway.json`, so Railway picks up the right build and
start commands automatically:

- **Build:** `npm run build:railway` — generates the Prisma client against the
  **Postgres** schema, then `next build`
- **Start:** `npm run start:railway` — `prisma db push`, seeds **only if the
  database is empty** (`SEED_MODE=if-empty`, so a redeploy never wipes live
  data), then boots the server
- **Healthcheck:** `GET /api/health` (returns `{status:"ok",rooms:145}`)

Steps:

1. Railway → **New Project → Deploy from GitHub repo** → pick this repo.
2. Add a **Postgres** database to the same project (New → Database → Postgres).
3. In the app service, set the variables:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (reference to the DB service)
   - `AUTH_SECRET` = a long random value (`openssl rand -base64 32`)
4. **Check the deployed branch** under Settings → Source. Railway uses the
   repository's default branch; if the application code lives on a feature
   branch, select it there.
5. Generate a public domain under Settings → Networking. WebSockets work over
   that domain without extra configuration.

`PORT` is injected by Railway and read by `server.js`; the server binds
`0.0.0.0`. SQLite is *not* suitable on Railway (ephemeral filesystem) — use the
Postgres service, which the Railway scripts above already target.

## Room state machine

```
DIRTY → IN_PROGRESS → CLEAN (to-inspect) → INSPECTED (released/sellable)
                 ↑            └→ PICKUP (supervisor rework, with note) → IN_PROGRESS
DIRTY/IN_PROGRESS ↔ BLOCKED (DND | GUEST_IN_ROOM | DOUBLE_LOCKED | REFUSED, + timer)
*                 → DEFECT_REPORTED (auto work order → engineering)
supervisor/DM     → OUT_OF_ORDER (end time) | OUT_OF_SERVICE | GREEN_OPT_OUT
INSPECTED         → DIRTY (checkout / PMS event)
```

Illegal transitions are rejected with **409**, role violations with **403** — both
in `src/lib/stateMachine.ts`, enforced in `src/app/api/rooms/[id]/status/route.ts`,
and every attempt (allowed or denied) is written to the `AuditLog` table.

**Board colors:** DIRTY red · IN_PROGRESS blue · CLEAN yellow · INSPECTED green ·
BLOCKED purple · OOO/OOS grey (plus PICKUP orange, DEFECT amber, GREEN teal).

## Roles & permissions (server-enforced)

| Role | May set |
|---|---|
| room_attendant | IN_PROGRESS, CLEAN, BLOCKED(+reason), DEFECT_REPORTED, GREEN_OPT_OUT |
| supervisor | everything incl. **INSPECTED** and PICKUP/OOO/OOS |
| duty_manager | admin — everything |
| engineering | DEFECT_REPORTED (work orders via own queue) |
| front_office / concierge | **no cleaning-status changes** (403) |

## Priority engine (the AI feature)

`src/lib/priority/computePriority.ts` — a **pure, unit-tested** scoring function
returning `{ score, reasons[] }` where every reason is human-readable
(`+100 Front office flagged: room needed NOW.`). Signals: needed-now, confirmed
ETA window, early check-in, VIP, same-day turn before stayovers, concierge
excursion window (guest out = cleaning window), DND/BLOCKED aging, and
route/section proximity to the attendant. Exposed via `GET /api/priority`; the
attendant list is sorted by it and shows the "why?" breakdown.

`src/lib/priority/predictCleaningMinutes.ts` — clearly separated **optional ML
hook** (Optii-style per-room cleaning-time prediction) with a transparent
baseline (room type × checkout/stayover × stay length × occupancy) and a
`TODO(ml)` marker where a trained model plugs in without changing callers.

## PMS integration (stub now, OHIP later)

`src/lib/pms/PMSConnector.ts` defines `onReservationEvent()`, `onCheckout()`,
`pushRoomStatus(roomNumber, status)`. `MockPMSConnector` is active (logs pushes to
the audit trail); `OHIPConnector.ts` documents exactly where the **OHIP Streaming
API** business events arrive and where the **Housekeeping API** pushes INSPECTED
back to OPERA. **Only INSPECTED is ever pushed to the PMS as sellable** — enforced
in the status route and defensively inside the connector.

## Notifications & escalation

A ticker (60 s, `server.js` → `/api/internal/escalations`) evaluates
DB-configurable thresholds (`Setting` table, editable via `PATCH /api/settings`
as duty manager):

- **BLOCKED_RECHECK** — blocked/DND room older than 20 min → attendant reminder (repeats per interval)
- **WELFARE_CHECK** — DND older than 120 min → duty manager, critical
- **ETA_AT_RISK** — arrival within 45 min but room not INSPECTED → supervisor
- **RELEASE_QUEUE_BACKLOG** — ≥ 5 rooms waiting for inspection → supervisor
- **ROOM_RELEASED** — instant front-office notification when a requested room turns INSPECTED

## Project structure

```
server.js                       # custom Next server + Socket.IO + escalation ticker
prisma/schema.prisma            # SQLite (default) — schema.postgres.prisma for pg
prisma/seed.ts                  # users, 145 rooms, demo data
src/lib/
  domain.ts                     # roles, statuses, Zod enums, colors, defaults
  stateMachine.ts               # transitions + role matrix (unit-tested)
  auth.ts / rbac.ts / pageGuard.ts  # JWT session, API + page guards
  audit.ts / settings.ts / realtime.ts / escalations.ts
  priority/computePriority.ts   # explainable scoring (pure, tested)
  priority/predictCleaningMinutes.ts  # optional ML hook (baseline)
  pms/PMSConnector.ts           # interface · MockPMSConnector · OHIPConnector stub
src/app/
  login/ attendant/ supervisor/ front-office/ concierge/ engineering/
  api/  auth/ rooms/ arrivals/ excursions/ workorders/ notifications/
        priority/ audit/ settings/ internal/escalations/
tests/  stateMachine.test.ts  priority.test.ts
```

## Notes

- Defect photos are stored under `public/uploads/` (local S3 mock).
- The audit trail (`GET /api/audit`, supervisor/DM) records logins, every status
  change **and every denied attempt**, assignments, PMS pushes, and settings edits.
