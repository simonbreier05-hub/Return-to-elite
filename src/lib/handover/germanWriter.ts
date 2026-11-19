import type { HandoverFacts } from "./collectFacts";

/**
 * Nachtrag (M9/F5 „Übergabe zurückgestellt“): deutsche Fassung des deterministischen Übergabe-Schreibers — dieselben Fakten,
 * dieselbe Reihenfolge wie die englische (`generate.ts` localWriter, `collectFacts.ts` factsToBullets), nur andere Sätze.
 * Kein Sprachmodell; jede Zahl kommt aus den Fakten.
 */

const STATUS_DE: Record<string, string> = {
  DIRTY: "unrein", IN_PROGRESS: "in Arbeit", CLEAN: "rein, zu prüfen", INSPECTED: "freigegeben", PICKUP: "Nacharbeit",
  BLOCKED: "blockiert", DEFECT_REPORTED: "Mangel gemeldet", OUT_OF_ORDER: "außer Betrieb", OUT_OF_SERVICE: "nicht im Service",
  GREEN_OPT_OUT: "Green Option", OPEN: "offen", ACKNOWLEDGED: "angenommen", RESOLVED: "erledigt",
};
const BLOCK_DE: Record<string, string> = { DND: "Bitte nicht stören", GUEST_IN_ROOM: "Gast im Zimmer", DOUBLE_LOCKED: "doppelt verriegelt", REFUSED: "Reinigung abgelehnt" };
const CATEGORY_DE: Record<string, string> = {
  PLUMBING: "Sanitär", ELECTRICAL: "Elektrik", HVAC: "Klima/Heizung", FURNITURE: "Möbel", IT_TV: "IT/TV", MINIBAR: "Minibar", OTHER: "Sonstiges",
};
const ROLE_DE: Record<string, string> = {
  room_attendant: "Zimmermädchen", supervisor: "Supervisor", duty_manager: "Duty Manager", front_office: "Front Office",
  concierge: "Concierge", engineering: "Technik", houseman: "Hausmann",
};
const de = (map: Record<string, string>, v: string | null | undefined) => (v ? map[v] ?? v.toLowerCase().replace(/_/g, " ") : "");
const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const time = (d: Date) => d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

export function headlineDe(f: HandoverFacts): string {
  const p = f.progress.percentReleased;
  const open = f.progress.stillDirty + f.progress.inProgress;
  if (f.arrivals.atRisk.length > 0) return `${n(f.arrivals.atRisk.length, "Anreise", "Anreisen")} gefährdet, ${p} % des Hauses freigegeben`;
  if (f.attention.deferred.length > 0) return `${n(f.attention.deferred.length, "Zimmer", "Zimmer")} aus dem heutigen Plan verschoben, ${p} % freigegeben`;
  if (f.progress.waitingForInspection >= 5) return `${f.progress.waitingForInspection} Zimmer warten auf Prüfung, ${p} % freigegeben`;
  if (open === 0) return `Haus fertig — ${p} % freigegeben, nichts offen`;
  return `${p} % freigegeben, ${open} Zimmer noch offen`;
}

export function bulletsDe(f: HandoverFacts): string[] {
  const lines: string[] = [];
  const p = f.progress;
  lines.push(`${p.released} von ${p.sellable} verkaufbaren Zimmern freigegeben (${p.percentReleased} %). ${p.waitingForInspection} warten auf Prüfung, ${p.inProgress} in Arbeit, ${p.stillDirty} nicht begonnen.`);
  if (f.attention.blocked.length) lines.push(`Blockiert: ${f.attention.blocked.map((r) => `${r.number} (${de(BLOCK_DE, r.blockReason) || "blockiert"}, ${r.minutesInStatus} Min)`).join(", ")}.`);
  if (f.attention.rework.length) lines.push(`Zur Nacharbeit zurück: ${f.attention.rework.map((r) => r.number).join(", ")}.`);
  if (f.attention.outOfOrder.length) lines.push(`Außer Betrieb: ${f.attention.outOfOrder.map((r) => r.number).join(", ")}.`);
  if (f.attention.longestWaitingForInspection.length) {
    const w = f.attention.longestWaitingForInspection[0];
    lines.push(`Längste Wartezeit auf Prüfung: ${w.number}, ${w.minutesInStatus} Min.`);
  }
  if (f.attention.deferred.length) lines.push(`Aus Kapazitätsgründen auf den nächsten Tag verschoben (noch ${f.attention.deferred.length} offen): ${f.attention.deferred.map((r) => r.number).join(", ")}.`);
  lines.push(`${f.arrivals.expected} Anreisen erwartet, ${f.arrivals.readyNow} ihrer Zimmer bereits freigegeben.`);
  if (f.arrivals.atRisk.length) lines.push(`Gefährdete Anreisen: ${f.arrivals.atRisk.map((a) => `${a.room} für ${a.guest}${a.eta ? ` um ${a.eta}` : ""} (Zimmer ${de(STATUS_DE, a.status)})`).join(", ")}.`);
  if (f.arrivals.vipPending.length) lines.push(`VIP-Zimmer noch nicht freigegeben: ${f.arrivals.vipPending.map((v) => `${v.room} (${v.guest})`).join(", ")}.`);
  if (f.engineering.openWorkOrders > 0) lines.push(`${f.engineering.openWorkOrders} offene Technikaufträge, ${f.engineering.unacknowledged} noch nicht angenommen: ${f.engineering.open.map((w) => `${w.room} ${de(CATEGORY_DE, w.category)} (${de(STATUS_DE, w.status)})`).join(", ")}.`);
  if (f.engineering.resolvedInWindow > 0) lines.push(`${f.engineering.resolvedInWindow} Technikaufträge in der Schicht erledigt.`);
  if (f.activity.byAttendant.length) lines.push(`Bearbeitete Zimmer: ${f.activity.byAttendant.map((a) => `${a.name} ${a.rooms}`).join(", ")}.`);
  if (f.activity.deniedAttempts > 0) lines.push(`${f.activity.deniedAttempts} Statusänderungen hat das System in der Schicht abgelehnt — ein Blick ins Logbuch lohnt sich.`);
  for (const nt of f.notes.slice(0, 5)) lines.push(`Notiz zu ${nt.room} von ${nt.author} (${de(ROLE_DE, nt.role)}): ${nt.body}`);
  return lines;
}

