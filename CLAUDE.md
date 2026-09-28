# StayClean — notes for Claude

- Schema changes: edit `prisma/schema.prisma` **and** `prisma/schema.postgres.prisma` together, then `db push` (SQLite locally, Postgres via Railway boot). There is no `prisma/migrations` folder and no `prisma migrate` in this repo — `db push --accept-data-loss` is the real, documented workflow (see `scripts/railway-boot.sh`); don't introduce a migrate-based flow without checking that first.
- Never point two services' `DATABASE_URL` at the same Postgres instance — a `db push` from one branch can silently drop a column the other just added (see the incident note in `scripts/railway-boot.sh`).
- House policy numbers (thresholds, per-room-type credits, etc.) belong in the `Setting` table via `src/lib/settings.ts` (code default + DB override), never hardcoded in a component — see `getPriorityWeights`/`getRoomTypeCredits` for the pattern.
- Reuse `FloorPlanGrid`/`RoomFlagIcons`/`roomDayCategory` for anything grundriss- or day-status-related instead of re-deriving colours/icons; `/floor-plan` (reference) and the Planungshub's `PlanningFloorPlanPanel` share these on purpose.
- `requireRole([...])` in `src/lib/rbac.ts` always also passes `duty_manager` — it's the admin role. Don't re-list it.
