import { compile, cost, roomMinutes, type Compiled } from "./cost";
import { orderRoute } from "./route";
import { isSuite, restrictionHit, type Assignment, type HkMetrics, type PlanInput, type PlanResult, type PlanRoom, type PlanWarning } from "./types";

const DEMANDING_LABEL = { VIP: "VIP", SUITE: "Suite", ALLERGY: "Allergiker-Zimmer", TRACES: "viele Traces" } as const;
/** Bis zu dieser Abweichung vom Zielband (Credits) gibt es keine Warnung — ein Zimmer lässt sich nicht teilen. */
export const CREDIT_WARN_SLACK = 0.25;
const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");

export function toIndexAssignment(c: Compiled, a: Assignment): Int16Array {
  const out = new Int16Array(c.rooms.length).fill(-1);
  c.rooms.forEach((r, i) => {
    const id = a[r.id];
    const h = id ? c.hkIdx.get(id) : undefined;
    out[i] = h === undefined ? -1 : h;
  });
  return out;
}

export function fromIndexAssignment(c: Compiled, idx: Int16Array): Assignment {
  const out: Assignment = {};
  c.rooms.forEach((r, i) => { out[r.id] = idx[i] >= 0 ? c.input.housekeepers[idx[i]].id : null; });
  return out;
}

