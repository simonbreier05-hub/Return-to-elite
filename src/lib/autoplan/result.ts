import { compile, cost, type Compiled } from "./cost";
import { orderRoute } from "./route";
import type { Assignment, HkMetrics, PlanInput, PlanResult, PlanRoom, PlanWarning } from "./types";

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
      lo: h.lo, hi: h.hi,
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
    if (r.kind === "TURN") list.push("Same-Day-Turn: zuerst in der Route");
    if (r.demanding.length) list.push(`${r.demanding.map((d) => DEMANDING_LABEL[d]).join(", ")}: Stufe ${h.level}`);
    if (h.homeFloors.includes(r.floor)) list.push(`Stammetage ${r.floor}`);
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
  const overstaffed = input.housekeepers.length > 0 && totalAll < input.housekeepers.reduce((a, h) => a + h.lo, 0) - 0.5;
  for (const m of metrics) {
    const name = nameOf.get(m.hkId)!;
    if (overstaffed && m.credits <= m.hi + CREDIT_WARN_SLACK) { /* siehe Gesamthinweis unten */ }
    else if (m.credits > m.hi + CREDIT_WARN_SLACK || (m.credits < m.lo - CREDIT_WARN_SLACK && m.rooms > 0)) {
      warnings.push({ code: "CREDITS_OUT_OF_BAND", severity: "WARNING", hkId: m.hkId,
        message: `${name} hat ${fmt(m.credits)} Credits. Ziel sind ${fmt(m.lo)} bis ${fmt(m.hi)}.` });
    } else if (m.rooms === 0 && m.lo > 0) {
      warnings.push({ code: "NO_ROOMS", severity: "INFO", hkId: m.hkId, message: `${name} hat noch keine Zimmer.` });
    }
    if (m.floors.length > input.maxFloors) {
      warnings.push({ code: "TOO_MANY_FLOORS", severity: "WARNING", hkId: m.hkId,
        message: `${name} arbeitet auf ${m.floors.length} Etagen (${m.floors.join(", ")}). Erlaubt sind ${input.maxFloors}.` });
    }
  }
  c.rooms.forEach((r, i) => {
    const k = idx[i];
    if (k >= 0 && input.housekeepers[k].level < 2 && r.demanding.length) {
      warnings.push({ code: "LEVEL1_DEMANDING", severity: "WARNING", roomIds: [r.id], hkId: input.housekeepers[k].id,
        message: `${input.housekeepers[k].name} (Stufe 1) hat das anspruchsvolle Zimmer ${r.number}. Bitte prüfen.` });
    }
  });
  if (unassigned.length) {
    const rs = unassigned.map((id) => roomById.get(id)!);
    const noSenior = !input.housekeepers.some((h) => h.level >= 2);
    warnings.push({ code: "UNASSIGNED", severity: "WARNING", roomIds: unassigned,
      message: rs.some((r) => r.demanding.length) && noSenior
        ? `Zimmer ${rs.map((r) => r.number).join(", ")} bleiben offen: keine Kraft der Stufe 2 oder 3 anwesend. Bitte selbst entscheiden.`
        : `Zimmer ${rs.map((r) => r.number).join(", ")} bleiben offen. Bitte selbst zuteilen.` });
  }
  const totalCredits = totalAll;
  const needed = Math.ceil(totalCredits / Math.max(1, input.fullTimeTarget));
  const present = input.housekeepers.length;
  if (overstaffed) {
    warnings.push({ code: "TOO_MANY_STAFF", severity: "INFO",
      message: `Mehr Kräfte als nötig: benötigt werden ${needed} Housekeeper bei ${fmt(input.fullTimeTarget)} Credits, anwesend sind ${present}. Nicht benötigte Kräfte bitte abwählen.` });
  }
  if (present < needed) {
    warnings.push({ code: "TOO_FEW_STAFF", severity: "WARNING",
      message: `Zu wenige Kräfte: benötigt werden ${needed} Housekeeper bei ${fmt(input.fullTimeTarget)} Credits, anwesend sind ${present}.` });
  }

  const { total, parts } = cost(c, idx);
  return {
    assignment, routes, metrics, reasons, warnings, unassigned,
    needed: { housekeepers: needed, targetCredits: input.fullTimeTarget, present },
    cost: { total, parts }, timedOut,
  };
}
