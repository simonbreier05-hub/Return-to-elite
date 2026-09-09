/**
 * Hotel de Rome Berlin — floor plan, digitized from the housekeeping
 * floor-plan binder (photographed & transcribed 2026-09-02).
 *
 * This is the single source of truth for the property's real layout: which
 * rooms exist on which floor, how staff are meant to walk each floor from
 * the lift ("Aus dem Lift geradeaus/rechts" — the reference card kept behind
 * every floor plan), which rooms interconnect, and where the fire escapes,
 * the guest & service lifts and the housekeeping (HSK) offices are.
 *
 * Room *attendants and all other staff always arrive on a floor via the SVC
 * (service) lift* — everything a room attendant needs is kept in the HSK
 * office positioned at that lift (see `PRIMARY_HSK_BY_FLOOR` / the
 * `isPrimaryHsk` flag on `FLOOR_FACILITIES`). Any other HSK room on the same
 * floor is secondary storage, not the one to send an attendant to.
 *
 * CONFIDENCE NOTE — read this before trusting a field operationally:
 *   - Room numbers, floors, and the elevator wayfinding text are read
 *     directly off clearly legible printed text and are high-confidence.
 *   - Interconnecting groups, the disabled-access and anti-allergic rooms,
 *     and floor 5's exact room list are a best-effort read of hand-annotated
 *     paper plans (some scans are low-resolution and rotated) — verify
 *     against the originals before relying on them for anything safety- or
 *     compliance-critical.
 *   - Room *type/category* (Classic, Deluxe, Superior Deluxe, Junior Suite,
 *     Classic/Executive/Historic/Bebel Suite) is shown on the plans only as
 *     grayscale shading that could not be reliably distinguished from the
 *     photos. Every room therefore seeds as type "UNVERIFIED" — see
 *     ROOM_TYPES in src/lib/domain.ts — until someone enters the real
 *     category from the property's actual color-coded plan/key.
 */

export interface RoomPlanEntry {
  number: string;
  /** Wayfinding section: "<floor>A" = straight from the lift, "<floor>B" = turn right from the lift. */
  section: string;
  /** Other room numbers this one has a connecting door to, if any. */
  interconnectingGroup?: string[];
  hasDisabledAccess?: boolean;
  isAntiAllergic?: boolean;
  hasTerrace?: boolean;
}

/** Straight-from-lift ("geradeaus") room numbers, per floor — everything else on the floor is "rechts". */
const STRAIGHT_ROOMS: Record<number, string[]> = {
  1: ["101", "102", "123", "124", "125", "126", "127", "128", "129"],
  2: ["204", "205", "206", "207", "208", "209", "210", "211", "212", "214", "215", "216", "217", "218", "219", "220", "221", "222"],
  3: ["304", "307", "308", "309", "310", "311", "312", "314", "315", "316", "317", "318", "319", "320", "321", "322"],
  4: ["401", "402", "412", "414", "415", "416", "417", "418", "419", "420", "421", "422"],
  5: ["514", "515", "517", "518", "519", "521", "522"],
};

function buildFloor(floor: number, numbers: string[], extras: Partial<Record<string, Omit<RoomPlanEntry, "number" | "section">>>): RoomPlanEntry[] {
  const straight = new Set(STRAIGHT_ROOMS[floor]);
  return numbers.map((number) => ({
    number,
    section: `${floor}${straight.has(number) ? "A" : "B"}`,
    ...extras[number],
  }));
}

const FLOOR_1 = buildFloor(
  1,
  ["101", "102", "104", "105", "109", "110", "111", "112", "114", "115", "116", "117", "118", "119", "120", "121", "122", "123", "124", "125", "126", "127", "128", "129", "130", "131", "132", "133", "134", "135", "136", "137"],
  {
    "104": { interconnectingGroup: ["105"] },
    "105": { interconnectingGroup: ["104"] },
    "109": { interconnectingGroup: ["110"] },
    "110": { interconnectingGroup: ["109"] },
    "111": { hasDisabledAccess: true },
    "118": { interconnectingGroup: ["119"] },
    "119": { interconnectingGroup: ["118"] },
  }
);

