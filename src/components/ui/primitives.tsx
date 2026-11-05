/**
 * Gemeinsame Kleinteile der Design-Bausteine (D0): Symbol, klickbare Hülle, Fokusring,
 * Ton-Klassen. Nur Token-Klassen (docs/design/glass-spec.md), keine harten Farben.
 */
import type { ReactNode } from "react";
import { ICONS, ICON_STROKE, type IconName } from "@/lib/ui/icons";
import type { Tone } from "@/lib/ui/tone";
import type { TileTone } from "@/lib/ui/room-tile";

/** Sichtbarer Fokusring: 2 px Akzent, 2 px Abstand (Spezifikation Abschnitt 12). */
export const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-accent-default";

/** Text-/Symbolfarbe je Ton. */
export const TONE_FG: Record<Tone, string> = {
  neutral: "text-text-secondary",
  accent: "text-accent-text",
  success: "text-status-success-fg",
  warning: "text-status-warning-fg",
  danger: "text-status-danger-fg",
  info: "text-status-info-fg",
};

/** Fläche je Ton (Marker, Status-Symbol, Banner). */
export const TONE_BG: Record<Tone, string> = {
  neutral: "bg-pill-neutral-bg",
  accent: "bg-accent-subtle-bg",
  success: "bg-status-success-bg",
  warning: "bg-status-warning-bg",
  danger: "bg-status-danger-bg",
  info: "bg-status-info-bg",
};

/** Pille je Ton (Figma `19:15`). */
export const PILL_CLASSES: Record<Tone, string> = {
  neutral: "bg-pill-neutral-bg border-pill-neutral-border text-text-secondary",
  accent: "bg-pill-gold-bg border-pill-gold-border text-text-primary",
  success: "bg-status-success-bg border-transparent text-status-success-fg",
  warning: "bg-status-warning-bg border-transparent text-status-warning-fg",
  danger: "bg-status-danger-bg border-transparent text-status-danger-fg",
  info: "bg-status-info-bg border-transparent text-status-info-fg",
};

/** Symbolfarbe der Zimmerkachel. */
export const TILE_FG: Record<TileTone, string> = {
  muted: "text-text-muted",
  secondary: "text-text-secondary",
  accent: "text-accent-text",
  info: "text-status-info-fg",
  success: "text-status-success-fg",
  danger: "text-status-danger-fg",
};

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Lucide-Symbol aus der zentralen Liste; dekorativ (aria-hidden), Bedeutung trägt der Text daneben. */
export function Glyph({ name, size = 24, className }: { name: IconName; size?: number; className?: string }) {
  const C = ICONS[name];
  return <C aria-hidden="true" focusable="false" width={size} height={size} strokeWidth={ICON_STROKE} className={cx("shrink-0", className)} />;
}

/** Zähler-Badge in Champagner (Navigation, Tab-Leiste). */
export function CountBadge({ value, className }: { value: string | number; className?: string }) {
  return (
    <span className={cx("bg-champagne text-label inline-flex min-w-7 items-center justify-center rounded-pill px-2 py-1 text-text-on-accent", className)}>
      {value}
    </span>
  );
}

/** Feine Trennlinie unter Zeilen (Figma „Trennlinie“), inset 16 px. */
export function RowDivider() {
  return <span aria-hidden="true" className="pointer-events-none absolute inset-x-4 bottom-0 h-px bg-surface-progress-track" />;
}
