import { STATUS_UI, type UiStatus } from "@/lib/ui/status";
import { cx, Glyph, TONE_BG, TONE_FG } from "./primitives";

export interface StatusIconProps {
  status: UiStatus;
  /** Übersetzter Text — wird vorgelesen und als Tooltip gezeigt. */
  label: string;
  className?: string;
}

/** Status nur als Symbol im Kreis 36 px (Handy); Bedeutung über Symbol + aria-label. Figma `39:1899`. */
export function StatusIcon({ status, label, className }: StatusIconProps) {
  const s = STATUS_UI[status];
  return (
    <span role="img" aria-label={label} title={label} className={cx("inline-flex size-9 shrink-0 items-center justify-center rounded-pill", TONE_BG[s.tone], TONE_FG[s.tone], className)}>
      <Glyph name={s.icon} size={20} />
    </span>
  );
}