const FLOOR_2 = buildFloor(
  2,
  ["201", "202", "203", "204", "205", "206", "207", "208", "209", "210", "211", "212", "214", "215", "216", "217", "218", "219", "220", "221", "222", "223", "224", "225", "226", "227", "228", "229", "230", "231", "232", "233", "234", "235", "236", "237"],
  {
    "204": { interconnectingGroup: ["205"] },
    "205": { interconnectingGroup: ["204"] },
    "209": { interconnectingGroup: ["210"] },
    "210": { interconnectingGroup: ["209"] },
    "211": { hasDisabledAccess: true },
    "218": { interconnectingGroup: ["219"], isAntiAllergic: true },
    "219": { interconnectingGroup: ["218"], isAntiAllergic: true },
  }
);

// Floor 3 replaces the low-numbered classic-room run with fewer, larger
// suites (304/307/308/309/310 instead of 101/102/104/105/109/110-style
// rooms) — read directly off the plan, not a +200 shift of floor 1.
const FLOOR_3 = buildFloor(
  3,
  ["301", "304", "307", "308", "309", "310", "311", "312", "314", "315", "316", "317", "318", "319", "320", "321", "322", "323", "324", "325", "326", "327", "328", "329", "330", "331", "332", "333", "334", "335", "336", "337", "338"],
  {
    // The plan shows one bracket spanning 304/307/308/309 plus a separate
    // one for 309/310 — modeled here as one connecting group; verify the
    // exact door-by-door pairing against the original if it matters.
    "304": { interconnectingGroup: ["307", "308", "309"] },
    "307": { interconnectingGroup: ["304", "308", "309"] },
    "308": { interconnectingGroup: ["304", "307", "309"] },
    "309": { interconnectingGroup: ["304", "307", "308", "310"] },
    "310": { interconnectingGroup: ["309"] },
    "318": { interconnectingGroup: ["319"] },
    "319": { interconnectingGroup: ["318"] },
  }
);

// Floor 4's Bebelplatz-facing wing (roughly 403-411 on the floors below) is
// given over to guest terraces and the lobby overlook instead of guest
// rooms — see FLOOR_FACILITIES for the TERRACE entries.
const FLOOR_4 = buildFloor(
  4,
  ["401", "402", "412", "414", "415", "416", "417", "418", "419", "420", "421", "422", "423", "424", "425", "428", "431", "432", "433", "434", "435", "436", "437"],
  {
    "418": { interconnectingGroup: ["419"] },
    "419": { interconnectingGroup: ["418"] },
    "436": { hasDisabledAccess: true },
  }
);

// Floor 5 (top floor) is the lowest-confidence read: a smaller, irregular
// set of suites around two terraces. Numbers 531/536 are named on the
// elevator wayfinding card but were not clearly legible on the plan photo
// itself, so they are left out here rather than guessed — verify against
// the original plan before treating this floor's room list as complete.
const FLOOR_5 = buildFloor(
  5,
  ["514", "515", "517", "518", "519", "521", "522", "523", "524", "526", "529", "530", "533", "534", "535"],
  {
    "518": { interconnectingGroup: ["519"] },
    "519": { interconnectingGroup: ["518"] },
  }
);

export const FLOOR_PLAN: Record<number, RoomPlanEntry[]> = {
  1: FLOOR_1,
  2: FLOOR_2,
  3: FLOOR_3,
  4: FLOOR_4,
  5: FLOOR_5,
};

export const FLOORS = [1, 2, 3, 4, 5] as const;

/** The property, as digitized above — replaces the earlier generic 29-rooms-per-floor placeholder model. */
export const HOTEL = {
  floors: FLOORS,
  /**
   * Floor 5 is the one floor plan flagged above as the lowest-confidence
   * read (a smaller, irregular suite layout; two numbers named on the
   * elevator wayfinding card couldn't be confirmed on the plan itself and
   * were left out rather than guessed). The UI surfaces this so it never
   * presents that room list as fully verified — drop it once someone
   * checks floor 5 against the original plan.
   */
  unconfirmedFloors: [5] as readonly number[],
  get totalRooms(): number {
    return FLOORS.reduce((n, f) => n + FLOOR_PLAN[f].length, 0);
  },
} as const;

