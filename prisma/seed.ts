import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { FLOOR_4_SECTION } from "../src/lib/domain";
import { isHousekeepingRelevant } from "../src/lib/rooms/isHousekeepingRelevant";

/**
 * Seed: one user per role, ten room attendants, and the house's real rooms
 * — read live from data/room-seed-data.json, not a guessed formula — with
 * sections & types, demo arrivals/excursions/defects so every view has
 * something to show on first login.
 *
 * room-seed-data.json is the actual room table (source: the "Elite
 * Housekeeping" Airtable base / the house's own floor plans), all 145 keys
 * across floors 1–5. Floors 3 and 4 come from photographed floor plans;
 * floors 1, 2 and 5 follow the same numbering pattern but are a *calculated*
 * trim to hit the house's stated 145-key total, not independently confirmed
 * — the file's own `note` says so, and src/lib/domain.ts's
 * `HOTEL.unconfirmedFloors` mirrors exactly that admission so the UI keeps
 * saying it out loud instead of presenting a computed guess as fact. Update
 * the JSON (and HOTEL.unconfirmedFloors) once a floor is actually verified.
 *
 * All demo passwords: 123
 */

interface SeedRoom {
  number: string;
  floor: number;
}
interface RoomSeedData {
  note: string;
  totalRoomsInThisFile: number;
  rooms: SeedRoom[];
}

function loadRoomSeedData(): RoomSeedData {
  const filePath = path.join(__dirname, "data", "room-seed-data.json");
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as RoomSeedData;
  if (!Array.isArray(data.rooms) || data.rooms.length === 0) {
    throw new Error(`room-seed-data.json at ${filePath} has no rooms — refusing to seed an empty house.`);
  }
  return data;
}

const prisma = new PrismaClient();

const PASSWORD = "123";

