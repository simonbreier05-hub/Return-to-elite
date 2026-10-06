/**
 * Morgen-Szenario für den Durchlauf: Nachbau der Opera-Demo-Listen
 * (Druckdatum 05-16-18) mit ERFUNDENEN Namen. Dazu absichtlich eingestreute
 * Spalten, die StayClean verwerfen muss (Kreditkarte, Preis, Saldo, Conf No.).
 */
export const REPORT_DATE = "05-16-18";
export const REPORT_TIME = "04:09 AM";
export const LIST_DAY = "05-15-18"; // Arrivals-Liste gilt für diesen Anreisetag (wie im Demo-Ausdruck)

export interface Guest {
  room: string;
  name: string; // Opera-Format "Nachname, Vorname Anrede"
  type: "STDK" | "DLXK" | "LFAMIL";
  adl: number; chl: number;
  arr: string; dep: string; nts: number;
  status: "CKIN" | "DUOT";
  time: string; // wie gedruckt, inkl. "*" und abgeschnittenem "AN"
  vip?: boolean;
  company?: string;
  // Verwerfen-Spalten (sensibel):
  conf: string; card: string; rate: string; balance: string; rateCode: string;
  traces?: { code: string; date: string; text: string }[];
  fixedCharge?: string;
  inventory?: string;
}

const CARD = "4111111111111111"; // bekannte Test-Kartennummer

export const GUESTS: Guest[] = [
  { room: "004", name: "Testfrau, Anna Mrs.", type: "STDK", adl: 1, chl: 0, arr: "05-15-18", dep: "05-17-18", nts: 2, status: "CKIN", time: "02:03 AM", company: "C- Oracle", conf: "1916877", card: CARD, rate: "50.00", balance: "371.00", rateCode: "RACK",
    traces: [{ code: "BQ", date: "05-15-18", text: "Give extra chair & Notepad" }], fixedCharge: "5010 Banquet Food 1 10.00 Daily 05-15-18 05-16-18" },
  { room: "101", name: "Demo, Jonas Mr.", type: "STDK", adl: 1, chl: 0, arr: "05-15-18", dep: "05-16-18", nts: 1, status: "DUOT", time: "*02:13 AM", conf: "1916933", card: CARD, rate: "150.00", balance: "157.20", rateCode: "SOD1",
    inventory: "TICKCHD Park Ticket" },
  { room: "203", name: "Beispiel, Bernd Mr.", type: "STDK", adl: 1, chl: 2, arr: "05-15-18", dep: "05-19-18", nts: 4, status: "CKIN", time: "04:30 AM", conf: "1921914", card: CARD, rate: "399.00", balance: "399.00", rateCode: "",
    traces: [{ code: "BQ", date: "05-15-18", text: "Collect White Board & Marker" }] },
  { room: "204", name: "Probe, Gerda Mrs.", type: "STDK", adl: 1, chl: 7, arr: "05-15-18", dep: "05-19-18", nts: 4, status: "CKIN", time: "04:30 AM", conf: "1921916", card: CARD, rate: "99.00", balance: "99.00", rateCode: "" },
  { room: "209", name: "Muster, Eva Mrs.", type: "STDK", adl: 1, chl: 0, arr: "05-15-18", dep: "05-19-18", nts: 4, status: "CKIN", time: "*04:30 AN", conf: "1921912", card: CARD, rate: "399.00", balance: "399.00", rateCode: "" },
  { room: "301", name: "Demo, Dieter Dr. Mr.", type: "DLXK", adl: 1, chl: 0, arr: "05-15-18", dep: "05-19-18", nts: 4, status: "CKIN", time: "*04:30 AM", vip: true, conf: "1921920", card: CARD, rate: "599.00", balance: "599.00", rateCode: "" },
  { room: "624", name: "Beispiel, Ida Mrs.", type: "DLXK", adl: 1, chl: 0, arr: "05-15-18", dep: "05-17-18", nts: 2, status: "CKIN", time: "*02:04 AM", company: "C- Oracle", conf: "1916879", card: CARD, rate: "399.00", balance: "713.00", rateCode: "RACK",
    fixedCharge: "5010 Banquet Food 1 10.00 Daily 05-15-18 05-16-18" },
  { room: "625", name: "Muster, Karin Mrs.", type: "DLXK", adl: 1, chl: 0, arr: "05-15-18", dep: "05-16-18", nts: 1, status: "DUOT", time: "*11:31 PM", company: "C- Oracle", conf: "1916904", card: CARD, rate: "399.00", balance: "399.00", rateCode: "" },
  { room: "626", name: "Probe, Carla Mrs.", type: "DLXK", adl: 4, chl: 0, arr: "05-15-18", dep: "05-19-18", nts: 4, status: "CKIN", time: "04:30 AM", conf: "1921918", card: CARD, rate: "619.00", balance: "666.00", rateCode: "",
    traces: [{ code: "BQ", date: "05-15-18", text: "Collect First Aid kit" }], inventory: "TICKCHD Park Ticket" },
  // Seite 2 der Arrivals (steht auch in den Departures):
  { room: "805", name: "Fiktiv, Franz Mr.", type: "LFAMIL", adl: 2, chl: 1, arr: "05-15-18", dep: "05-19-18", nts: 4, status: "CKIN", time: "03:10 AM", conf: "1921930", card: CARD, rate: "418.50", balance: "418.50", rateCode: "",
    traces: [{ code: "HK", date: "05-15-18", text: "Extra bed for child" }] },
  { room: "901", name: "Probe, Max Mr.", type: "LFAMIL", adl: 1, chl: 0, arr: "05-15-18", dep: "05-16-18", nts: 1, status: "DUOT", time: "01:00 AM", conf: "1921931", card: CARD, rate: "299.00", balance: "299.00", rateCode: "" },
  { room: "902", name: "Fiktiv, Leo Mr.", type: "LFAMIL", adl: 1, chl: 0, arr: "05-15-18", dep: "05-16-18", nts: 1, status: "DUOT", time: "01:05 AM", conf: "1921932", card: CARD, rate: "41.60", balance: "41.60", rateCode: "" },
  { room: "903", name: "Test, Hans Mr.", type: "LFAMIL", adl: 1, chl: 0, arr: "05-15-18", dep: "05-17-18", nts: 2, status: "CKIN", time: "01:10 AM", conf: "1921933", card: CARD, rate: "41.60", balance: "41.60", rateCode: "",
    traces: [{ code: "HK", date: "05-15-18", text: "Zustellbett bitte" }] },
];

