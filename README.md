# StayClean — Real-Time Room Cleaning & Release

Production-quality **prototype** of a cross-departmental, real-time room-cleaning and
room-release system for a 145-room luxury hotel. Built to later integrate with
**Oracle OPERA Cloud via OHIP** (connector interface included); runs today on
mock/local data.

| | |
|---|---|
| Framework | Next.js (App Router, TypeScript, React) — custom server with Socket.IO |
| Database | Prisma ORM — SQLite by default (zero setup), Postgres via docker-compose |
| Realtime | Socket.IO — every status change broadcasts instantly to all clients |
| Auth | Credentials login → signed JWT (httpOnly cookie), role-based |
| Validation | Zod on every API boundary; RBAC + state machine enforced **server-side** |
| UI | Tailwind CSS, tablet-first (large touch targets, iPad-landscape friendly) |
| Tests | Vitest — state machine, permission rule, priority engine, assignment planner, day figures, offline queue, handover (77 tests) |

## Quick start (SQLite, no Docker needed)

```bash
npm install
cp .env.example .env          # defaults are fine
npm run db:push               # create SQLite schema (prisma/dev.db)
npm run db:seed               # 145 rooms over 5 floors, 10 attendants, demo data
npm run dev                   # custom server: Next.js + Socket.IO on :3000
```

Open http://localhost:3000 — outside production the login screen lists every
seeded user grouped by role and signs you in with **one tap, no password**. The
header then carries a role switcher, so you can jump between supervisor,
housekeeping and front office without signing out.

Password sign-in still works. **All seeded passwords are `123`**, and outside
production the email field also accepts a **position** — `supervisor`,
`front office`, `concierge`, `engineering`, `attendant`, `manager` (spacing,
underscores and case are ignored) — so typing a department and `123` twice
reaches it. Room attendant has ten people; the handle reaches one of them
(Maria), the quick-login screen or header switcher reach the rest. Position
handles are off in production unless `ALLOW_DEV_LOGIN=true` is set (see
`.env.example`); there, only a real address is accepted. Setting that flag on
a public instance lets anyone sign in as the duty manager, so use it only for
a throwaway demo.

| Email | Role |
|---|---|
| maria@ · aylin@ · petra@ · hausdame@ · lucia@ · elena@ · fatima@ · joanna@ · sena@ · grace@ | room_attendant (10) |
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
export DATABASE_URL="postgresql://stayclean:stayclean@localhost:5432/stayclean?schema=public"
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

### Working offline

Housekeeping wifi dies in stairwells and service lifts. Writes from the
attendant view go through an offline queue (`src/lib/offline/actionQueue.ts`):
on a network failure the tap is stored on the device, the card shows the new
status immediately so nobody taps twice, and a bar reports what is waiting.
Replay happens on reconnect, on a 15 s timer, or on demand.

Order is preserved and the flush stops at the first undeliverable action — a
room walks DIRTY → IN_PROGRESS → CLEAN and replaying that out of order would be
refused by the state machine. Anything the server *answered* (403, 409, 400) is
final: it is dropped with a message rather than retried forever.

The queue covers taps, not page loads. Reloading while offline still needs the
network; a service worker would be the next step.

## Settings (duty manager)

`/settings` — escalation thresholds and the **priority weights**. Every signal
in the scoring engine has a weight the duty manager can tune, and setting one to
`0` switches that signal off. A resort with heavy excursion traffic weighs that
window differently to a city hotel living off early check-ins; that is a
management decision, not a code change. Weights are stored in the `Setting`
table under `priorityWeight.*`, unknown names are ignored, and anything unset
falls back to the code default so a bad row cannot take scoring offline.

Changes are audit-logged and show up in the attendants' "why?" breakdown, so a
weight change is visible on the floor.

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

## Visual design — tuned to the house

