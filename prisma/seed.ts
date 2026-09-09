import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { FLOOR_PLAN, HOTEL, FLOOR_FACILITIES } from "../src/lib/floorplan/hotelDeRome";
import { isHousekeepingRelevant } from "../src/lib/rooms/isHousekeepingRelevant";
import { GUEST_SYSTEM_EMAIL } from "../src/lib/guest";

/**
 * Seed: one user per role, ten room attendants, every room of the real
 * Hotel de Rome Berlin floor plan (src/lib/floorplan/hotelDeRome.ts — see
 * that file for what is digitized with high confidence vs. best-effort),
 * plus the floor facilities (HSK offices, lifts, fire escapes) and demo
 * arrivals/excursions/defects so every view has something to show on first
 * login.
 *
 * All demo passwords: 123
 */

const prisma = new PrismaClient();

const PASSWORD = "123";

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
  await prisma.workOrder.deleteMany();
  await prisma.defect.deleteMany();
  await prisma.roomNote.deleteMany();
  await prisma.excursion.deleteMany();
  await prisma.arrival.deleteMany();
  await prisma.room.deleteMany();
  await prisma.floorFacility.deleteMany();
  await prisma.user.deleteMany();
  await prisma.setting.deleteMany();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // --- Users -------------------------------------------------------------
  // Ten attendants for ~139 keys — roughly 14 rooms each, which is what a
  // five-star house actually rosters. With four, every plan comes out at
  // three shifts' worth of work and the planning board is meaningless.
  const usersData = [
    { email: "maria@hotel.test", name: "Maria Silva", role: "room_attendant", section: "2A" },
    { email: "aylin@hotel.test", name: "Aylin Kaya", role: "room_attendant", section: "3A" },
    { email: "petra@hotel.test", name: "Petra Novak", role: "room_attendant", section: "5B" },
    { email: "hausdame@hotel.test", name: "Ingrid Hausmann", role: "room_attendant", section: "1A" },
    { email: "lucia@hotel.test", name: "Lucia Ferrari", role: "room_attendant", section: "1B" },
    { email: "elena@hotel.test", name: "Elena Popescu", role: "room_attendant", section: "2B" },
    { email: "fatima@hotel.test", name: "Fatima Benali", role: "room_attendant", section: "3B" },
    { email: "joanna@hotel.test", name: "Joanna Kowalska", role: "room_attendant", section: "4A" },
    { email: "sena@hotel.test", name: "Sena Demir", role: "room_attendant", section: "4B" },
    { email: "grace@hotel.test", name: "Grace Okafor", role: "room_attendant", section: "5A" },
    { email: "supervisor@hotel.test", name: "Sofia Marchetti", role: "supervisor" },
    { email: "frontoffice@hotel.test", name: "Felix Ott", role: "front_office" },
    { email: "concierge@hotel.test", name: "Claire Dubois", role: "concierge" },
    { email: "engineering@hotel.test", name: "Erik Weber", role: "engineering" },
    { email: "manager@hotel.test", name: "Diana Maier", role: "duty_manager" },
    // System account backing the guest-facing test screen (src/app/guest/305)
    // — attributes guest-submitted notes/defects, never a real login.
    // role: "guest" is deliberately outside the ROLES enum (see src/lib/domain.ts)
    // so it never appears in a role-filtered staff picker; GET /api/auth/dev-login
    // filters it out of the quick-login list for the same reason.
    // Room number is env-overridable per deployment (see guestServer.ts) —
    // read directly here rather than importing that file, which pulls in
    // the Next.js prisma singleton this standalone seed script doesn't use.
    // Default is "310": this house's real, digitized floor plan (unlike the
    // calculated room list guestServer.ts's own comment was written
    // against) has no room "305" at all — 310 is the nearest real key on
    // the same floor that isn't already claimed by another demo scenario
    // below.
    {
      email: GUEST_SYSTEM_EMAIL,
      name: `Guest (Room ${process.env.GUEST_ROOM_NUMBER?.trim() || "310"})`,
      role: "guest",
    },
  ];
  const users: Record<string, { id: string; role: string }> = {};
  for (const u of usersData) {
    const created = await prisma.user.create({ data: { ...u, passwordHash } });
    users[u.email] = created;
  }
  const attendants = usersData.filter((u) => u.role === "room_attendant").map((u) => users[u.email]);

  // --- Rooms: every key of the real Hotel de Rome floor plan -------------
  // Room type is left "UNVERIFIED" for every room — the source floor plans
  // only show type as grayscale shading, which couldn't be read reliably
  // from the photos (see src/lib/floorplan/hotelDeRome.ts). baseCleanMinutes
  // stays at the schema default (30) until real types are entered.

  // A snapshot of mid-morning: the team started low and is working its way
  // up, so floor 1 is largely released while floor 5 has not been touched.
  // Without this every tile is red and the board shows nothing. This only
  // ever applies to rooms housekeeping actually has reason to touch today —
  // see isHousekeepingRelevant below.
  const progression: Record<number, string[]> = {
    1: ["INSPECTED", "INSPECTED", "INSPECTED", "INSPECTED", "CLEAN", "DIRTY"],
    2: ["INSPECTED", "INSPECTED", "CLEAN", "IN_PROGRESS", "DIRTY", "DIRTY"],
    3: ["INSPECTED", "CLEAN", "IN_PROGRESS", "DIRTY", "DIRTY", "DIRTY"],
    4: ["IN_PROGRESS", "DIRTY", "DIRTY", "DIRTY", "DIRTY", "DIRTY"],
    5: ["DIRTY", "DIRTY", "DIRTY", "DIRTY", "DIRTY", "DIRTY"],
  };

  const roomIds: { id: string; number: string; floor: number; section: string }[] = [];
  let count = 0;
  for (const floor of HOTEL.floors) {
    const plan = FLOOR_PLAN[floor];
    for (const [idx, entry] of plan.entries()) {
      const i = idx + 1; // 1-based position on the floor, not the literal room number
      count++;
      // Deterministic-ish demo distribution of statuses & occupancy
      const occupied = count % 3 !== 0;
      const checkout = count % 4 === 0;
      const assignee = attendants[(floor + i) % attendants.length];

      // `occupancy` means "is a guest physically in the room right now" — a
      // departure guest still counts as OCCUPIED until they actually leave,
      // exactly like defaultDayFigures() assumes (it derives stayovers as
      // occupiedNow − departures, so occupiedNow has to include departures
      // while they're still checked in, or that subtraction quietly throws
      // real stayover rooms away). Not `occupied && !checkout` — that used
      // to zero a departure room's occupancy out immediately, which is what
      // made the "belegte Zimmer heute Abend" figure the supervisor sees
      // come out far lower than the rooms actually needing an attendant.
      const occupancy = occupied ? "OCCUPIED" : "VACANT";
      const relevant = isHousekeepingRelevant({ occupancy, isCheckoutToday: checkout });
      const status = relevant ? progression[floor][i % progression[floor].length] : "INSPECTED";
      const minutesAgo = relevant
        ? status === "DIRTY" ? 0 : 10 + ((i * 7) % 90)
        : 240 + ((i * 11) % 600); // released a while ago, nothing pending

      const room = await prisma.room.create({
        data: {
          number: entry.number,
          floor,
          section: entry.section,
          type: "UNVERIFIED",
          status,
          statusSince: new Date(Date.now() - minutesAgo * 60_000),
          occupancy,
          isCheckoutToday: checkout,
          assignedToId: assignee.id,
          interconnectingGroup: entry.interconnectingGroup?.join(","),
          hasDisabledAccess: entry.hasDisabledAccess ?? false,
          isAntiAllergic: entry.isAntiAllergic ?? false,
          hasTerrace: entry.hasTerrace ?? false,
        },
      });
      roomIds.push({ id: room.id, number: entry.number, floor, section: entry.section });
    }
  }
  console.log(`Created ${count} rooms (${HOTEL.totalRooms} expected from the floor plan).`);

  // --- Floor facilities (HSK offices, lifts, fire escapes) ----------------
  for (const facility of FLOOR_FACILITIES) {
    await prisma.floorFacility.create({ data: facility });
  }
  console.log(`Created ${FLOOR_FACILITIES.length} floor facilities.`);

  const byNumber = Object.fromEntries(roomIds.map((r) => [r.number, r]));
  const now = Date.now();
  const at = (minFromNow: number) => new Date(now + minFromNow * 60_000);

  // A few rooms in interesting states for the demo. Each override also pins
  // occupancy/isCheckoutToday so the forced status stays consistent with
  // isHousekeepingRelevant — a BLOCKED or PICKUP room implies a guest is
  // actually there, a CLEAN room being prepped for a later arrival implies
  // today's departure already happened.
  await prisma.room.update({
    where: { number: "204" },
    data: { status: "IN_PROGRESS", statusSince: at(-15), occupancy: "OCCUPIED", isCheckoutToday: false },
  });
  // 205 / 206 are being turned around for the arrivals seeded below —
  // today's departure clean, guest not there yet.
  await prisma.room.update({
    where: { number: "205" },
    data: { status: "CLEAN", statusSince: at(-30), occupancy: "VACANT", isCheckoutToday: true },
  });
  await prisma.room.update({
    where: { number: "206" },
    data: { status: "CLEAN", statusSince: at(-50), occupancy: "VACANT", isCheckoutToday: true },
  });
  await prisma.room.update({ where: { number: "301" }, data: { status: "INSPECTED", statusSince: at(-60) } });
  await prisma.room.update({
    where: { number: "304" },
    data: {
      status: "BLOCKED", blockReason: "DND", blockedSince: at(-45), statusSince: at(-45),
      occupancy: "OCCUPIED", isCheckoutToday: false,
    },
  });
  await prisma.room.update({
    where: { number: "414" },
    data: {
      status: "BLOCKED", blockReason: "DOUBLE_LOCKED", blockedSince: at(-10), statusSince: at(-10),
      occupancy: "OCCUPIED", isCheckoutToday: false,
    },
  });
  await prisma.room.update({
    where: { number: "517" },
    data: { status: "OUT_OF_ORDER", oooUntil: at(60 * 24 * 3), statusSince: at(-60 * 24) },
  });
  await prisma.room.update({
    where: { number: "105" },
    data: { status: "GREEN_OPT_OUT", statusSince: at(-120), occupancy: "OCCUPIED", isCheckoutToday: false },
  });
  await prisma.room.update({
    where: { number: "515" },
    data: {
      status: "PICKUP", reworkNote: "Bathroom mirror streaky, minibar not restocked.", statusSince: at(-20),
      occupancy: "OCCUPIED", isCheckoutToday: false,
    },
  });

  // Attendant live location demo
  await prisma.user.update({
    where: { email: "maria@hotel.test" },
    data: { currentRoomId: byNumber["204"].id, lastSeenAt: new Date() },
  });

  // --- Arrivals ----------------------------------------------------------
  const fo = users["frontoffice@hotel.test"];
  const arrivals = [
    { room: "205", guestName: "Dr. Amelie Winter", eta: at(40), vip: true, earlyCheckIn: true, neededNow: false },
    { room: "206", guestName: "Jonas Berg", eta: at(90), vip: false, earlyCheckIn: false, neededNow: true },
    { room: "312", guestName: "Familie Rossi", eta: at(180), vip: false, earlyCheckIn: false, neededNow: false },
    { room: "524", guestName: "H.E. Al-Sayed", eta: at(150), vip: true, earlyCheckIn: true, neededNow: false },
    { room: "118", guestName: "Nina Larsen", eta: at(300), vip: false, earlyCheckIn: false, neededNow: false },
  ];
  for (const a of arrivals) {
    await prisma.arrival.create({
      data: {
        roomId: byNumber[a.room].id,
        guestName: a.guestName,
        eta: a.eta,
        vip: a.vip,
        earlyCheckIn: a.earlyCheckIn,
        neededNow: a.neededNow,
        createdById: fo.id,
      },
    });
  }

  // --- Excursions (concierge) --------------------------------------------
  const concierge = users["concierge@hotel.test"];
  await prisma.excursion.create({
    data: {
      roomId: byNumber["402"].id, guestName: "Mr. & Mrs. Tanaka",
      startsAt: at(-30), endsAt: at(120), note: "City tour, back for dinner.",
      createdById: concierge.id,
    },
  });
  await prisma.excursion.create({
    data: {
      roomId: byNumber["308"].id, guestName: "Sig. Bianchi",
      startsAt: at(30), endsAt: at(240), note: "Golf outing.",
      createdById: concierge.id,
    },
  });

  // --- Defect + work order ------------------------------------------------
  const maria = users["maria@hotel.test"];
  const defect = await prisma.defect.create({
    data: {
      roomId: byNumber["517"].id,
      category: "PLUMBING",
      note: "Shower drain blocked, water pooling.",
      reportedById: maria.id,
    },
  });
  await prisma.workOrder.create({ data: { defectId: defect.id, status: "ACK", ackAt: at(-30) } });

  // --- Notes ---------------------------------------------------------------
  await prisma.roomNote.create({
    data: { roomId: byNumber["205"].id, authorId: fo.id, body: "VIP amenity (champagne) to be placed before arrival." },
  });
  await prisma.roomNote.create({
    data: { roomId: byNumber["304"].id, authorId: maria.id, body: "DND sign out since morning, TV audible inside." },
  });

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
