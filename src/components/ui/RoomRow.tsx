import { MAX_MARKERS_ROW } from "@/lib/ui/markers";
import { LangChip } from "./LangChip";
import { MarkerBadge } from "./MarkerBadge";
import { Pill } from "./Pill";
import { StatusChip } from "./StatusChip";
import { Glyph } from "./primitives";
import { Interactive, type InteractiveProps } from "./Interactive";
import { RowDecor, rowClasses, type MarkerData, type PillData, type RowState, type StatusData } from "./rowShared";

export interface RoomRowProps extends Omit<InteractiveProps, "aria-current" | "aria-pressed"> {
  room: string;
  /** Gast als „Anrede Titel Nachname“ (z. B. „Herr Dr. Krüger“), nie Vorname/Alter. */
  guest?: string;
  lang?: string;
  pill?: PillData;
  status: StatusData;
  /** Höchstens 2 Marker; weitere werden nicht gezeigt. */
  markers?: MarkerData[];
  state?: RowState;
  className?: string;
}

/** Zimmerzeile Tablet: Nummer, Gast, Sprache, Pille, Status, 2 Marker. Figma `21:144`. */
export function RoomRow({ room, guest, lang, pill, status, markers = [], state = "default", className, ...action }: RoomRowProps) {
  const interactive = Boolean(action.href || action.onClick);
  return (
    <Interactive {...action} aria-current={state === "selected" ? "true" : undefined} className={rowClasses(state, `gap-4 ${className ?? ""}`)}>
      <span className="text-number w-16 shrink-0 text-text-primary">{room}</span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        {guest && <span className="text-body-18 max-w-full truncate text-text-primary">{guest}</span>}
        {lang && <LangChip code={lang} />}
      </span>
      {pill && <Pill tone={pill.tone}>{pill.label}</Pill>}
      <StatusChip status={status.value} label={status.label} />
      {markers.length > 0 && (
        <span className="flex shrink-0 items-center gap-2">
          {markers.slice(0, MAX_MARKERS_ROW).map((m) => (
            <MarkerBadge key={m.kind} marker={m.kind} label={m.label} />
          ))}
        </span>
      )}
      {interactive && <Glyph name="chevron-right" size={24} className="text-text-secondary rtl:-scale-x-100" />}
      <RowDecor state={state} />
    </Interactive>
  );
}
