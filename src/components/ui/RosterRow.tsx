import { ProgressBar } from "./ProgressBar";
import { StatusChip } from "./StatusChip";
import { Glyph, Interactive, type InteractiveProps } from "./primitives";
import { RowDecor, rowClasses, type StatusData } from "./rowShared";

export interface RosterRowProps extends Omit<InteractiveProps, "aria-current" | "aria-pressed"> {
  /** Tagesnummer der Kraft. */
  number: number | string;
  name: string;
  done: number;
  total: number;
  /** Fertiger Text, z. B. „3 von 8“. */
  progressLabel: string;
  /** Credits als Text (z. B. „11,5“, über `fmt` formatiert). */
  credits: string;
  /** Übersetztes Wort „Credits“ (`t("ui.credits")`). */
  creditsLabel: string;
  status: StatusData;
  selected?: boolean;
  className?: string;
}

/** Housekeeper im Supervisor-Roster als Zeile (breite Ansicht). Figma `29:476`. */
export function RosterRow({ number, name, done, total, progressLabel, credits, creditsLabel, status, selected, className, ...action }: RosterRowProps) {
  const state = selected ? "selected" : "default";
  const interactive = Boolean(action.href || action.onClick);
  return (
    <Interactive {...action} aria-current={selected ? "true" : undefined} className={rowClasses(state, `gap-4 ${className ?? ""}`)}>
      <span className="bg-champagne text-title-22 flex size-12 shrink-0 items-center justify-center rounded-pill text-text-on-accent">{number}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-body-18 truncate text-text-primary">{name}</span>
        <span className="flex items-center gap-3">
          <span className="w-[140px] max-w-full shrink">
            <ProgressBar value={done} max={total} label={progressLabel} />
          </span>
          <span className="text-label whitespace-nowrap text-text-muted">{progressLabel}</span>
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className="text-body-18 text-text-primary">{credits}</span>
        <span className="text-label text-text-muted">{creditsLabel}</span>
      </span>
      <StatusChip status={status.value} label={status.label} />
      {interactive && <Glyph name="chevron-right" size={24} className="text-text-secondary rtl:-scale-x-100" />}
      <RowDecor state={state} />
    </Interactive>
  );
}