/** Room numbers for a floor, in ascending order — replaces the old formulaic generator. */
export function roomNumbersForFloor(floor: number): string[] {
  return (FLOOR_PLAN[floor] ?? []).map((r) => r.number);
}

export function planEntryFor(floor: number, number: string): RoomPlanEntry | undefined {
  return FLOOR_PLAN[floor]?.find((r) => r.number === number);
}

/**
 * "Aus dem Lift geradeaus / rechts" — the wayfinding reference card kept
 * behind every floor's plan in the binder. Identical in structure floor to
 * floor; the room ranges are corridor-stretch descriptions (a range may
 * skip numbers that were merged into a larger suite), not a literal
 * enumeration — cross-check against FLOOR_PLAN for which rooms actually
 * exist.
 */
export interface WayfindingLeg {
  range: string;
  side: "links" | "rechts";
  note?: string;
}
export const ELEVATOR_WAYFINDING: Record<number, { straight: WayfindingLeg[]; right: WayfindingLeg[] }> = {
  1: {
    straight: [
      { range: "101, 102", side: "rechts" },
      { range: "123–129", side: "links" },
    ],
    right: [
      { range: "130–137", side: "links" },
      { range: "104–112", side: "rechts" },
      { range: "114–122", side: "links" },
    ],
  },
  2: {
    straight: [
      { range: "204–212", side: "rechts" },
      { range: "214–222", side: "links" },
    ],
    right: [
      { range: "201–203", side: "links" },
      { range: "223–229", side: "rechts" },
      { range: "230–237", side: "links" },
    ],
  },
  3: {
    straight: [
      { range: "302–312", side: "rechts", note: "# 302 Stufen! (steps)" },
      { range: "314–322", side: "links" },
    ],
    right: [
      { range: "301", side: "links" },
      { range: "323–329", side: "rechts" },
      { range: "330–338", side: "links" },
    ],
  },
  4: {
    straight: [
      { range: "401, 402, 412", side: "rechts" },
      { range: "414–422", side: "links" },
    ],
    right: [
      { range: "423–429", side: "rechts" },
      { range: "430–437", side: "links" },
    ],
  },
  5: {
    straight: [{ range: "514–522", side: "links" }],
    right: [
      { range: "523–529", side: "rechts" },
      { range: "530–536", side: "links" },
    ],
  },
};

/** Non-lettable floor facilities — fire escapes, lifts, HSK offices. */
export interface FloorFacilityEntry {
  floor: number;
  type: "HSK" | "SVC_LIFT" | "GUEST_LIFT" | "FIRE_ESCAPE" | "LOBBY" | "EVENT_SPACE" | "TERRACE";
  label: string;
  isPrimaryHsk?: boolean;
  nearRoom?: string;
  notes?: string;
}

