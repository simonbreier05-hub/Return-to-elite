import { STATUS_UI, type UiStatus } from "@/lib/ui/status";
import { cx, Glyph, TONE_FG } from "./primitives";

export interface StatusChipProps {
  status: UiStatus;
  /** Übersetzter Text, z. B. `t(STATUS_UI[status].labelKey)`. */
  label: string;
  className?: string;
}

/** Status mit Symbol und Text (Tablet/Desktop) — nie nur Farbe. Figma `19:51`. */
export function StatusChip({ status, label, className }: StatusChipProps) {
  const s = STATUS_UI[status];
  return (
    <span className={cx("text-body-16 inline-flex shrink-0 items-center gap-2 whitespace-nowrap", TONE_FG[s.tone], className)}>
      <Glyph name={s.icon} size={22} />
      {label}
    </span>
  );
}
