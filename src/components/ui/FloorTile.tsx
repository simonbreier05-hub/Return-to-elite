import { TILE_UI, type TileState } from "@/lib/ui/room-tile";
import { cx, Glyph, Interactive, TILE_FG, type InteractiveProps } from "./primitives";

export interface FloorTileProps extends Omit<InteractiveProps, "aria-label" | "aria-current"> {
  room: string;
  state: TileState;
  /** Übersetzter Zustand (`t(TILE_UI[state].labelKey)`) — Teil des Vorlesetexts. */
  stateLabel: string;
  /** Goldrahmen 2 px = noch nicht zugeteilt. */
  unassigned?: boolean;
  /** Übersetzter Text für den Goldrahmen (`t(TILE_UNASSIGNED_KEY)`). */
  unassignedLabel?: string;
  /** Mehrfachauswahl im Grundriss (z. B. „Mehrere Zimmer wählen“). */
  selected?: boolean;
  className?: string;
}

/** Zimmerkachel im Grundriss (64×60): Zustand per Symbol + Farbe, Goldrahmen „Zuteilung offen“. Figma `29:554`. */
export function FloorTile({ room, state, stateLabel, unassigned, unassignedLabel, selected, className, ...action }: FloorTileProps) {
  const t = TILE_UI[state];
  const label = [room, stateLabel, unassigned ? unassignedLabel : null].filter(Boolean).join(", ");
  return (
    <Interactive
      {...action}
      aria-label={label}
      aria-pressed={action.onClick && selected !== undefined ? selected : undefined}
      className={cx(
        "relative flex h-15 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-(--glass-radius-sm)",
        t.glass ? "glass" : "border border-border-subtle",
        selected && "glass-selected",
        className,
      )}
    >
      <span className="text-label text-text-primary">{room}</span>
      <Glyph name={t.icon} size={20} className={TILE_FG[t.tone]} />
      {unassigned && <span aria-hidden="true" className="pointer-events-none absolute -inset-px rounded-(--glass-radius-sm) border-2 border-accent-default" />}
    </Interactive>
  );
}
