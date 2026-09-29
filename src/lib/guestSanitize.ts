/**
 * Defense-in-depth for guest freetext (RoomNote body, Defect note): React
 * already escapes everything it renders, so this isn't closing an active
 * XSS hole in the Hub UI today — it's cheap insurance against a future
 * consumer (a PDF export, an email digest, a raw HTML mail merge) that
 * doesn't escape, and against control characters/zero-width junk in
 * genuinely staff-visible text. Strips HTML-tag-shaped sequences and
 * control characters, collapses whitespace, and trims.
 */
export function sanitizeGuestText(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}