The property occupies an 1889 former Dresdner Bank headquarters: repurposed
bank vaults, original wood panelling, a stone entrance, and an
elegant-minimalist interior rather than an ornate one. The house is
independent today and is slated to join Four Seasons within the year, so the
palette is deliberately a generic, well-reasoned "five-star luxury" language
rather than any one chain's identity — deeper stone and marble neutrals, a
near-black "vault" ink for the header and primary text, warm antique brass
for interactive chrome, and one restrained navy accent — the house's own
current mark — kept to exactly two places: the header's top edge and the
login screen's divider, the two spots a mark would traditionally sit. It is
not, and must never become, a copy of any real chain's protected brand
colours (previously Rocco Forte's red, and — as the house transitions —
Four Seasons' own identity).

**The status-tile colours are untouched by any of this.** DIRTY is red,
IN_PROGRESS is blue, BLOCKED is purple because the spec says so — that
system is operational signal, not brand chrome, and a supervisor reading the
board at a glance must never wonder whether a red tile means "needs
cleaning" or "brand accent". Navy never appears on a status tile, a
room-status button, or an error message.

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

The board has a search across room number, section, guest and attendant, plus
filters for status, floor and assignment; KPIs stay house-wide while the grid
narrows. The release queue can be cleared in one action — each room still passes
the same server-side checks individually via `applyStatusChange`, so a bulk
release produces the same audit entries and PMS pushes as doing them one by one.

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

## Priority engine (explainable scoring)

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

## Morning planning (room assignment)

`/supervisor/planning` turns the 07:00 hand-out into three taps: pick who is on
shift, pick the shift length, generate a proposal. Nothing is written until the
supervisor presses apply, and any room can be moved by hand first.

`src/lib/assignment/planAssignments.ts` is a pure, deterministic function
(15 unit tests). It works in three steps:

Steppers, team toggles and shift-length presets all recalculate the moment
they are tapped — no debounce, no "Recalculate" button in the way. A tap
answers in well under 100 ms, since planning is pure computation with no
external calls; the earlier 500 ms debounce before every change was UI
overhead, not the server. A short debounce remains only while typing a
number by hand.

1. **Walking order** — every room that still needs an attendant is laid out by
   floor, then section, then room number. Neighbours in that list are
   neighbours in the building.
2. **Contiguous rounds** — the list is cut into as many blocks as there are
   attendants, each cut placed where it lands closest to its share of the total
   predicted minutes. Balancing *contiguous* blocks is the whole point: an
   earlier version balanced room by room, produced perfectly even workloads,
   and sent one attendant across all five floors. Even and useless.
3. **Hand-out** — an attendant who normally works 3A gets the round containing
   3A. Inside a round, urgent rooms (priority engine) come first.

Workload is measured in **predicted cleaning minutes**, not room count — a
penthouse is not a classic room. Overbooking is shown, never hidden: if the
work exceeds the shift, the bar turns red and says by how much, so the
supervisor can call in help instead of discovering it at 14:00.

Every round explains itself in plain language ("14 rooms · 425 min predicted ·
floor 3"), which is also what makes it defensible in a report.

## Shift handover — the one place a language model is used

`/supervisor/handover` writes the note the evening supervisor reads in thirty
seconds: what needs a decision, which arrivals are at risk, what engineering
still has open, which notes were left.

It is built in two halves, and the split is the whole point:

1. **`collectFacts.ts` counts.** Every number, room number and name is computed
   in ordinary code from the board and the audit log.
2. **`generate.ts` phrases.** It receives those facts and nothing else.

Two writers sit behind one interface. Without an `ANTHROPIC_API_KEY` the
**deterministic writer** runs — it is not a language model, is never labelled as
one in the UI, costs nothing and gives the same text for the same board. Set the
key and the **language model** takes over, given the same facts and told
explicitly that it may not add any; if it is unreachable the deterministic
writer answers instead, with a note saying so.

A unit test extracts every digit from the generated prose and fails if one of
them is not traceable to the facts. That is the guard against a handover
inventing "room 412 is still blocked" — the evening supervisor would act on it.

The UI carries an expandable "the facts behind this text" panel, so any sentence
can be checked against the counted lines that produced it.

## Where AI belongs in this system — and where it does not

A deliberate design position, since "add AI" is the obvious reflex here.

**Not the assignment planner.** Distributing rooms is a constrained
optimisation problem with a known objective. A deterministic algorithm gives
the same plan every morning, runs in milliseconds, is unit-tested, and can be
explained to a works council. A language model would be slower, would vary
between runs, and could not be audited when someone asks why a room was
assigned. Rules win here on every axis that matters.

**Not the priority engine either** — the weighted, explainable score in
`computePriority` is what lets staff trust the order. A black box that says
"clean 412 next" without a reason gets ignored on the floor.

**Classical machine learning, yes:** `predictCleaningMinutes` is a supervised
regression problem (gradient boosting on historical per-room times, per the
Optii approach), not a language model. The hook is already isolated so the
baseline can be swapped for a trained model without touching callers.

**Where a language model genuinely earns its place** — all of these are
open-ended language problems that rules handle badly:

| Use case | Why an LLM fits |
|---|---|
| Shift handover briefing | Turn a day of audit log, notes and work orders into a paragraph the evening supervisor can read in 30 seconds |
| Multilingual room notes | Housekeeping teams are rarely monolingual; translate notes both ways so a note is never lost in the language it was written in |
| Defect triage from photo + free text | Vision model suggests category and urgency, and whether the room must go out of order — the attendant confirms |
| Voice input on the floor | Hands full, gloves on: "room 214 done, minibar restocked" parsed into a status change and a note |
| Asking the board questions | "Why is floor 3 behind today?" answered from the audit trail, instead of a report nobody builds |

The pattern: **rules and classical ML for decisions that must be repeatable and
defensible, language models for turning messy human language into structure and
back.** Assignment is the former. Handover notes are the latter.

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
  assignment/planAssignments.ts # morning round planner (pure, tested)
  pms/PMSConnector.ts           # interface · MockPMSConnector · OHIPConnector stub
src/app/
  login/ attendant/ supervisor/ front-office/ concierge/ engineering/
  supervisor/planning/          # morning assignment board
  api/  auth/ rooms/ arrivals/ excursions/ workorders/ notifications/ assignments/
        priority/ audit/ settings/ internal/escalations/
tests/  stateMachine.test.ts  priority.test.ts  assignment.test.ts
```

## Notes

- Defect photos are stored under `public/uploads/` (local S3 mock).
- The audit trail (`GET /api/audit`, supervisor/DM) records logins, every status
  change **and every denied attempt**, assignments, PMS pushes, and settings edits.
