import { timingSafeEqual } from "node:crypto";

/**
 * Geschützter Aufruf für destruktive interne Jobs (Nachtlöschung). server.js erzeugt beim Start ein
 * zufälliges Geheimnis (INTERNAL_TICKER_SECRET) und sendet es im Header x-internal-secret; von außen
 * lässt es sich nicht fälschen (anders als der einfache x-internal-ticker-Header der Eskalationen).
 */
export function hasInternalSecret(req: Request): boolean {
  const expected = process.env.INTERNAL_TICKER_SECRET;
  const got = req.headers.get("x-internal-secret");
  if (!expected || !got) return false;
  const a = Buffer.from(expected), b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}