/** Seite 1 der Arrivals enthält die ersten 9 Zimmer, Seite 2 den Rest. */
export const ARRIVALS_PAGE1_ROOMS = ["004", "101", "203", "204", "209", "301", "624", "625", "626"];
/** Zimmerstamm, den der Durchlauf als "bekannt" annimmt (Demo-Zimmer gibt es im echten Hotel nicht). */
export const DEMO_ROOMS = GUESTS.map((g) => g.room);

/** Abreisegruppen wie im Demo-Ausdruck (Zeitraum 05-15 bis 05-19). */
export const DEPARTURE_GROUPS = [
  { date: "05-16-18", rooms: ["101", "625", "901", "902"] },
  { date: "05-17-18", rooms: ["004", "624", "903"] },
  { date: "05-19-18", rooms: ["203", "204", "209", "301", "626", "805"] },
];
export const DEPARTURES_FROM = "05-15-18";
export const DEPARTURES_TO = "05-19-18";

// Forecast (Hotel de Rome): 15.09.–14.10.26, gedruckt 22/09/26 07:06. Zahlen erfunden, aber in sich stimmig.
export const FORECAST_PRINT_DATE = "22/09/26";
export const FORECAST_INVENTORY = 145;
export const FORECAST_START = "2026-09-15";
export const FORECAST_DAYS = 30;
export const FORECAST_HISTORY_DAYS = 7;
