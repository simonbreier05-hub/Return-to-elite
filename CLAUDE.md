# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**StayClean** — a real-time room-cleaning and room-release system for a 145-room
luxury hotel, built as an integration-ready prototype for **Oracle OPERA Cloud
via OHIP** (runs today on mock/local data; `src/lib/pms/` is the seam). Next.js
App Router + TypeScript, a custom Socket.IO server for instant status
broadcasts, Prisma (SQLite by default, Postgres via docker-compose), JWT
cookie auth with server-enforced RBAC.

Six roles share one board: `room_attendant`, `supervisor`, `duty_manager`
(admin), `front_office`, `concierge`, `engineering`. The one rule the whole
system is built around: **only `supervisor`/`duty_manager` may set
`INSPECTED`** (release a room as sellable to the PMS) — `front_office` and
`concierge` cannot change housekeeping status at all.

## Commands

```bash
npm install
cp .env.example .env            # defaults work as-is
npm run db:push                 # SQLite schema → prisma/dev.db
npm run db:seed                 # 145 rooms, 10 attendants, one user per other role, demo data
npm run dev                     # custom server: Next.js + Socket.IO on :3000
```

- `npm test` — Vitest, runs everything under `tests/`
- `npm run test:watch` — Vitest watch mode
- Single test file: `npx vitest run tests/stateMachine.test.ts`
- Single test by name: `npx vitest run -t "cannot release a BLOCKED room directly"`
- `npm run lint` — `next lint`
- `npm run build` — `next build` (local/dev target)
- `npm run sync` — polls `origin/<branch>` every 10s and fast-forwards the
  working copy so `npm run dev` hot-reloads changes pushed from elsewhere; it
  warns instead of overwriting uncommitted local edits, and flags when a
  change needs more than a hot reload (`package.json` → reinstall, Prisma
  schema → `db:push`, `server.js` → restart the dev server)

### Postgres instead of SQLite

```bash
docker compose up -d
export DATABASE_URL="postgresql://stayclean:stayclean@localhost:5432/stayclean?schema=public"
npm run db:push:postgres && npm run db:generate:postgres
npm run db:seed
```

`prisma/schema.postgres.prisma` is the pg-provider twin of `prisma/schema.prisma`
— same models, kept in sync by hand. All enum-like fields (`role`, `status`,
`type`, ...) are stored as plain `String`, not native enums, specifically so
one model set works on both providers; every value is validated with Zod
(`src/lib/domain.ts`) at the API boundary before it ever reaches the DB.

### Railway deployment

`railway.json` drives it: build is `npm run build:railway` (Prisma generate
against the **Postgres** schema, then `next build`); start is `npm run
start:railway` (`prisma db push` against Postgres, then seed **only if
empty** via `SEED_MODE=if-empty` so a redeploy never wipes live data, then
boot). Healthcheck is `GET /api/health`. SQLite does not work on Railway
(ephemeral filesystem) — the Postgres scripts are what the platform target
uses.

### Login

Outside production, the login screen lists every seeded user (one tap, no
password) and the header carries a role switcher. All seeded passwords are
`123`; outside production the email field also accepts a bare **position**
(`supervisor`, `front office`, `attendant`, ...) so `<position> / 123` signs
in too. This dev path is gated by `ALLOW_DEV_LOGIN` and is off by default in
production — see `src/lib/devAuth.ts` and `.env.example`.

## Architecture

### The one place state changes happen

`src/lib/rooms/applyStatusChange.ts` is the **only** function allowed to
change a room's status. Both `POST /api/rooms/[id]/status` (single room) and
the bulk release endpoint call into it — this is deliberate, so the
supervisor-only-INSPECTED rule and its side effects exist in exactly one
place rather than risking a second, drifted copy. A "release all" action
therefore produces the same audit trail, PMS push, and notifications as
doing each room individually.

Inside, per status change: `checkTransition()` validates role + legal
transition → an `AuditLog` row is written **even on refusal** (`STATUS_CHANGE`
or `STATUS_CHANGE_DENIED`) → status-specific payload is required (`BLOCKED`
needs a reason, `PICKUP` needs a note, `OUT_OF_ORDER` needs an end time) →
the DB updates → `INSPECTED` pushes to the mock PMS and notifies front office
→ `room:update` / `room:status` broadcast over Socket.IO to every connected
client.

### Two-layer permission model

