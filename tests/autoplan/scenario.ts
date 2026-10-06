import { AUTOPLAN_WEIGHTS } from "@/lib/autoplan/weights";
import type { DemandingReason, HkType, PlanHousekeeper, PlanInput, PlanRoom, WorkKind } from "@/lib/autoplan/types";

/** Synthetisches Haus: 5 Etagen à 29 Zimmer (101–129 …), deterministisch. */
export function makeHouse() {
  const out: { id: string; number: string; floor: number; section: string; type: "STANDARD" | "JUNIOR_SUITE" | "SUITE" }[] = [];
  for (let f = 1; f <= 5; f++) {
    for (let n = 1; n <= 29; n++) {
      const number = `${f}${String(n).padStart(2, "0")}`;
      out.push({ id: `r${number}`, number, floor: f, section: `${f}${n <= 14 ? "A" : "B"}`, type: n % 11 === 0 ? "SUITE" : n % 7 === 0 ? "JUNIOR_SUITE" : "STANDARD" });
    }
  }
  return out;
}

/** Ein Tag mit `occupied` zu bearbeitenden Zimmern: ~30 % Abreisen (jede 6. ein Turn), Rest Bleiber, jeder 3. Bleiber mit Wäschewechsel. */
export function makeDay(occupied = 94, opts: { vipEvery?: number } = {}): PlanRoom[] {
  const house = makeHouse();
  const rooms: PlanRoom[] = [];
  let k = 0;
  for (const h of house) {
    // gleichmäßig über das Haus verteilt: jedes (145/occupied)-te Zimmer
    if (Math.floor(((rooms.length + 1) * house.length) / occupied) < house.indexOf(h) + 0) continue;
    if (rooms.length >= occupied) break;
    if ((house.indexOf(h) * occupied) % house.length >= occupied) continue;
    k++;
    const kind: WorkKind = k % 3 === 0 ? (k % 18 === 0 ? "TURN" : "DEPARTURE") : "STAYOVER";
    const laundry = kind === "STAYOVER" && k % 4 === 0;
    const typeCredit = h.type === "STANDARD" ? 1 : 1.5;
    const credits = kind === "STAYOVER" ? Math.round(typeCredit * 0.7 * 100) / 100 : typeCredit;
    const demanding: DemandingReason[] = [];
    const vip = k % (opts.vipEvery ?? 17) === 0;
    if (vip) demanding.push("VIP");
    if (h.type !== "STANDARD") demanding.push("SUITE");
    if (["118", "119", "218"].includes(h.number)) demanding.push("ALLERGY");
    rooms.push({
      id: h.id, number: h.number, floor: h.floor, section: h.section, kind, laundry, vip, eta: kind === "TURN" ? `${13 + (k % 4)}:00` : null,
      credits, demanding, traces: 0, interconnect: [], state: "TODO", fixedTo: null,
    });
  }
  // Interconnecting-Paare (nur, wenn beide Zimmer im Plan stehen)
  const byNum = new Map(rooms.map((r) => [r.number, r]));
  for (const [a, b] of [["104", "105"], ["109", "110"], ["204", "205"], ["209", "210"], ["304", "307"], ["318", "319"], ["418", "419"]]) {
    const ra = byNum.get(a), rb = byNum.get(b);
    if (ra && rb) { ra.interconnect.push(rb.id); rb.interconnect.push(ra.id); }
  }
  return rooms;
}

export function hk(id: string, type: HkType, level: 1 | 2 | 3, extra: Partial<PlanHousekeeper> = {}): PlanHousekeeper {
  const [lo, hi] = type === "VOLLZEIT" ? [12.5, 15.5] : [6, 8];
  return { id, name: id.toUpperCase(), type, level, homeFloors: [], yesterdayFloors: [], lo, hi, ...extra };
}

export function makeInput(rooms: PlanRoom[], housekeepers: PlanHousekeeper[]): PlanInput {
  return { rooms, housekeepers, weights: { ...AUTOPLAN_WEIGHTS }, maxFloors: 2, fullTimeTarget: 14 };
}

/** 6 Vollzeit (Stufen 3,3,2,2,2,1) + 1 Azubi (Stufe 1). */
export const TEAM = () => [
  hk("a", "VOLLZEIT", 3), hk("b", "VOLLZEIT", 3), hk("c", "VOLLZEIT", 2), hk("d", "VOLLZEIT", 2), hk("e", "VOLLZEIT", 2), hk("f", "VOLLZEIT", 1),
  hk("g", "AZUBI", 1),
];
