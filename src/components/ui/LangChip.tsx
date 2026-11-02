import { cx } from "./primitives";

export interface LangChipProps {
  /** Sprachkürzel, z. B. „EN“. */
  code: string;
  /** Ausgeschriebene Sprache für Vorlesen/Tooltip (optional). */
  label?: string;
  className?: string;
}

/** Gastsprache als Kürzel (EN, DE, FR). Figma `19:77`. */
export function LangChip({ code, label, className }: LangChipProps) {
  return (
    <span
      title={label}
      aria-label={label}
      className={cx("text-label inline-flex shrink-0 items-center rounded-(--glass-radius-sm) border border-border-subtle bg-surface-card-raised px-2 py-1 uppercase text-text-secondary", className)}
    >
      {code}
    </span>
  );
}
