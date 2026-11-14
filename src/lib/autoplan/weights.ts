/**
 * Gewichte der Kostenfunktion des Zuteilungsvorschlags (docs/autoplan.md).
 * Startwerte aus dem Interview vom 06.10.2026; änderbar unter Einstellungen
 * (Setting "autoplanWeight.<name>"). Reine Konstanten — client-sicher.
 */
export const AUTOPLAN_WEIGHTS = {
  extraFloor: 100, // je Etage über das Maximum (2) hinaus
  credits: 3, // quadratische Abweichung vom Tagesziel (außerhalb der Toleranz) — Plan-1b: nur Gegenprobe (Zimmerkategorie), Zimmerzahl führt
  categoryFairness: 5, // Ungleichheit der Arten je Kraft: Turn, Deep clean, Tidy, Linen change (Plan-1b: vier Arten)
  demandingFairness: 8, // Ungleichheit bei anspruchsvollen Zimmern unter Stufe 2/3
  interconnectSplit: 20, // je getrenntes Interconnecting-Paar
  homeFloor: 1, // je Zimmer abseits der Stammetage / gestrigen Etage
  jump: 2, // je Flügel-/Nummernsprung
  rooms: 20, // H1: quadratische Abweichung vom Zimmer-Zielband (Hauptziel, vor den Credits)
  assignedFloor: 6, // H1: je Zimmer abseits der heute eingeteilten Etagen (Etagenzuweisung)
  overtime: 3, // H3: je 10 Minuten über Schichtende (geschätzt aus Messdaten)
  learned: 10, // H3: je Zimmer gegen ein gelerntes Muster (Person / Mindeststufe) — weich, harte Regeln gewinnen
  traineeSuite: 40, // Plan-1b: je Junior Suite/Suite bei einem Azubi (Azubis vor allem Standard/Deluxe) — weich, nie eine Sperre
  suiteCap: 60, // Planung L1: je Suite über das Maximum je Kraft (Setting maxSuitesPerHk) — weich, Warnung
  restriction: 80, // Planung L1: je Zimmer gegen eine Einschränkung der Kraft (z. B. keine Suiten) — weich, Warnung
  stayContinuity: 8, // Planung L1: je Bleiber, der nicht bei der Kraft vom selben Aufenthalt landet — weich, überschreibbar
} as const;

export type AutoplanWeights = { -readonly [K in keyof typeof AUTOPLAN_WEIGHTS]: number };

/** Zimmer ohne möglichen Housekeeper (z. B. nur Stufe 1 anwesend): bleibt offen, kostet fix. */
export const UNASSIGNED_PENALTY = 500;
/** Anspruchsvolles Zimmer bei einer Kraft der Stufe 1: nur eine Strafe (Warnung im Plan), nie eine Sperre. */
export const LEVEL1_DEMANDING_PENALTY = 300;
/** Zusatzterm: Zug zur Mitte des Tagesziels (nur innerhalb der Toleranz, damit nicht alle am Rand landen). */
export const CENTER_PULL = 0.2;
/** Abstand zweier Zimmernummern ab dem ein Sprung gezählt wird (gleiche Etage, anderer Flügel zählt immer). */
export const NUMBER_JUMP_GAP = 4;
/** Maximale Durchläufe der lokalen Suche (deterministisch) und Sicherheits-Zeitlimit. */
export const MAX_PASSES = 40;
export const TIME_LIMIT_MS = 2000;
/** Störungs-Runden der iterierten lokalen Suche (feste Zahl → deterministisch). */
export const PERTURB_ROUNDS = 10;