1. **`src/lib/domain.ts`** — the vocabulary: `Role`, `RoomStatus`,
   `BlockReason`, etc. as `as const` arrays + matching Zod schemas. Anything
   not in these enums is rejected at the API boundary.
2. **`src/lib/stateMachine.ts`** — `LEGAL_TRANSITIONS` (which status can
   follow which) and `ROLE_ALLOWED_TARGETS` (which role may set which
   status), combined in `checkTransition(role, from, to)`. Returns `403` for
   a role violation, `409` for an illegal/no-op transition. **Both maps are
   enforced server-side only** — the UI mirrors them for UX, but a client can
   never be trusted to gate this itself.

State diagram (also in the README and the file header of `stateMachine.ts`):

```
DIRTY → IN_PROGRESS → CLEAN (to-inspect) → INSPECTED (released/sellable)
                 ↑            └→ PICKUP (supervisor rework, with note) → IN_PROGRESS
DIRTY/IN_PROGRESS ↔ BLOCKED (DND | GUEST_IN_ROOM | DOUBLE_LOCKED | REFUSED, + timer)
*                 → DEFECT_REPORTED (auto work order → engineering)
supervisor/DM     → OUT_OF_ORDER (end time) | OUT_OF_SERVICE | GREEN_OPT_OUT
INSPECTED         → DIRTY (checkout / PMS event)
```

`src/lib/rbac.ts` (`requireAuth` / `requireRole`) guards API routes;
`src/lib/pageGuard.ts` (`requirePage`) guards server-component pages the same
way. `duty_manager` passes every role check — it is the admin role, not a
role listed alongside the others in each check.

### Realtime

`server.js` is a custom server (not plain `next start`): it boots Next, wires
a Socket.IO server onto the same HTTP server, and stashes it on
`globalThis.__io` so any API route in the same process can broadcast via
`src/lib/realtime.ts`'s `broadcast(event, payload)`. Event catalogue is
documented at the top of that file (`room:update`, `room:status`,
`attendant:location`, `notification:new`, `workorder:update`,
`arrival:update`, `note:new`). `server.js` also runs a 60s escalation ticker
that calls `POST /api/internal/escalations` internally — keeping that logic
as a normal Next/Prisma route rather than duplicating it in the plain JS
server file.

### Offline queue (attendant view)

Hotel wifi dies in stairwells and service lifts. `src/lib/offline/actionQueue.ts`
is deliberately framework-free (storage and the send function are injected)
so its replay semantics are unit-tested without a browser
(`tests/offlineQueue.test.ts`). Key invariant: **flush stops at the first
undeliverable action** rather than skipping ahead — a room's real transitions
are order-dependent (DIRTY → IN_PROGRESS → CLEAN), so replaying out of order
would just be rejected by the state machine anyway. A response the server
actually answered (403/409/400) is final and dropped; only "never reached the
server" is retried.

### Priority engine

`src/lib/priority/computePriority.ts` is a pure function — no I/O — that
scores an actionable room and returns `{ score, reasons[] }`, where every
point is attached to a human-readable reason (e.g. `+100 Front office
flagged: room needed NOW.`). Signals: front-office "needed now", confirmed
ETA window, VIP, same-day turn before stayovers, concierge excursion window,
BLOCKED/DND aging, route proximity to the attendant. Weights
(`PRIORITY_WEIGHTS`) are overridable per-house via the `Setting` table
(`priorityWeight.*`, tunable at `/settings` by the duty manager); an unset or
malformed weight silently falls back to the code default rather than taking
scoring offline. `predictCleaningMinutes.ts` sits next to it as a clearly
separated, swappable ML hook (baseline heuristic today, `TODO(ml)` marks
where a trained regression model would plug in without touching callers).

### Assignment planner

`src/lib/assignment/planAssignments.ts` is a pure, deterministic function
(most heavily unit-tested module, `tests/assignment.test.ts`) driving
`/supervisor/planning`. It walks rooms in floor → section → room-number
order, cuts that list into **contiguous** blocks sized by predicted cleaning
minutes (not room count — balancing individual rooms was tried and rejected:
it produced even workloads by sending one attendant across all five floors),
then hands each round to the attendant whose home section it contains.
Recalculates on every tap with no debounce, since it's pure computation.

### Shift handover — the one LLM integration

