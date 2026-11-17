/**
 * S1 (Entscheidung 16.11.2026): Der Gastbildschirm begrüßt mit „Anrede Titel Nachname“ — immer nur den Gast des
 * gerade aktiven Aufenthalts (src/lib/guestStay.ts). Die Anrede wird beim Import neutral gespeichert (MR | MRS | MS)
 * und erst beim Anzeigen übersetzt: Deutsch, wenn der Gastbildschirm Deutsch zeigt, sonst Englisch.
 * Rein (kein prisma) — Server und Client nutzen dieselbe Funktion.
 */

export const SALUTATION_KEYS = ["MR", "MRS", "MS"] as const;
export type SalutationKey = (typeof SALUTATION_KEYS)[number];

const SALUTATION_ALIASES: Record<string, SalutationKey> = {
  herr: "MR", hr: "MR", mr: "MR", mister: "MR", monsieur: "MR", sig: "MR", signor: "MR", senor: "MR", "señor": "MR",
  frau: "MRS", fr: "MRS", mrs: "MRS", madame: "MRS", mme: "MRS", sra: "MRS", signora: "MRS", "señora": "MRS",
  ms: "MS", miss: "MS", mlle: "MS",
};

/** „Herr“, „Mr.“, „Frau“, „Mrs“, „Ms.“ … → MR | MRS | MS; Unbekanntes → null. */
export function salutationKey(raw: string | null | undefined): SalutationKey | null {
  if (!raw) return null;
  const k = raw.trim().toLowerCase().replace(/\.$/, "");
  if ((SALUTATION_KEYS as readonly string[]).includes(k.toUpperCase())) return k.toUpperCase() as SalutationKey;
  return SALUTATION_ALIASES[k] ?? null;
}

export interface GuestGreeting {
  salutation: SalutationKey | null;
  title: string | null;
  lastName: string;
}

/** Begrüßungsdaten eines Aufenthalts; ohne Nachnamen keine persönliche Begrüßung (nur „Willkommen“). */
export function greetingFromStay(stay: {
  guestSalutation?: string | null;
  guestTitle?: string | null;
  guestLastName?: string | null;
}): GuestGreeting | null {
  const lastName = stay.guestLastName?.trim();
  if (!lastName) return null;
  return { salutation: salutationKey(stay.guestSalutation), title: stay.guestTitle?.trim() || null, lastName };
}

const LABELS: Record<"de" | "en", Record<SalutationKey, string>> = {
  de: { MR: "Herr", MRS: "Frau", MS: "Frau" },
  en: { MR: "Mr", MRS: "Mrs", MS: "Ms" },
};

/** „Herr Dr. Müller“ (Deutsch) bzw. „Mr Dr. Miller“ (jede andere Sprache). */
export function formatGreeting(g: GuestGreeting, locale: string): string {
  const lang = locale === "de" ? "de" : "en";
  return [g.salutation ? LABELS[lang][g.salutation] : null, g.title, g.lastName].filter(Boolean).join(" ");
}
