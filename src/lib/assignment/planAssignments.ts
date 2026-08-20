/**
 * Morning assignment planner.
 *
 * Deliberately a plain, deterministic algorithm rather than a model call:
 * the supervisor has to be able to look at a proposal at 07:00 and see why
 * each room landed where it did. Same input always produces the same plan,
 * it runs in milliseconds, and it is unit-tested (tests/assignment.test.ts).
 *
 * It balances three things that pull against each other:
 *   1. equal workload, measured in predicted cleaning minutes, not room count
 *      (a penthouse is not a classic room)
 *   2. short walking distances — an attendant should own a section, not run
 *      across the house
 *   3. urgency — inside a section, high-priority rooms are handed out first
 *
 * The output is a proposal. Nothing is written until the supervisor applies it.
 */

/** Statuses that still need an attendant. CLEAN is waiting on inspection, not on cleaning. */
const NEEDS_ATTENDANT = new Set(["DIRTY", "PICKUP", "BLOCKED", "IN_PROGRESS"]);

export interface AssignableRoom {
  id: string;
  number: string;
  floor: number;
  section: string;
  status: string;
  estimatedMinutes: number;
  priorityScore: number;
}

export interface AssignableAttendant {
  id: string;
  name: string;
  preferredSection?: string | null;
}

export interface AttendantAssignment {
  attendantId: string;
  attendantName: string;
  roomIds: string[];
  totalMinutes: number;
  roomCount: number;
  floors: number[];
  sections: string[];
  /** Share of the shift this plan fills. > 1 means the attendant is overbooked. */
  load: number;
  overbooked: boolean;
  reasons: string[];
}

export interface AssignmentPlan {
  assignments: AttendantAssignment[];
  unassigned: { roomId: string; number: string; reason: string }[];
  summary: {
    totalRooms: number;
    totalMinutes: number;
    averageMinutes: number;
    /** Difference between the busiest and the quietest attendant, in minutes. */
    spreadMinutes: number;
    capacityMinutes: number;
  };
}

export interface PlanOptions {
  /** Net minutes an attendant can clean in one shift. Default 390 (6.5 h). */
  capacityMinutes?: number;
  /**
   * Rooms-per-attendant guideline (house standard: 10-12). When set, the
   * round-cutting step (below) also cuts a round once it reaches this many
   * rooms, on top of the usual minutes balance — so a short list of quick
   * rooms doesn't quietly grow into a 16-room round while a suite-heavy one
   * sits light. Unset (the default) keeps the pure minutes balance this
   * function always had, so it stays a strict no-op for existing callers.
   */
  maxRoomsPerAttendant?: number;
}

/** Urgent first; room number keeps it deterministic when scores tie. */
const byUrgency = (a: AssignableRoom, b: AssignableRoom) =>
  b.priorityScore - a.priorityScore || a.number.localeCompare(b.number);

