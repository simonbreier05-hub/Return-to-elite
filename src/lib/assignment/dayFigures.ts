/**
 * The numbers a supervisor reads off the night-audit report before planning:
 * how many rooms leave today, how many guests arrive, how full the house will
 * be tonight.
 *
 * In the finished system these arrive from OPERA. Here they are entered by
 * hand, which is also what makes the board useful as a what-if tool — "we just
 * took twenty more arrivals, do we still finish?" is a question the plan should
 * answer before the shift starts, not at 14:00.
 *
 * Departure cleans take substantially longer than stayover service, so the
 * split between them is the single biggest driver of the day's workload. That
 * is why it is an input and not a guess.
 */

export interface DayFigures {
  /** Rooms checking out today — these need a full departure clean. */
  departures: number;
  /** Guests arriving today; their rooms have to be released before ETA. */
  arrivals: number;
  /** Rooms occupied tonight. Stayovers are this minus the arrivals. */
  eveningOccupancy: number;
}

export interface ClassifiableRoom {
  id: string;
  number: string;
  isCheckoutToday: boolean;
  occupancy: string;
  priorityScore: number;
}

/** What the live data says, used to prefill the panel. */
export function defaultDayFigures(rooms: ClassifiableRoom[], expectedArrivals: number): DayFigures {
  const departures = rooms.filter((r) => r.isCheckoutToday).length;
  const occupiedNow = rooms.filter((r) => r.occupancy === "OCCUPIED").length;
  const stayovers = Math.max(0, occupiedNow - departures);
  return {
    departures,
    arrivals: expectedArrivals,
    eveningOccupancy: stayovers + expectedArrivals,
  };
}

/**
 * Decide which rooms are planned as departure cleans.
 *
 * Rooms the PMS already flags as due-out come first, so raising the number only
 * ever adds to them — the supervisor's figure never overrides a known checkout.
 * Beyond those, the most urgent rooms are taken, and room number breaks ties so
 * the same figures always produce the same plan.
 */
export function classifyDepartures(rooms: ClassifiableRoom[], departures: number): Set<string> {
  const ordered = [...rooms].sort(
    (a, b) =>
      Number(b.isCheckoutToday) - Number(a.isCheckoutToday) ||
      b.priorityScore - a.priorityScore ||
      a.number.localeCompare(b.number)
  );
  const take = Math.max(0, Math.min(Math.round(departures), ordered.length));
  return new Set(ordered.slice(0, take).map((r) => r.id));
}

export interface FigureWarning {
  field: keyof DayFigures;
  message: string;
}

/**
 * Sanity-check what was typed. These are warnings, not errors: the supervisor
 * may know something the system does not, so nothing is blocked — but a figure
 * that cannot be right should say so before it silently skews the plan.
 */
export function checkDayFigures(figures: DayFigures, totalRooms: number, roomsNeedingWork: number): FigureWarning[] {
  const warnings: FigureWarning[] = [];

  if (figures.departures > roomsNeedingWork) {
    warnings.push({
      field: "departures",
      message: `Only ${roomsNeedingWork} rooms still need cleaning, so at most that many can be planned as departures.`,
    });
  }
  if (figures.eveningOccupancy > totalRooms) {
    warnings.push({
      field: "eveningOccupancy",
      message: `The house has ${totalRooms} keys — tonight cannot exceed that.`,
    });
  }
  if (figures.arrivals > figures.eveningOccupancy) {
    warnings.push({
      field: "arrivals",
      message: "More arrivals than rooms occupied tonight — one of the two figures is off.",
    });
  }
  return warnings;
}

/** Stayovers are never entered directly; they fall out of the other two. */
export function stayoversFrom(figures: DayFigures): number {
  return Math.max(0, figures.eveningOccupancy - figures.arrivals);
}