async function main() {
  // SEED_MODE=if-empty is used by the Railway start command: seed a fresh
  // database once, but never wipe live data on a redeploy/restart.
  if (process.env.SEED_MODE === "if-empty") {
    const existing = await prisma.user.count();
    if (existing > 0) {
      console.log(`Database already seeded (${existing} users) — skipping.`);
      return;
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
  await prisma.user.deleteMany();
  await prisma.setting.deleteMany();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // --- Users -------------------------------------------------------------
  // Ten attendants for 145 keys — roughly 14 rooms each, which is what a
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
  ];
  const users: Record<string, { id: string; role: string }> = {};
  for (const u of usersData) {
    const created = await prisma.user.create({ data: { ...u, passwordHash } });
    users[u.email] = created;
  }
  const attendants = usersData.filter((u) => u.role === "room_attendant").map((u) => users[u.email]);

  // --- Rooms: the house's real key list -----------------------------------
  const seedData = loadRoomSeedData();
  const roomsByFloor = new Map<number, string[]>();
  for (const r of seedData.rooms) {
    if (!roomsByFloor.has(r.floor)) roomsByFloor.set(r.floor, []);
    roomsByFloor.get(r.floor)!.push(r.number);
  }
  for (const numbers of roomsByFloor.values()) numbers.sort((a, b) => a.localeCompare(b));
  const floors = [...roomsByFloor.keys()].sort((a, b) => a - b);
  console.log(`room-seed-data.json: ${seedData.rooms.length} rooms across floors ${floors.join(", ")}.`);

  // Categories climb with the floor, the way a city hotel is usually stacked.
  // (No confirmed category data yet for any floor — this tiering is still a
  // placeholder, same as the room list for floors 1, 2 and 5 themselves.)
  const typeFor = (floor: number, idx: number): string => {
    if (floor === 5) return idx % 4 === 0 ? "SUITE" : idx % 2 === 0 ? "JUNIOR_SUITE" : "DELUXE";
    if (floor === 4) return idx % 4 === 0 ? "SUITE" : idx % 2 === 0 ? "JUNIOR_SUITE" : "DELUXE";
    if (floor === 3) return idx % 5 === 0 ? "JUNIOR_SUITE" : "DELUXE";
    if (floor === 2) return idx % 3 === 0 ? "DELUXE" : "SUPERIOR";
    return idx % 4 === 0 ? "SUPERIOR" : "CLASSIC";
  };
  const baseMinutes: Record<string, number> = {
    CLASSIC: 25, SUPERIOR: 28, DELUXE: 32, JUNIOR_SUITE: 40, SUITE: 55, PENTHOUSE: 80,
  };

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
  for (const floor of floors) {
    const numbers = roomsByFloor.get(floor)!;
    for (const [idx, number] of numbers.entries()) {
      const i = idx + 1; // 1-based position on the floor, not the literal room number
      // Floor 4 doesn't split neatly by position — its two wings are read
      // straight off the floor plan (see FLOOR_4_SECTION); every other
      // floor still splits by position along one running corridor.
      const section = floor === 4 ? FLOOR_4_SECTION[number as keyof typeof FLOOR_4_SECTION] : `${floor}${i <= 15 ? "A" : "B"}`;
      const type = typeFor(floor, i);
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
      // real stayover rooms away). `&& !checkout` here used to zero a
      // departure room's occupancy out immediately, which is what made the
      // "belegte Zimmer heute Abend" figure the supervisor sees come out far
      // lower than the rooms actually needing an attendant.
      const occupancy = occupied ? "OCCUPIED" : "VACANT";
      const relevant = isHousekeepingRelevant({ occupancy, isCheckoutToday: checkout });
      const status = relevant ? progression[floor][i % progression[floor].length] : "INSPECTED";
      const minutesAgo = relevant
        ? status === "DIRTY" ? 0 : 10 + ((i * 7) % 90)
        : 240 + ((i * 11) % 600); // released a while ago, nothing pending

      const room = await prisma.room.create({
        data: {
          number,
          floor,
          section,
          type,
          status,
          statusSince: new Date(Date.now() - minutesAgo * 60_000),
          occupancy,
          isCheckoutToday: checkout,
          baseCleanMinutes: baseMinutes[type],
          assignedToId: assignee.id,
        },
      });
      roomIds.push({ id: room.id, number, floor, section });
    }
  }
  console.log(`Created ${count} rooms.`);

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
  // 207 / 208 are being turned around for the arrivals seeded below —
  // today's departure clean, guest not there yet.
  await prisma.room.update({
    where: { number: "207" },
    data: { status: "CLEAN", statusSince: at(-30), occupancy: "VACANT", isCheckoutToday: true },
  });
  await prisma.room.update({
    where: { number: "208" },
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
    where: { number: "512" },
    data: { status: "OUT_OF_ORDER", oooUntil: at(60 * 24 * 3), statusSince: at(-60 * 24) },
  });
  await prisma.room.update({
    where: { number: "108" },
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
    { room: "207", guestName: "Dr. Amelie Winter", eta: at(40), vip: true, earlyCheckIn: true, neededNow: false },
    { room: "208", guestName: "Jonas Berg", eta: at(90), vip: false, earlyCheckIn: false, neededNow: true },
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
      roomId: byNumber["310"].id, guestName: "Sig. Bianchi",
      startsAt: at(30), endsAt: at(240), note: "Golf outing.",
      createdById: concierge.id,
    },
  });

  // --- Defect + work order ------------------------------------------------
  // Same room as the OUT_OF_ORDER override above (512) — the OOO status is
  // because of this defect.
  const maria = users["maria@hotel.test"];
  const defect = await prisma.defect.create({
    data: {
      roomId: byNumber["512"].id,
      category: "PLUMBING",
      note: "Shower drain blocked, water pooling.",
      reportedById: maria.id,
    },
  });
  await prisma.workOrder.create({ data: { defectId: defect.id, status: "ACK", ackAt: at(-30) } });

  // --- Notes ---------------------------------------------------------------
  await prisma.roomNote.create({
    data: { roomId: byNumber["207"].id, authorId: fo.id, body: "VIP amenity (champagne) to be placed before arrival." },
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
