import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { FLOOR_PLAN, HOTEL, FLOOR_FACILITIES } from "../src/lib/floorplan/hotelDeRome";
import { DEMO_PASSWORD, demoUsers } from "./demoUsers";
import { ensureDemoStay } from "./demoStay";

/**
 * Seed: one user per role, ten room attendants, every room of the real
 * Hotel de Rome Berlin floor plan (src/lib/floorplan/hotelDeRome.ts — see
 * that file for what is digitized with high confidence vs. best-effort),
 * plus the floor facilities (HSK offices, lifts, fire escapes) and settings.
 *
 * Bewusst KEINE Tagesdaten (Zimmerstatus-Fortschritt, Belegung, Abreisen,
 * Zuteilungen, Anreisen, Defekte, Aufgaben, Notizen): Die App
 * arbeitet ausschließlich mit dem, was im Planungshub für den Betriebstag
 * eingelesen wird (siehe src/lib/dayplan/hubDay.ts). Bis dahin zeigen Board
 * und Listen den Hinweis „Listen im Planungshub einlesen".
 *
 * (An earlier, parallel iteration of this seed read room-seed-data.json's
 * calculated pattern instead; hotelDeRome.ts superseded it during branch
 * consolidation because it's a direct digitization of the floor-plan binder
 * — including interconnecting groups, disabled-access and anti-allergic
 * rooms, and terraces — rather than a formula standing in for an unverified
 * floor.)
 *
 * All demo passwords: 123
 */

const prisma = new PrismaClient();

async function main() {
  // SEED_MODE=if-empty is used by the Railway start command: seed a fresh
  // database once, but never wipe live data on a redeploy/restart.
  //
  // Checked against users AND rooms, not users alone: `db push
  // --accept-data-loss` (railway-boot.sh, runs right before this on every
  // boot) can drop/recreate the Room table on its own — most commonly, on
  // this project, when the production and preview services share one
  // Postgres and a boot from the other branch's divergent schema alters it
  // — without touching User at all. A users-only check then reads "already
  // seeded" and skips reseeding while Rooms sits empty, which is exactly
  // the "no rooms, no attendants show up" bug this guard is meant to
  // prevent, not cause. Seeding if *either* table is empty re-populates
  // both from the same wipe-and-reseed path below, so they can't drift
  // apart like this again.
  if (process.env.SEED_MODE === "if-empty") {
    const [userCount, roomCount] = await Promise.all([prisma.user.count(), prisma.room.count()]);
    if (userCount > 0 && roomCount > 0) {
      console.log(`Database already seeded (${userCount} users, ${roomCount} rooms) — skipping.`);
      return;
    }
    if (userCount > 0 || roomCount > 0) {
      console.log(
        `Partial data found (${userCount} users, ${roomCount} rooms) — reseeding both, not skipping.`
      );
    }
  }

  console.log("Seeding…");

  // Wipe in dependency order (idempotent re-seed).
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.roomTask.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.defect.deleteMany();
  await prisma.roomNote.deleteMany();
  await prisma.guestRequest.deleteMany();
  await prisma.stay.deleteMany();
  await prisma.excursion.deleteMany();
  await prisma.arrival.deleteMany();
  await prisma.trace.deleteMany();
  await prisma.dayRoomPlan.deleteMany();
  await prisma.importBatch.deleteMany(); // Zeilen + Befunde per Cascade; hängt am Nutzer (uploadedBy)
  await prisma.room.deleteMany();
  await prisma.floorFacility.deleteMany();
  await prisma.user.deleteMany();
  await prisma.setting.deleteMany();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // --- Users -------------------------------------------------------------
  // The list itself lives in prisma/demoUsers.ts, shared with the additive
  // boot step in prisma/ensure-demo-users.ts so a newly added login can't end
  // up in only one of the two paths.
  const usersData = demoUsers();
  for (const u of usersData) {
    await prisma.user.create({ data: { ...u, passwordHash } });
  }

  // --- Rooms: every key of the real Hotel de Rome floor plan -------------
  // Room type is left "UNVERIFIED" for every room — the source floor plans
  // only show type as grayscale shading, which couldn't be read reliably
  // from the photos (see src/lib/floorplan/hotelDeRome.ts). baseCleanMinutes
  // stays at the schema default (30) until real types are entered.

  // Nur Stammdaten je Zimmer. Status bleibt beim Schema-Standard, Belegung/Abreise/Zuteilung kommen erst
  // aus dem Planungshub (Tagesplan → Board), nie aus erfundenen Demo-Werten.
  let count = 0;
  for (const floor of HOTEL.floors) {
    for (const entry of FLOOR_PLAN[floor]) {
      count++;
      await prisma.room.create({
        data: {
          number: entry.number,
          floor,
          section: entry.section,
          type: "UNVERIFIED",
          status: "INSPECTED", // Grundzustand „sauber"; schmutzig wird ein Zimmer erst durch den Planungshub (Tagesplan)
          statusSince: new Date("2000-01-01T00:00:00Z"), // „lange her": heute noch nicht bearbeitet, der Hub darf den Status setzen
          interconnectingGroup: entry.interconnectingGroup?.join(","),
          hasDisabledAccess: entry.hasDisabledAccess ?? false,
          isAntiAllergic: entry.isAntiAllergic ?? false,
          hasTerrace: entry.hasTerrace ?? false,
        },
      });
    }
  }
  console.log(`Created ${count} rooms (${HOTEL.totalRooms} expected from the floor plan).`);

  // --- Floor facilities (HSK offices, lifts, fire escapes) ----------------
  for (const facility of FLOOR_FACILITIES) {
    await prisma.floorFacility.create({ data: facility });
  }
  console.log(`Created ${FLOOR_FACILITIES.length} floor facilities.`);

  // --- Gast-Vorschau (Login-Kachel): einziger Demo-Aufenthalt, nur zur Ansicht ----------------------
  // Zimmer 301 bleibt für die Gast-Vorschau belegt (source DEMO, läuft nie ab, Nachtlöschung und Aufräumen lassen ihn aus).
  // Das ist keine Tagesdatenquelle der Hub-Ansichten.
  await ensureDemoStay(prisma);

  // --- Settings (escalation thresholds) ------------------------------------
  const settings: Record<string, string> = {
    blockedRecheckMinutes: "20",
    welfareCheckMinutes: "120",
    etaWarningMinutes: "45",
    releaseQueueBacklogThreshold: "5",
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.create({ data: { key, value } });
  }

  console.log("Seed complete. Login with any seeded user / password '123'.");
  console.table(usersData.map((u) => ({ email: u.email, role: u.role })));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
