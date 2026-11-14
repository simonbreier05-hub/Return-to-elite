import { MAX_MARKERS_COMPACT } from "@/lib/ui/markers";
import { LangChip } from "./LangChip";
import { MarkerBadge } from "./MarkerBadge";
import { Pill } from "./Pill";
import { StatusIcon } from "./StatusIcon";
import { Interactive, type InteractiveProps } from "./Interactive";
import { RowDecor, rowClasses, type MarkerData, type PillData, type RowState, type StatusData } from "./rowShared";

export interface RoomRowCompactProps extends Omit<InteractiveProps, "aria-current" | "aria-pressed"> {
  room: string;
  guest?: string;
  lang?: string;
  pill?: PillData;
  status: StatusData;
  /** Ein Marker (Handy). */
  marker?: MarkerData;
  state?: RowState;
  className?: string;
}

/** Zimmerzeile Handy (ca. 358 px): Zimmer, Gast, Reinigungsart, Sprache, ein Marker, Status als Symbol. Figma `39:1948`. */
export function RoomRowCompact({ room, guest, lang, pill, status, marker, state = "default", className, ...action }: RoomRowCompactProps) {
  return (
    <Interactive {...action} aria-current={state === "selected" ? "true" : undefined} className={rowClasses(state, `gap-3 ${className ?? ""}`)}>
      <span className="text-title-28 w-[60px] shrink-0 text-text-primary">{room}</span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        {guest && <span className="text-body-18 max-w-full truncate text-text-primary">{guest}</span>}
        {(pill || lang) && (
          <span className="flex items-center gap-1">
            {pill && <Pill tone={pill.tone} edge={pill.edge}>{pill.label}</Pill>}
            {lang && <LangChip code={lang} />}
          </span>
        )}
      </span>
      {marker && MAX_MARKERS_COMPACT > 0 && <MarkerBadge marker={marker.kind} label={marker.label} />}
      <StatusIcon status={status.value} label={status.label} />
      <RowDecor state={state} compact />
    </Interactive>
  );
}