`/supervisor/handover` is split into two files on purpose:
`src/lib/handover/collectFacts.ts` computes every number/room/name in
ordinary code from the board + audit log; `src/lib/handover/generate.ts`
turns those facts into prose and **receives nothing else**, so it cannot
invent a fact. Two writers sit behind one interface: without
`ANTHROPIC_API_KEY` a deterministic writer runs (not an LLM, never labeled as
one, same output for the same board); with the key set, the model runs
instead and falls back to the deterministic writer if unreachable. A test
extracts every digit from generated prose and fails if it isn't traceable
back to the facts — see `tests/handover.test.ts` and the "Where AI belongs"
section in the README for the reasoning behind keeping the assignment
planner and priority engine rule-based instead.

### PMS integration seam

`src/lib/pms/PMSConnector.ts` defines the interface
(`onReservationEvent`/`onCheckout`/`pushRoomStatus`); `MockPMSConnector.ts` is
what's active today (logs to the audit trail); `OHIPConnector.ts` documents
where the real OHIP Streaming API events would arrive and where Housekeeping
API pushes would go. **Only `INSPECTED` is ever pushed to the PMS** — enforced
both in the status route and defensively inside the connector itself.

### Project layout

```
server.js                       # custom Next server + Socket.IO + escalation ticker
prisma/schema.prisma             # SQLite (default) — schema.postgres.prisma for pg
prisma/seed.ts                   # users, 145 rooms, demo data
src/lib/
  domain.ts                      # roles, statuses, Zod enums, colors, defaults
  stateMachine.ts                # transitions + role matrix (unit-tested)
  auth.ts / rbac.ts / pageGuard.ts   # JWT session, API + page guards
  audit.ts / settings.ts / realtime.ts / escalations.ts
  priority/computePriority.ts    # explainable scoring (pure, tested)
  priority/predictCleaningMinutes.ts  # optional ML hook (baseline)
  assignment/planAssignments.ts  # morning round planner (pure, tested)
  rooms/applyStatusChange.ts     # the one place status changes happen
  pms/PMSConnector.ts            # interface · MockPMSConnector · OHIPConnector stub
  offline/actionQueue.ts         # framework-free offline replay queue
src/app/
  login/ attendant/ supervisor/ front-office/ concierge/ engineering/
  supervisor/planning/ supervisor/handover/
  api/  auth/ rooms/ arrivals/ excursions/ workorders/ notifications/
        assignments/ priority/ audit/ settings/ internal/escalations/
tests/  stateMachine.test.ts  priority.test.ts  assignment.test.ts
        dayFigures.test.ts  handover.test.ts  offlineQueue.test.ts
```

Each role has its own page + `view.tsx` client component under `src/app/`
(`attendant/`, `supervisor/`, `front-office/`, `concierge/`, `engineering/`),
guarded server-side by `requirePage()`. Shared client hooks live in
`src/components/`: `useSocket.ts` (Socket.IO subscription), `api.ts`
(fetch wrapper with typed `ApiError`/`NetworkError`), `useOfflineQueue.ts`,
`useCoalescedRefetch.ts` (debounces a refetch after a burst of socket
events), `status.ts` (shared `STATUS_STYLES`).

## Conventions

- **Domain vocabulary changes go in `src/lib/domain.ts` first** — new
  statuses/roles/reasons are `as const` arrays with a matching `z.enum`, and
  everything downstream (state machine, RBAC, seed data, UI labels/colors)
  derives from there.
- **Status/role transitions never bypass `checkTransition()` /
  `applyStatusChange()`.** Adding a new status change path means calling
  into the existing function, not reimplementing the rule.
- API routes: `requireAuth()`/`requireRole([...])` first, then a Zod
  `BodySchema.safeParse` on the JSON body, returning `400` with
  `error.flatten()` details on failure — see
  `src/app/api/rooms/[id]/status/route.ts` for the pattern.
- Every status change is audit-logged, **including denials** — don't add a
  new rejection path that skips `audit()`.
- Board status colors are fixed by spec (DIRTY red, IN_PROGRESS blue, CLEAN
  yellow, INSPECTED green, BLOCKED purple, PICKUP orange, DEFECT amber,
  OOO/OOS grey, GREEN teal) and must stay distinct from the hotel's brand
  chrome (garnet/brass) — see `STATUS_COLORS` in `domain.ts` and the "Visual
  design" section of the README for why that separation matters.
- Pure/testable logic (state machine, priority, assignment planner, offline
  queue, handover fact-collection) stays free of I/O and DOM/browser globals
  so it can be unit-tested directly with Vitest; side effects (DB, Socket.IO,
  PMS) are pushed to the edges (`applyStatusChange`, API routes).
