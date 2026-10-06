import { addDays } from "../dates";

/**
 * Beispieldaten für die Opera-Listen — ERFUNDENE Namen, Zahlen nur in sich stimmig.
 * `todayScenario` baut einen realistischen Morgen für "heute" und echte Zimmer des
 * Hotels; Tests nutzen ein festes Szenario (tests/fixtures/opera).
 * Die sensiblen Spalten (Kartennummer, Preis, Saldo, Conf-Nr.) sind absichtlich
 * enthalten: StayClean muss sie verwerfen.
 */
export interface SampleGuest {
  room: string;
  name: string; // "Nachname, Vorname Anrede"
  type: "STDK" | "DLXK" | "LFAMIL";
  adl: number; chl: number;
  arr: string; dep: string; nts: number; // MM-TT-JJ
  status: "CKIN" | "DUOT" | "RESV";
  time: string; // wie gedruckt, inkl. "*" und abgeschnittenem "AN"
  vip?: boolean;
  company?: string;
  conf: string; card: string; rate: string; balance: string; rateCode: string;
  traces?: { code: string; date: string; text: string }[];
  fixedCharge?: string;
  inventory?: string;
}

export interface SampleTraceRow {
  room: string; name: string; arrDate: string; depDate: string; dept: string; code: string; traceDate: string; text: string; resolved: boolean;
}

export interface Scenario {
  reportDate: string; // MM-TT-JJ (Druckdatum der US-Listen)
  reportTime: string;
  listDay: string; // Anreisetag der Arrivals-Liste
  arrivals: SampleGuest[];
  arrivalsPage1Count: number;
  departureGroups: { date: string; guests: SampleGuest[] }[];
  depFrom: string;
  depTo: string;
  forecast: { printDate: string; startIso: string; days: number; historyDays: number; inventory: number; fromLabel: string; toLabel: string };
  traces: SampleTraceRow[];
}

export const TEST_CARD = "4111111111111111"; // bekannte Test-Kartennummer

