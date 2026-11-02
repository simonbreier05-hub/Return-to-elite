import { MARKER_UI, type MarkerKind } from "@/lib/ui/markers";
import { cx, Glyph, TONE_BG, TONE_FG } from "./primitives";

export interface MarkerBadgeProps {
  marker: MarkerKind;
  /** Übersetzter Text, z. B. `t(MARKER_UI[marker].labelKey)` — vorgelesen + Tooltip. */
  label: string;
  className?: string;
}

/** Runder Marker 32 px am Zimmer (Priorität, DND, Mangel, Wäschewechsel, Anreise, VIP, Pause). Figma `19:76`. */
export function MarkerBadge({ marker, label, className }: MarkerBadgeProps) {
  const m = MARKER_UI[marker];
  return (
    <span role="img" aria-label={label} title={label} className={cx("inline-flex size-8 shrink-0 items-center justify-center rounded-pill", TONE_BG[m.tone], TONE_FG[m.tone], className)}>
      <Glyph name={m.icon} size={18} />
    </span>
  );
}
