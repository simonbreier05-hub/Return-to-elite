import { cx } from "./primitives";

export interface ProgressBarProps {
  /** Erledigt (z. B. 3) … */
  value: number;
  /** … von gesamt (z. B. 8). */
  max: number;
  /** Vorlesetext, z. B. „3 von 8 Zimmern“. */
  label: string;
  className?: string;
}

/** Fortschritt: Spur + Champagner-Füllung, Höhe 12. Figma `21:58`. */
export function ProgressBar({ value, max, label, className }: ProgressBarProps) {
  const safeMax = max > 0 ? max : 0;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const pct = safeMax ? (clamped / safeMax) * 100 : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={clamped}
      className={cx("h-3 w-full overflow-hidden rounded-pill bg-surface-progress-track", className)}
    >
      <div className="bg-champagne h-full rounded-pill" style={{ width: `${pct}%` }} />
    </div>
  );
}
