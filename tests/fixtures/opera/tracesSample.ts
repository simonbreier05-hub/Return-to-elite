/**
 * Nachbau einer Opera-"Traces"-Liste mit ERFUNDENEN Namen. Passt zu den
 * Demo-Zimmern der Opera-Beispiellisten (Arrivals/Departures, 05-16-18).
 * Einzige Quelle für das Nachbau-PDF und die CSV (scripts/generate-opera-fixtures.ts)
 * und für die Klassifizierungs-Tests.
 */
export interface SampleTrace {
  room: string;
  name: string; // erfunden, "Nachname, Vorname"
  arrDate: string; // MM-TT-JJ (US, wie die Demo-Listen)
  depDate: string;
  dept: string; // Abteilung laut Opera
  code: string; // Trace-Code
  traceDate: string;
  text: string;
  resolved: boolean;
  /** Erwartung für den Test: was die Klassifizierung daraus macht. */
  expect: { type: "TWIN_SETUP" | "TWIN_REVERT" | "SONSTIGES"; note?: string } | null;
}

export const SAMPLE_REPORT_DATE = "05-16-18";

export const TRACES_SAMPLE: SampleTrace[] = [
  { room: "004", name: "Testfrau, Anna", arrDate: "05-15-18", depDate: "05-17-18", dept: "BQ", code: "BQ", traceDate: "05-15-18", text: "Give extra chair & Notepad", resolved: false, expect: null },
  { room: "203", name: "Beispiel, Bernd", arrDate: "05-15-18", depDate: "05-19-18", dept: "BQ", code: "BQ", traceDate: "05-15-18", text: "Collect White Board & Marker", resolved: false, expect: null },
  { room: "626", name: "Probe, Carla", arrDate: "05-15-18", depDate: "05-19-18", dept: "BQ", code: "BQ", traceDate: "05-15-18", text: "Collect First Aid kit", resolved: false, expect: null },
  { room: "301", name: "Demo, Dieter", arrDate: "05-15-18", depDate: "05-19-18", dept: "HK", code: "TWIN", traceDate: "05-16-18", text: "Twin beds please (2 single beds)", resolved: false, expect: { type: "TWIN_SETUP" } },
  { room: "209", name: "Muster, Eva", arrDate: "05-15-18", depDate: "05-19-18", dept: "HK", code: "TWIN", traceDate: "05-15-18", text: "Bitte Zimmer mit getrennten Betten vorbereiten", resolved: false, expect: { type: "TWIN_SETUP" } },
  { room: "805", name: "Fiktiv, Franz", arrDate: "05-15-18", depDate: "05-19-18", dept: "HK", code: "XBED", traceDate: "05-15-18", text: "Extra bed for child", resolved: false, expect: { type: "SONSTIGES", note: "Extra bed" } },
  { room: "204", name: "Probe, Gerda", arrDate: "05-15-18", depDate: "05-19-18", dept: "HK", code: "XBED", traceDate: "05-15-18", text: "2 extra beds needed", resolved: false, expect: { type: "SONSTIGES", note: "Extra bed" } },
  { room: "903", name: "Test, Hans", arrDate: "05-15-18", depDate: "05-17-18", dept: "HK", code: "XBED", traceDate: "05-15-18", text: "Zustellbett bitte", resolved: false, expect: { type: "SONSTIGES", note: "Extra bed" } },
  { room: "624", name: "Beispiel, Ida", arrDate: "05-15-18", depDate: "05-17-18", dept: "HK", code: "TWIN", traceDate: "05-17-18", text: "Twin back to king bed after departure", resolved: false, expect: { type: "TWIN_REVERT" } },
  { room: "101", name: "Demo, Jonas", arrDate: "05-15-18", depDate: "05-16-18", dept: "FO", code: "LCO", traceDate: "05-16-18", text: "Late check-out requested 2 PM", resolved: false, expect: null },
  { room: "625", name: "Muster, Karin", arrDate: "05-15-18", depDate: "05-16-18", dept: "ENG", code: "MISC", traceDate: "05-16-18", text: "TV remote not working", resolved: false, expect: null },
  { room: "902", name: "Fiktiv, Leo", arrDate: "05-15-18", depDate: "05-16-18", dept: "HK", code: "XBED", traceDate: "05-14-18", text: "Baby cot already delivered", resolved: true, expect: null },
];
