import type { DateFormatId, DateResolution } from "./types";

const WEEKDAYS: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  so: 0, mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6,
};

export function weekdayIndex(label: string): number | null {
  const k = label.trim().toLowerCase().replace(/\.$/, "");
  return k in WEEKDAYS ? WEEKDAYS[k] : null;
}

function validYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** "05-16-18" / "16/05/18" → [a, b, yy] oder null. Jahr zweistellig → 20yy. */
function split(raw: string): [number, number, number] | null {
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const yy = Number(m[3]);
  return [Number(m[1]), Number(m[2]), m[3].length === 2 ? 2000 + yy : yy];
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const isIsoDate = (raw: string) => ISO_RE.test(raw.trim());

/** Excel-Datumszellen kommen als JJJJ-MM-TT an — unabhängig vom Format eindeutig. */
export function toIso(raw: string, format: DateFormatId): string | null {
  const iso = ISO_RE.exec(raw.trim());
  if (iso) return validYmd(+iso[1], +iso[2], +iso[3]) ? raw.trim() : null;
  const p = split(raw);
  if (!p) return null;
  const [a, b, y] = p;
  const [mo, d] = format === "MDY" ? [a, b] : [b, a];
  if (!validYmd(y, mo, d)) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function isoWeekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function diffDays(fromIso: string, toIso_: string): number {
  const t = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(toIso_) - t(fromIso)) / 86_400_000);
}

/**
 * Bestimmt das Datumsformat einer Liste aus ALLEN ihren Datumswerten.
 * - Ein Format, das für irgendeinen Wert ungültig ist (Monat > 12), scheidet aus.
 * - Mit Wochentagen (Forecast) scheiden Formate aus, bei denen sie nicht passen.
 * - Bleiben beide übrig → mehrdeutig: es wird NICHT geraten, der Nutzer muss
 *   in der Vorschau eine Lesart bestätigen (`confirmed`).
 */
export function resolveDateFormat(
  raws: string[],
  opts: { weekdays?: (string | null)[]; confirmed?: DateFormatId } = {},
): DateResolution {
  const formats: DateFormatId[] = ["MDY", "DMY"];
  if (raws.every(isIsoDate)) return { format: opts.confirmed ?? "MDY", via: "unique" }; // reine ISO-Werte: Format egal
  const valid = formats.filter((f) => raws.every((r) => toIso(r, f) !== null));
  let via: DateResolution["via"] = "unique";
  let left = valid;
  if (opts.weekdays && left.length > 1) {
    const matching = left.filter((f) =>
      raws.every((r, i) => {
        const wd = opts.weekdays![i];
        const iso = toIso(r, f);
        const idx = wd ? weekdayIndex(wd) : null;
        return idx === null || iso === null ? true : isoWeekday(iso) === idx;
      }),
    );
    if (matching.length >= 1 && matching.length < left.length) via = "weekday";
    if (matching.length >= 1) left = matching;
  }
  if (left.length === 1) return { format: left[0], via };
  if (opts.confirmed && left.includes(opts.confirmed)) return { format: opts.confirmed, via: "confirmed" };
  const readings = {} as NonNullable<DateResolution["readings"]>;
  for (const f of left.length ? left : formats) {
    const isos = raws.map((r) => toIso(r, f)).filter((x): x is string => !!x).sort();
    readings[f] = { min: isos[0] ?? "?", max: isos[isos.length - 1] ?? "?" };
  }
  return { format: null, via: "ambiguous", readings };
}

/** "*02:13 AM" | "04:30 AM" | "04:30 AN" (abgeschnitten) | "16:45" → "HH:MM" (24 h). */
export function parseTime(raw: string): string | null {
  const m = /^\*?\s*(\d{1,2}):(\d{2})\s*([AP])?[MN]?$/i.exec(raw.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || h > 23) return null;
  const ap = m[3]?.toUpperCase();
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === "A" && h === 12) h = 0;
    if (ap === "P" && h < 12) h += 12;
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