export function planAssignments(
  rooms: AssignableRoom[],
  attendants: AssignableAttendant[],
  options: PlanOptions = {}
): AssignmentPlan {
  const capacityMinutes = options.capacityMinutes ?? 390;
  const maxRoomsPerAttendant = options.maxRoomsPerAttendant;

  const workload = rooms.filter((r) => NEEDS_ATTENDANT.has(r.status));
  const totalMinutes = workload.reduce((sum, r) => sum + r.estimatedMinutes, 0);

  const emptySummary = {
    totalRooms: workload.length,
    totalMinutes,
    averageMinutes: 0,
    spreadMinutes: 0,
    capacityMinutes,
  };

  if (attendants.length === 0) {
    return {
      assignments: [],
      unassigned: workload.map((r) => ({
        roomId: r.id,
        number: r.number,
        reason: "No attendant on shift.",
      })),
      summary: emptySummary,
    };
  }

  interface Bucket extends AttendantAssignment {
    floorSet: Set<number>;
    sectionSet: Set<string>;
  }

  const buckets: Bucket[] = attendants.map((a) => ({
    attendantId: a.id,
    attendantName: a.name,
    roomIds: [],
    totalMinutes: 0,
    roomCount: 0,
    floors: [],
    sections: [],
    load: 0,
    overbooked: false,
    reasons: [],
    floorSet: new Set<number>(),
    sectionSet: new Set<string>(),
  }));
  const bucketById = new Map(buckets.map((b) => [b.attendantId, b]));

  const place = (bucket: Bucket, room: AssignableRoom) => {
    bucket.roomIds.push(room.id);
    bucket.totalMinutes += room.estimatedMinutes;
    bucket.roomCount++;
    bucket.floorSet.add(room.floor);
    bucket.sectionSet.add(room.section);
  };

  // --- Step 1: lay the house out in walking order -------------------------
  // Floor, then section, then room number. Neighbours in this list are
  // neighbours in the building, which is what makes step 2 work.
  const walkingOrder = [...workload].sort(
    (a, b) => a.floor - b.floor || a.section.localeCompare(b.section) || a.number.localeCompare(b.number)
  );

  // --- Step 2: cut that list into as many contiguous rounds as attendants --
  // Balancing *contiguous* blocks is what keeps each attendant on one or two
  // floors. An earlier version balanced room by room and produced technically
  // even workloads that sent one person across all five floors — even, and
  // useless. Each cut is placed wherever it lands closest to its share of the
  // total, so no round ends up carrying the rounding error alone.
  const shareCount = attendants.length;
  const rounds: AssignableRoom[][] = Array.from({ length: shareCount }, () => []);
  let cursor = 0;
  let cumulative = 0;
  // The target this round is cutting towards — what's left to place, spread
  // over the rounds still open. Frozen for the whole round and only
  // recomputed when a cut actually happens (not on every room — a target
  // that kept chasing the live cumulative would converge on itself and
  // never trigger a cut). That recompute is what matters once
  // maxRoomsPerAttendant is in play: a cheap floor's round can get capped
  // well under its "ideal" minutes share (12 quick rooms doesn't reach a
  // fair share sized for slower rooms), and without re-averaging over what
  // is actually left, that shortfall silently rolls forward as debt onto
  // whichever round happens to be scanning next — typically dumping it onto
  // the first expensive floor's round and blowing it far past capacity.
  // With no cap this reduces to the original fixed-proportion target.
  let target = shareCount > 0 ? totalMinutes / shareCount : 0;

  walkingOrder.forEach((room, index) => {
    if (cursor < shareCount - 1) {
      const distanceIfCutNow = Math.abs(cumulative - target);
      const distanceIfRoomAdded = Math.abs(cumulative + room.estimatedMinutes - target);
      const roomsLeft = walkingOrder.length - index;
      const roundsLeft = shareCount - cursor;
      const atRoomCap = maxRoomsPerAttendant !== undefined && rounds[cursor].length >= maxRoomsPerAttendant;
      // Never cut so early that a later attendant would be left with nothing.
      if ((distanceIfCutNow < distanceIfRoomAdded || atRoomCap) && rounds[cursor].length > 0 && roomsLeft >= roundsLeft) {
        cursor++;
        target = cumulative + (totalMinutes - cumulative) / (shareCount - cursor);
      }
    }
    rounds[cursor].push(room);
    cumulative += room.estimatedMinutes;
  });

  // --- Step 3: hand the rounds to people, respecting preferences ----------
  const takenRound = new Set<number>();
  const roundFor = new Map<string, number>();

  // Someone who normally works 3A should get the round containing 3A.
  const byName = [...attendants].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  for (const attendant of byName) {
    const pref = attendant.preferredSection;
    if (!pref) continue;
    let best = -1;
    let bestCount = 0;
    rounds.forEach((round, i) => {
      if (takenRound.has(i)) return;
      const count = round.filter((r) => r.section === pref).length;
      if (count > bestCount) {
        bestCount = count;
        best = i;
      }
    });
    if (best >= 0) {
      takenRound.add(best);
      roundFor.set(attendant.id, best);
      bucketById.get(attendant.id)!.reasons.push(`Round built around their preferred section ${pref}.`);
    }
  }
  // Everyone else takes the remaining rounds top to bottom.
  const freeRounds = rounds.map((_, i) => i).filter((i) => !takenRound.has(i));
  let nextFree = 0;
  for (const attendant of byName) {
    if (roundFor.has(attendant.id)) continue;
    const index = freeRounds[nextFree++];
    if (index === undefined) continue;
    roundFor.set(attendant.id, index);
  }

  for (const attendant of attendants) {
    const index = roundFor.get(attendant.id);
    if (index === undefined) continue;
    const bucket = bucketById.get(attendant.id)!;
    // Urgent rooms first inside the round; the walking order is already fixed
    // by the round itself, so this only decides what gets done early.
    for (const room of [...rounds[index]].sort(byUrgency)) place(bucket, room);
  }


  // --- Finish: readable explanation per attendant -------------------------
  for (const bucket of buckets) {
    bucket.floors = [...bucket.floorSet].sort((a, b) => a - b);
    bucket.sections = [...bucket.sectionSet].sort();
    bucket.load = capacityMinutes > 0 ? bucket.totalMinutes / capacityMinutes : 0;
    bucket.overbooked = bucket.totalMinutes > capacityMinutes;

    if (bucket.roomCount === 0) {
      bucket.reasons.push("No rooms needed cleaning in their area.");
    } else {
      bucket.reasons.push(
        `${bucket.roomCount} rooms · ${bucket.totalMinutes} min predicted · ` +
          `${bucket.floors.length === 1 ? `floor ${bucket.floors[0]}` : `floors ${bucket.floors.join(", ")}`}.`
      );
      if (bucket.sections.length > 1) {
        bucket.reasons.push(`Covers ${bucket.sections.length} sections (${bucket.sections.join(", ")}) to even out the load.`);
      }
      if (bucket.overbooked) {
        bucket.reasons.push(
          `Over one shift by ${bucket.totalMinutes - capacityMinutes} min — consider extra help or deferring stayovers.`
        );
      }
      if (maxRoomsPerAttendant !== undefined && bucket.roomCount > maxRoomsPerAttendant) {
        bucket.reasons.push(
          `${bucket.roomCount} rooms is above the ${maxRoomsPerAttendant}-room guideline — there were not enough attendants to keep everyone under it.`
        );
      }
    }
  }

  const loads = buckets.map((b) => b.totalMinutes);
  const assignments: AttendantAssignment[] = buckets.map(({ floorSet: _f, sectionSet: _s, ...rest }) => rest);

  return {
    assignments,
    unassigned: [],
    summary: {
      totalRooms: workload.length,
      totalMinutes,
      averageMinutes: Math.round(totalMinutes / attendants.length),
      spreadMinutes: loads.length ? Math.max(...loads) - Math.min(...loads) : 0,
      capacityMinutes,
    },
  };
}