export const us = (iso: string) => { const [y, m, d] = iso.split("-"); return `${m}-${d}-${y.slice(2)}`; };
const dmy = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`; };

const NAMES = [
  "Testfrau, Anna Mrs.", "Demo, Jonas Mr.", "Beispiel, Bernd Mr.", "Probe, Gerda Mrs.", "Muster, Eva Mrs.",
  "Demo, Dieter Dr. Mr.", "Beispiel, Ida Mrs.", "Muster, Karin Mrs.", "Probe, Carla Mrs.", "Fiktiv, Franz Mr.",
  "Probe, Max Mr.", "Fiktiv, Leo Mr.", "Test, Hans Mr.", "Mustermann, Lena Ms.", "Erfunden, Paul Mr.",
  "Beispielfrau, Nora Mrs.", "Testmann, Felix Mr.", "Probst, Clara Ms.", "Demofrau, Sina Mrs.", "Fiktivo, Tom Mr.",
];

let seq = 1920000;
const guest = (p: Partial<SampleGuest> & Pick<SampleGuest, "room" | "name" | "arr" | "dep" | "nts" | "status" | "time">): SampleGuest => ({
  type: "STDK", adl: 1, chl: 0, conf: String(++seq), card: TEST_CARD, rate: "299.00", balance: "598.00", rateCode: "RACK", ...p,
});

/** Ein Morgen: 5 Abreisen (eine davon Same-Day-Turn), 6 Bleiber, 3 Frühanreisen (schon eingecheckt), 7 Anreisen (RESV). Braucht 20 Zimmer. */
export function todayScenario(todayIso: string, rooms: string[], inventory = 145): Scenario {
  if (rooms.length < 20) throw new Error("Für das Beispiel werden mindestens 20 Zimmer gebraucht.");
  const r = rooms.slice(0, 20);
  const at = (n: number) => us(addDays(todayIso, n));
  const today = at(0);
  const G: SampleGuest[] = [];
  const pick = (i: number) => NAMES[i % NAMES.length];

  // Abreisen heute (DUOT); r[4] ist der Turn-Raum
  const dueOuts = [0, 1, 2, 3, 4].map((i) => guest({
    room: r[i], name: pick(i), arr: at(-(1 + (i % 3))), dep: today, nts: 1 + (i % 3), status: "DUOT", time: "03:30 PM",
    ...(i === 1 ? { type: "DLXK" as const, adl: 2 } : {}),
    traces: i === 1 ? [{ code: "HK", date: today, text: "Twin back to king bed after departure" }] : undefined,
  }));
  // Bleiber
  const stay = [5, 6, 7, 8, 9, 10].map((i) => {
    const back = 1 + (i % 3), ahead = 1 + (i % 5);
    return guest({
      room: r[i], name: pick(i), arr: at(-back), dep: at(ahead), nts: back + ahead, status: "CKIN", time: "*02:15 PM",
      ...(i === 5 ? { traces: [{ code: "HK", date: today, text: "Twin beds please" }] } : {}),
      ...(i === 6 ? { type: "DLXK" as const, adl: 2, chl: 1, vip: true } : {}),
    });
  });
  // Frühanreisen (checked in nachts)
  const early = [11, 12, 13].map((i, k) => guest({
    room: r[i], name: pick(i), arr: today, dep: at(2 + k), nts: 2 + k, status: "CKIN", time: `0${1 + k}:${k}0 AM`,
    ...(i === 12 ? { traces: [{ code: "BQ", date: today, text: "Give extra chair & Notepad" }] } : {}),
  }));
  // Anreisen heute (noch nicht da): Turn-Raum + 6 freie Zimmer
  const arrRooms = [4, 14, 15, 16, 17, 18, 19];
  const later = arrRooms.map((i, k) => guest({
    room: r[i], name: pick(i + 7), arr: today, dep: at(1 + (k % 5)), nts: 1 + (k % 5), status: "RESV",
    time: `${12 + (k % 5)}:${k % 2 ? "30" : "00"} PM`,
    ...(k === 2 ? { type: "LFAMIL" as const, adl: 2, chl: 1, traces: [{ code: "HK", date: today, text: "Extra bed for child" }] } : {}),
    ...(k === 4 ? { traces: [{ code: "HK", date: today, text: "Zustellbett bitte" }] } : {}),
  }));

  const byRoom = (a: SampleGuest, b: SampleGuest) => a.room.localeCompare(b.room);
  const arrivals = [...early, ...later].sort(byRoom);
  const inHouse = [...dueOuts, ...stay, ...early];
  const iso = (u: string) => `20${u.slice(6, 8)}-${u.slice(0, 2)}-${u.slice(3, 5)}`; // MM-TT-JJ → ISO
  const dates = [...new Set(inHouse.map((g) => g.dep))].sort((a, b) => iso(a).localeCompare(iso(b)));
  const departureGroups = dates.map((d) => ({ date: d, guests: inHouse.filter((g) => g.dep === d).sort(byRoom) }));

  const traces: SampleTraceRow[] = [...dueOuts, ...stay, ...early, ...later].flatMap((g) => (g.traces ?? []).map((t) => ({
    room: g.room, name: g.name, arrDate: g.arr, depDate: g.dep, dept: t.code, code: t.code === "HK" ? (/twin/i.test(t.text) ? "TWIN" : "XBED") : t.code,
    traceDate: t.date, text: t.text, resolved: false,
  })));
  traces.push({ room: r[2], name: pick(2), arrDate: dueOuts[2].arr, depDate: today, dept: "FO", code: "LCO", traceDate: today, text: "Late check-out requested 2 PM", resolved: false });
  traces.push({ room: r[3], name: pick(3), arrDate: dueOuts[3].arr, depDate: today, dept: "HK", code: "XBED", traceDate: at(-1), text: "Baby cot already delivered", resolved: true });

  const histStart = addDays(todayIso, -7);
  const last = addDays(todayIso, 22);
  return {
    reportDate: today, reportTime: "04:09 AM", listDay: today,
    arrivals, arrivalsPage1Count: 6, departureGroups,
    depFrom: today, depTo: at(30),
    forecast: { printDate: dmy(todayIso), startIso: histStart, days: 30, historyDays: 7, inventory, fromLabel: dmy(histStart), toLabel: dmy(last) },
    traces,
  };
}