export const FLOOR_FACILITIES: FloorFacilityEntry[] = [
  // --- Floor 1 ---
  { floor: 1, type: "SVC_LIFT", label: "Service lift — staff & housekeeping arrival point", nearRoom: "120" },
  { floor: 1, type: "HSK", label: "Housekeeping office (at the SVC lift)", isPrimaryHsk: true, nearRoom: "114" },
  { floor: 1, type: "HSK", label: "Secondary linen/storage closet", nearRoom: "136", notes: "Not the SVC-lift office — supplies are kept in the primary HSK." },
  { floor: 1, type: "GUEST_LIFT", label: "Guest lifts (x2)", nearRoom: "134" },
  { floor: 1, type: "FIRE_ESCAPE", label: "Fire escape", nearRoom: "102" },
  { floor: 1, type: "FIRE_ESCAPE", label: "Fire escape", nearRoom: "132" },
  { floor: 1, type: "LOBBY", label: "Lobby" },
  { floor: 1, type: "EVENT_SPACE", label: "Palm Court / Ballsaal" },
  { floor: 1, type: "EVENT_SPACE", label: "Opera Court" },

  // --- Floor 2 ---
  { floor: 2, type: "SVC_LIFT", label: "Service lift — staff & housekeeping arrival point", nearRoom: "220" },
  { floor: 2, type: "HSK", label: "Housekeeping office (at the SVC lift)", isPrimaryHsk: true, nearRoom: "214" },
  { floor: 2, type: "HSK", label: "Secondary linen/storage closet", nearRoom: "236", notes: "Not the SVC-lift office — supplies are kept in the primary HSK." },
  { floor: 2, type: "GUEST_LIFT", label: "Guest lifts (x2)", nearRoom: "234" },
  { floor: 2, type: "FIRE_ESCAPE", label: "Fire escape", nearRoom: "202" },
  { floor: 2, type: "FIRE_ESCAPE", label: "Fire escape", nearRoom: "232" },
  { floor: 2, type: "LOBBY", label: "Lobby" },

  // --- Floor 3 ---
  { floor: 3, type: "SVC_LIFT", label: "Service lift — staff & housekeeping arrival point", nearRoom: "320" },
  { floor: 3, type: "HSK", label: "Housekeeping office (at the SVC lift)", isPrimaryHsk: true, nearRoom: "314" },
  { floor: 3, type: "HSK", label: "Secondary linen/storage closet", nearRoom: "336", notes: "Not the SVC-lift office — supplies are kept in the primary HSK." },
  { floor: 3, type: "GUEST_LIFT", label: "Guest lifts (x2)", nearRoom: "334" },
  { floor: 3, type: "FIRE_ESCAPE", label: "Fire escape", nearRoom: "301" },
  { floor: 3, type: "FIRE_ESCAPE", label: "Fire escape", nearRoom: "332" },
  { floor: 3, type: "LOBBY", label: "Lobby" },

  // --- Floor 4 ---
  { floor: 4, type: "SVC_LIFT", label: "Service lift — staff & housekeeping arrival point", nearRoom: "420" },
  { floor: 4, type: "HSK", label: "Housekeeping office (at the SVC lift)", isPrimaryHsk: true, nearRoom: "414" },
  { floor: 4, type: "HSK", label: "Secondary linen/storage closet", nearRoom: "436", notes: "Not the SVC-lift office — supplies are kept in the primary HSK." },
  { floor: 4, type: "GUEST_LIFT", label: "Guest lifts (x2)", nearRoom: "434" },
  { floor: 4, type: "FIRE_ESCAPE", label: "Fire escape", nearRoom: "433" },
  { floor: 4, type: "LOBBY", label: "Lobby" },
  { floor: 4, type: "TERRACE", label: "Guest terrace (Bebelplatz wing)" },
  { floor: 4, type: "TERRACE", label: "Guest terrace (Bebelplatz wing)" },

  // --- Floor 5 ---
  { floor: 5, type: "SVC_LIFT", label: "Service lift — staff & housekeeping arrival point", nearRoom: "521" },
  { floor: 5, type: "HSK", label: "Housekeeping office (at the SVC lift)", isPrimaryHsk: true, nearRoom: "514" },
  { floor: 5, type: "HSK", label: "Secondary linen/storage closet", nearRoom: "533", notes: "Not the SVC-lift office — supplies are kept in the primary HSK." },
  { floor: 5, type: "GUEST_LIFT", label: "Guest lifts (x2)", nearRoom: "534" },
  { floor: 5, type: "FIRE_ESCAPE", label: "Fire escape", nearRoom: "531" },
  { floor: 5, type: "LOBBY", label: "Lobby" },
  { floor: 5, type: "TERRACE", label: "Guest terrace", notes: "Exact suites opening onto this terrace not confirmed from the photo — verify against the color plan." },
  { floor: 5, type: "TERRACE", label: "Guest terrace", notes: "Exact suites opening onto this terrace not confirmed from the photo — verify against the color plan." },
];

export function primaryHskFor(floor: number): FloorFacilityEntry | undefined {
  return FLOOR_FACILITIES.find((f) => f.floor === floor && f.type === "HSK" && f.isPrimaryHsk);
}