/** Kennzahlen, Begründungen, Warnungen und Routen zu einer (Teil-)Zuteilung — auch für Handänderungen im Entwurf. */
export function buildResult(input: PlanInput, assignment: Assignment, timedOut = false): PlanResult {
  const c = compile(input);
  const idx = toIndexAssignment(c, assignment);
  const H = input.housekeepers.length;
  const byHk: PlanRoom[][] = Array.from({ length: H }, () => []);
  const unassigned: string[] = [];
  c.rooms.forEach((r, i) => { if (idx[i] >= 0) byHk[idx[i]].push(r); else unassigned.push(r.id); });

  const metrics: HkMetrics[] = input.housekeepers.map((h, k) => {
    const rs = byHk[k];
    return {
      hkId: h.id, rooms: rs.length, credits: rs.reduce((a, r) => a + r.credits, 0),
      departures: rs.filter((r) => r.kind !== "STAYOVER").length, turns: rs.filter((r) => r.kind === "TURN").length,
      stayovers: rs.filter((r) => r.kind === "STAYOVER" && !r.laundry).length, linen: rs.filter((r) => r.kind === "STAYOVER" && r.laundry).length,
      floors: [...new Set(rs.map((r) => r.floor))].sort((a, b) => a - b), demanding: rs.filter((r) => r.demanding.length).length,
      lo: h.lo, hi: h.hi, roomsLo: h.roomsLo, roomsHi: h.roomsHi,
      ...(h.minutesByKind ? { expectedMinutes: Math.round(rs.reduce((a, r) => a + roomMinutes(h, r), 0)) } : {}),
    };
  });

  const routes = input.housekeepers.map((h, k) => ({ hkId: h.id, roomIds: orderRoute(byHk[k]).map((r) => r.id) }));
  const nameOf = new Map(input.housekeepers.map((h) => [h.id, h.name]));
  const roomById = new Map(c.rooms.map((r) => [r.id, r]));

  // ── Begründungen ────────────────────────────────────────────────────────
  const reasons: Record<string, string[]> = {};
  c.rooms.forEach((r, i) => {
    const k = idx[i];
    const list: string[] = [];
    if (k < 0) { reasons[r.id] = ["Offen — bitte selbst zuteilen"]; return; }
    const h = input.housekeepers[k];
    if (r.learnedReason && (r.preferHk === h.id || (r.minLevel && h.level >= r.minLevel))) list.push(r.learnedReason);
    if (r.stayHk === h.id) list.push("Gleicher Aufenthalt: hat dieses Zimmer schon bei diesem Gast gereinigt");
    if (r.kind === "TURN") list.push("Same-Day-Turn: zuerst in der Route");
    if (r.demanding.length) list.push(`${r.demanding.map((d) => DEMANDING_LABEL[d]).join(", ")}: Stufe ${h.level}`);
    if (h.todayFloors?.includes(r.floor)) list.push(`Etage ${r.floor} laut Etagenzuweisung`);
    else if (h.homeFloors.includes(r.floor)) list.push(`Stammetage ${r.floor}`);
    else if (h.yesterdayFloors.includes(r.floor)) list.push(`Etage von gestern (${r.floor})`);
    const partner = r.interconnect.map((id) => roomById.get(id)).find((p) => p && idx[c.roomIdx.get(p.id)!] === k);
    if (partner) list.push(`Verbunden mit ${partner.number}: beim selben Housekeeper`);
    if (r.kind === "STAYOVER" && r.laundry) list.push("Wäschewechsel gleichmäßig verteilt");
    const sameFloor = byHk[k].filter((x) => x.floor === r.floor).length;
    if (sameFloor >= 2 && list.length < 3) list.push(`${sameFloor} Zimmer auf Etage ${r.floor} gebündelt`);
    reasons[r.id] = list.slice(0, 3);
    if (!reasons[r.id].length) reasons[r.id] = ["Ausgleich der Credits"];
  });

  // ── Warnungen (einfache Sprache) ───────────────────────────────────────
  const warnings: PlanWarning[] = [];
  const totalAll = c.rooms.reduce((a, r) => a + r.credits, 0);
  // Mehr Kräfte als Arbeit: dann sind "zu wenig Credits" keine Einzelwarnungen, sondern ein Hinweis fürs ganze Team.
  // Plan-1b: Maß ist die Zimmerzahl (Band je Typ); ohne Band wie bisher die Credits.
  const byRooms = input.housekeepers.length > 0 && input.housekeepers.every((h) => h.roomsLo !== undefined);
  const overstaffed = input.housekeepers.length > 0 && (byRooms
    ? c.rooms.length < input.housekeepers.reduce((a, h) => a + (h.roomsLo ?? 0), 0)
    : totalAll < input.housekeepers.reduce((a, h) => a + h.lo, 0) - 0.5);
  for (const m of metrics) {
    const name = nameOf.get(m.hkId)!;
    const roomsOut = m.roomsLo !== undefined && m.roomsHi !== undefined && m.rooms > 0 && (m.rooms > m.roomsHi || m.rooms < m.roomsLo);
    if (roomsOut && !overstaffed) {
      warnings.push({ code: "ROOMS_OUT_OF_BAND", severity: "WARNING", hkId: m.hkId,
        message: `${name} hat ${m.rooms} Zimmer. Ziel sind ${m.roomsLo === m.roomsHi ? m.roomsLo : `${m.roomsLo} bis ${m.roomsHi}`}.` });
    }
    if (overstaffed && m.credits <= m.hi + CREDIT_WARN_SLACK) { /* siehe Gesamthinweis unten */ }
    else if (m.credits > m.hi + CREDIT_WARN_SLACK || (m.credits < m.lo - CREDIT_WARN_SLACK && m.rooms > 0)) {
      warnings.push({ code: "CREDITS_OUT_OF_BAND", severity: m.roomsLo !== undefined ? "INFO" : "WARNING", hkId: m.hkId,
        message: `${name} hat ${fmt(m.credits)} Credits. Ziel sind ${fmt(m.lo)} bis ${fmt(m.hi)}.` });
    } else if (m.rooms === 0 && m.lo > 0) {
      warnings.push({ code: "NO_ROOMS", severity: "INFO", hkId: m.hkId, message: `${name} hat noch keine Zimmer.` });
    }
    if (input.shiftMinutes && m.expectedMinutes !== undefined && m.expectedMinutes > input.shiftMinutes) {
      const f = (x: number) => `${Math.floor(x / 60)}:${String(Math.round(x % 60)).padStart(2, "0")}`;
      warnings.push({ code: "OVER_SHIFT", severity: "WARNING", hkId: m.hkId,
        message: `${name} wird voraussichtlich nicht vor Schichtende fertig (geschätzt ${f(m.expectedMinutes)} h, Schicht ${f(input.shiftMinutes)} h).` });
    }
    if (m.floors.length > input.maxFloors) {
      warnings.push({ code: "TOO_MANY_FLOORS", severity: "WARNING", hkId: m.hkId,
        message: `${name} arbeitet auf ${m.floors.length} Etagen (${m.floors.join(", ")}). Erlaubt sind ${input.maxFloors}.` });
    }
  }
  // Planung L1 (Regel 4): mehr Suiten als erlaubt — nur Warnung, nie Sperre
  if (input.maxSuites !== undefined) {
    input.housekeepers.forEach((h, k) => {
      const suites = byHk[k].filter((r) => isSuite(r, input.suiteMinCredit));
      if (suites.length > input.maxSuites!) {
        warnings.push({ code: "TOO_MANY_SUITES", severity: "WARNING", hkId: h.id, roomIds: suites.map((r) => r.id),
          message: `${h.name} hat ${suites.length} Suiten (${suites.map((r) => r.number).join(", ")}). Höchstens ${input.maxSuites} sind vorgesehen.` });
      }
    });
  }
  // F4 (M7): Warnungen je Art bündeln — eine Zeile mit Namen und Zimmernummern statt einer Zeile je Zimmer
  // Eine Zeile je Kraft und Art (mit hkId — der Tagesplan ordnet Hinweise der Kraft zu, src/lib/ui/tagesplan.ts planHints)
  const bundle = (code: string, pairs: { k: number; r: PlanRoom }[], head: string) => {
    const byPerson = new Map<number, PlanRoom[]>();
    for (const p of pairs) byPerson.set(p.k, [...(byPerson.get(p.k) ?? []), p.r]);
    for (const [k, rs] of byPerson) {
      warnings.push({ code, severity: "WARNING", hkId: input.housekeepers[k].id, roomIds: rs.map((r) => r.id),
        message: `${head}: ${input.housekeepers[k].name} ${rs.map((r) => r.number).join(", ")} — bitte prüfen.` });
    }
  };
  // Planung L1 (Regel 5): Einschränkung der Kraft verletzt (nur bei Handzuteilung möglich; „keine Suiten“ filtert der Vorschlag)
  const RESTRICTION_LABEL = { NO_SUITE: "keine Suiten", NO_VIP: "keine VIP-Zimmer", NO_ALLERGY: "keine Allergiker-Zimmer" } as const;
  for (const label of Object.keys(RESTRICTION_LABEL) as (keyof typeof RESTRICTION_LABEL)[]) {
    bundle("RESTRICTION", c.rooms.flatMap((r, i) => { const k = idx[i]; return k >= 0 && restrictionHit(input.housekeepers[k], r, input.suiteMinCredit) === label ? [{ k, r }] : []; }),
      `Gegen Einschränkung „${RESTRICTION_LABEL[label]}“`);
  }
  // Stufe 1 mit anspruchsvollen Zimmern — nur über eine feste Zuteilung (von Hand) möglich, der Vorschlag filtert hart (P6 neu)
  bundle("LEVEL1_DEMANDING", c.rooms.flatMap((r, i) => { const k = idx[i]; return k >= 0 && input.housekeepers[k].level < 2 && r.demanding.length ? [{ k, r }] : []; }),
    "Stufe 1 mit anspruchsvollen Zimmern");
  const demandingOpen = unassigned.filter((id) => roomById.get(id)!.demanding.length);
  const plainOpen = unassigned.filter((id) => !roomById.get(id)!.demanding.length);
  if (demandingOpen.length) {
    warnings.push({ code: "DEMANDING_UNASSIGNED", severity: "WARNING", roomIds: demandingOpen,
      message: `${demandingOpen.length} anspruchsvolle Zimmer ohne passende Kraft (${demandingOpen.map((id) => roomById.get(id)!.number).join(", ")}) — bitte von Hand zuteilen.` });
  }
  if (plainOpen.length) {
    warnings.push({ code: "UNASSIGNED", severity: "WARNING", roomIds: plainOpen,
      message: `${plainOpen.length} Zimmer sind noch offen (${plainOpen.map((id) => roomById.get(id)!.number).join(", ")}). Bitte im Grundriss zuteilen.` });
  }
  const totalCredits = totalAll;
  const perHk = input.fullTimeRooms ? `${fmt(input.fullTimeRooms)} Zimmern` : `${fmt(input.fullTimeTarget)} Credits`;
  const needed = input.fullTimeRooms ? Math.ceil(c.rooms.length / Math.max(1, input.fullTimeRooms)) : Math.ceil(totalCredits / Math.max(1, input.fullTimeTarget));
  const present = input.housekeepers.length;
  // F4 (M6): kein „mehr Kräfte als nötig“, solange jemand voraussichtlich nicht vor Schichtende fertig wird
  if (overstaffed && !warnings.some((w) => w.code === "OVER_SHIFT")) {
    warnings.push({ code: "TOO_MANY_STAFF", severity: "INFO",
      message: `Mehr Kräfte als nötig: benötigt werden ${needed} Housekeeper bei ${perHk} je Vollzeitkraft, anwesend sind ${present}. Wenn jemand nicht eingeplant werden soll, bitte „Nicht einplanen“ wählen — sonst sind alle Anwesenden gleichmäßig eingeplant.` });
  }
  if (present < needed) {
    warnings.push({ code: "TOO_FEW_STAFF", severity: "WARNING",
      message: `Personal reicht nicht: benötigt ${needed} Kräfte, ausgewählt ${present} (bei ${perHk} je Vollzeitkraft). Credit-Ziel und Etagenlimit werden überschritten. Bitte eine Kraft hinzufügen.` });
  }

  // F4 (M7): „Personal reicht nicht“ und „anspruchsvolle Zimmer ohne passende Kraft“ ganz oben
  const TOP = ["TOO_FEW_STAFF", "DEMANDING_UNASSIGNED"];
  warnings.sort((a, b) => (TOP.includes(a.code) ? TOP.indexOf(a.code) : 9) - (TOP.includes(b.code) ? TOP.indexOf(b.code) : 9));
  const { total, parts } = cost(c, idx);
  return {
    assignment, routes, metrics, reasons, warnings, unassigned,
    needed: { housekeepers: needed, targetCredits: input.fullTimeTarget, ...(input.fullTimeRooms ? { targetRooms: input.fullTimeRooms } : {}), present },
    cost: { total, parts }, timedOut,
  };
}
