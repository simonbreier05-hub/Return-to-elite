/** Töne der Bausteine (docs/design/glass-spec.md, Abschnitt 7). Reine Daten. */
export const TONES = ["neutral", "accent", "success", "warning", "danger", "info"] as const;
export type Tone = (typeof TONES)[number];
