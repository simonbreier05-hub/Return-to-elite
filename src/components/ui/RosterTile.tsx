import { Pill } from "./Pill";
import { ProgressBar } from "./ProgressBar";
import { cx, Interactive, type InteractiveProps } from "./primitives";
import type { PillData } from "./rowShared";

export interface RosterTileProps extends Omit<InteractiveProps, "aria-current" | "aria-pressed"> {
  number: number | string;
  name: string;
  done: number;
  total: number;
  /** Fertiger Text, z. B. „3 von 8“. */
  progressLabel: string;
  credits: string;
  /** Status bzw. Reinigungsart als Pille. */
  pill?: PillData;
  selected?: boolean;
  className?: string;
}

/** Housekeeper-Kachel im Supervisor-Roster (nebeneinander, ca. 184 px). Figma `32:1203`. */
export function RosterTile({ number, name, done, total, progressLabel, credits, pill, selected, className, ...action }: RosterTileProps) {
  return (
    <Interactive
      {...action}
      aria-current={selected ? "true" : undefined}
      className={cx("glass flex w-full flex-col items-start gap-2 rounded-(--glass-radius-md) px-4 py-3", selected && "glass-selected", className)}
    >
      <span className="flex w-full items-center gap-3">
        <span className="bg-champagne text-body-18 flex size-9 shrink-0 items-center justify-center rounded-pill text-text-on-accent">{number}</span>
        <span className="text-body-16 min-w-0 flex-1 truncate text-text-primary">{name}</span>
      </span>
      <ProgressBar value={done} max={total} label={progressLabel} />
      <span className="text-label flex w-full items-center">
        <span className="flex-1 text-text-muted">{progressLabel}</span>
        <span className="text-text-primary">{credits}</span>
      </span>
      {pill && <Pill tone={pill.tone}>{pill.label}</Pill>}
    </Interactive>
  );
}
