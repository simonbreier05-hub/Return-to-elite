import { DEFAULT_MAPPING, type ImportMappingConfig } from "./mapping";
import type { GuestName } from "./types";

/**
 * Zerlegt einen Opera-Namen in Anrede, Titel, Nachname. Unterstützt
 * "Nachname, Vorname [Anrede]" und "[Anrede] [Titel] Vorname Nachname".
 * Unbekanntes Muster → Nachname = Fallback (siehe `salutation === null`).
 */
export function parseGuestName(raw: string, cfg: ImportMappingConfig = DEFAULT_MAPPING): GuestName {
  const clean = raw.replace(/\s+/g, " ").trim();
  const sal = new Set(cfg.salutations.map((s) => s.toLowerCase()));
  const tit = new Set(cfg.titles.map((s) => s.toLowerCase()));
  let salutation: string | null = null;
  let title: string | null = null;

  const strip = (tokens: string[]) =>
    tokens.filter((t) => {
      const k = t.toLowerCase();
      if (sal.has(k)) { salutation ??= t; return false; }
      if (tit.has(k)) { title ??= t; return false; }
      return true;
    });

  let lastName: string;
  if (clean.includes(",")) {
    const [before, ...rest] = clean.split(",");
    const last = strip(before.trim().split(" "));
    strip(rest.join(",").trim().split(" "));
    lastName = last.join(" ");
  } else {
    const parts = strip(clean.split(" "));
    lastName = parts[parts.length - 1] ?? clean;
  }
  return { salutation, title, lastName: lastName || clean, fullName: clean };
}

/** "Testfrau" → "T•••••" für die Vorschau. */
export function maskName(name: string): string {
  return name ? name[0] + "•".repeat(Math.max(2, name.length - 1)) : "";
}