export function bodyDe(f: HandoverFacts): string {
  const p = f.progress;
  const paragraphs: string[] = [];
  paragraphs.push(
    `Übergabe um ${time(f.generatedAt)} für die letzten ${f.windowHours} Stunden. ${p.released} von ${p.sellable} verkaufbaren Zimmern sind freigegeben (${p.percentReleased} %). ` +
      (p.waitingForInspection > 0 ? `${p.waitingForInspection} sind rein und warten auf Prüfung` : `Nichts wartet auf Prüfung`) +
      `, ${p.inProgress} sind in Arbeit und ${p.stillDirty} noch nicht begonnen.`,
  );
  const needs: string[] = [];
  if (f.attention.blocked.length) needs.push(`${n(f.attention.blocked.length, "blockiertes Zimmer", "blockierte Zimmer")} (${f.attention.blocked.map((r) => `${r.number}, ${de(BLOCK_DE, r.blockReason) || "blockiert"} seit ${r.minutesInStatus} Min`).join("; ")})`);
  if (f.attention.rework.length) needs.push(`${f.attention.rework.length} zur Nacharbeit zurück (${f.attention.rework.map((r) => r.number).join(", ")})`);
  if (f.attention.outOfOrder.length) needs.push(`${f.attention.outOfOrder.length} außer Betrieb (${f.attention.outOfOrder.map((r) => r.number).join(", ")})`);
  paragraphs.push(needs.length ? `Braucht eine Entscheidung: ${needs.join(", ")}.` : `Nichts ist blockiert oder in Nacharbeit — dort ist alles sauber.`);
  if (f.attention.deferred.length) paragraphs.push(`Aus dem heutigen Plan verschoben (Kapazität, nicht vergessen): ${f.attention.deferred.map((r) => `${r.number} (${de(STATUS_DE, r.status)}, verschoben vor ${r.deferredMinutesAgo} Min)`).join(", ")}. Diese Zimmer brauchen einen Platz im morgigen Plan.`);
  if (f.arrivals.expected > 0) {
    let text = `${f.arrivals.expected} Anreisen werden erwartet, ${f.arrivals.readyNow} ihrer Zimmer sind bereits freigegeben.`;
    if (f.arrivals.atRisk.length) text += ` Im Blick behalten: ${f.arrivals.atRisk.map((a) => `${a.room} für ${a.guest}${a.eta ? ` (Ankunft ${a.eta})` : ""} — noch ${de(STATUS_DE, a.status)}`).join(", ")}.`;
    if (f.arrivals.vipPending.length) text += ` VIP-Zimmer noch nicht freigegeben: ${f.arrivals.vipPending.map((v) => `${v.room} (${v.guest})`).join(", ")}.`;
    paragraphs.push(text);
  }
  if (f.engineering.openWorkOrders > 0) {
    paragraphs.push(`Die Technik hat ${n(f.engineering.openWorkOrders, "offenen Auftrag", "offene Aufträge")}${f.engineering.unacknowledged > 0 ? `, ${f.engineering.unacknowledged} davon noch nicht angenommen` : ""}: ${f.engineering.open.map((w) => `${w.room} ${de(CATEGORY_DE, w.category)} (${de(STATUS_DE, w.status)})`).join(", ")}.`);
  }
  if (f.activity.byAttendant.length) {
    paragraphs.push(`In der Schicht wurden ${f.activity.roomsReleasedInWindow} Zimmer bei ${f.activity.statusChanges} Statusänderungen freigegeben. Bearbeitete Zimmer: ${f.activity.byAttendant.map((a) => `${a.name} ${a.rooms}`).join(", ")}.` +
      (f.activity.deniedAttempts > 0 ? ` ${f.activity.deniedAttempts} Änderungen hat das System abgelehnt — ein Blick ins Logbuch lohnt sich.` : ""));
  }
  if (f.notes.length) paragraphs.push(`Notizen aus der Schicht: ${f.notes.slice(0, 4).map((nt) => `${nt.room} — ${nt.body} (${nt.author})`).join("; ")}.`);
  return paragraphs.join("\n\n");
}
