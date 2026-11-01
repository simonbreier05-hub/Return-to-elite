/**
 * Gewichte der Kostenfunktion des Zuteilungsvorschlags (docs/autoplan.md).
 * Startwerte aus dem Interview vom 06.10.2026; änderbar unter Einstellungen
 * (Setting "autoplanWeight.<name>"). Reine Konstanten — client-sicher.
 */
export const AUTOPLAN_WEIGHTS = {
  extraFloor: 100, // je Etage über das Maximum (2) hinaus
  credits: 10, // quadratische Abweichung vom Tagesziel (außerhalb der Toleranz)
  categoryFairness: 5, // Ungleichheit bei Abreisen, Bleibern, Wäschewechseln
  demandingFairness: 8, // Ungleichheit bei anspruchsvollen Zimmern unter Stufe 2/3
  interconnectSplit: 20, // je getrenntes Interconnecting-Paar
  homeFloor: 1, // je Zimmer abseits der Stammetage / gestrigen Etage
  jump: 2, // je Flügel-/Nummernsprung
  rooms: 20, // H1: quadratische Abweichung vom Zimmer-Zielband (Hauptziel, vor den Credits)
  assignedFloor: 6, // H1: je Zimmer abseits der heute eingeteilten Etagen (Etagenzuweisung)
  overtime: 3, // H3: je 10 Minuten über Schichtende (geschätzt aus Messdaten)
  learned: 10, // H3: je Zimmer gegen ein gelerntes Muster (Person / Mindeststufe) — weich, harte Regeln gewinnen
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
