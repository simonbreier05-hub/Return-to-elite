import type { IconName } from "@/lib/ui/icons";
import { cx, FOCUS_RING, Glyph } from "@/components/ui/primitives";

/** Runde Symbol-Taste 48 px (Kopf: Suche, Glocke; Fenster: Schließen). Beschriftung als aria-label + Tooltip. */
export function GlassIconButton({
  icon,
  label,
  onClick,
  dot,
  expanded,
  className,
  iconClassName,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  /** Kleiner Punkt oben rechts (z. B. neue Meldungen). */
  dot?: boolean;
  expanded?: boolean;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      className={cx("press relative flex size-(--size-touch-min) shrink-0 items-center justify-center rounded-pill text-text-primary", FOCUS_RING, className)}
    >
      <Glyph name={icon} size={28} className={iconClassName} />
      {dot && <span aria-hidden="true" className="bg-champagne absolute end-2.5 top-2 size-2.5 rounded-pill" />}
    </button>
  );
}
