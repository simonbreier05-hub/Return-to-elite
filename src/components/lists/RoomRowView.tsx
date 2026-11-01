"use client";

import { IconBan, IconBroom, IconClock, IconLaundry, IconMoon, IconPerson, IconSuitcase, IconWrench, StatusIcon } from "@/components/icons";
import { mainLabel, markers, type MainLabel } from "@/lib/lists/rowLabels";
import { STATUS_STYLES } from "@/components/status";
import type { RoomStatus } from "@/lib/domain";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";

export interface ListTrace { id: string; code: string; text: string; dept: string; status: string }
export interface ListRoom {
  id: string; number: string; floor: number; status: string;
  kind: "DEPARTURE" | "SAME_DAY_TURN" | "STAYOVER" | "ARRIVAL" | null;
  laundry: boolean; vip: boolean; eta: string | null; guest: string | null; pax: number | null; dnd: boolean; credits: number;
  traces: ListTrace[];
  routeOrder?: number | null;
  /** H2: offene Mängel, offener Gastwunsch, offene Hinweise des Teams. */
  openDefects?: number;
  guestWish?: boolean;
  hints?: { id: string; body: string }[];
  /** Durch Nachimport geändert (nur Supervisor-Liste). */
  changed?: boolean;
}

const LABEL_ICON = { TURN: IconClock, DEPARTURE: IconBroom, STAYOVER: IconMoon, ARRIVAL: IconSuitcase, NONE: null } as const;
/** Gedämpfte Farben je Hauptlabel (immer zusammen mit Icon + Text). Turn = höchste Dringlichkeit, Messing. */
export const LABEL_STYLE: Record<MainLabel, { chip: string; edge: string }> = {
  TURN: { chip: "border-gold bg-gold/20 text-charcoal font-semibold", edge: "border-l-gold" },
  DEPARTURE: { chip: "border-status-dirty/40 bg-status-dirty/10 text-status-dirty", edge: "border-l-status-dirty" },
  STAYOVER: { chip: "border-status-inspected/40 bg-status-inspected/10 text-status-inspected", edge: "border-l-status-inspected" },
  ARRIVAL: { chip: "border-status-pickup/40 bg-status-pickup/10 text-status-pickup", edge: "border-l-status-pickup" },
  NONE: { chip: "border-charcoal/15 bg-ivory text-charcoal", edge: "border-l-charcoal/15" },
};
const chip = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium";

/**
 * Eine Zimmerzeile der Arbeitslisten. Jede Information steht als Icon **und** Text (nie nur Farbe/Symbol).
 * Gast nur als „Anrede Titel Nachname"; keine Altersangaben, keine Vornamen.
 */
export default function RoomRowView({ room, highlight = false, showDept = false, onOpen }: { room: ListRoom; highlight?: boolean; showDept?: boolean; onOpen?: (number: string) => void }) {
  const { t } = useLocale();
  const label = mainLabel(room.kind);
  const KindIcon = LABEL_ICON[label];
  const marks = new Set(markers({ ...room, number: room.number }));
  const style = STATUS_STYLES[room.status as RoomStatus];
  const openTraces = room.traces.filter((x) => x.status === "OPEN");
  return (
    <li data-room={room.number} data-highlight={highlight ? "1" : undefined}
      className={`rounded-xl border border-l-4 bg-white px-3 py-2.5 transition-shadow duration-500 ${LABEL_STYLE[label].edge} ${highlight ? "border-gold shadow-[0_0_0_3px_rgba(169,132,63,0.35)]" : "border-charcoal/10"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            {onOpen ? (
              <button type="button" onClick={() => onOpen(room.number)} aria-label={t("lists.openRoom", { number: room.number })}
                className="-my-2 -ml-1 inline-flex min-h-11 min-w-11 items-center rounded-lg px-1 font-serif text-2xl leading-none underline decoration-gold/50 decoration-1 underline-offset-4 hover:decoration-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
                {room.number}
              </button>
            ) : <span className="font-serif text-2xl leading-none">{room.number}</span>}
            <span className="text-xs text-graphite/60">{t("lists.floorN", { n: room.floor })}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className={`${chip} ${LABEL_STYLE[label].chip}`} data-label={label}>
              {KindIcon && <KindIcon className="h-3.5 w-3.5" />}
              {room.kind ? t(`lists.kind${room.kind}` as TKey) : t("lists.kindNone")}
            </span>
            {marks.has("VIP") && <span className={`${chip} border-gold bg-gold-soft/40 text-charcoal`}><span aria-hidden>★</span>{t("lists.vip")}</span>}
            {marks.has("DND") && <span className={`${chip} border-status-blocked/40 bg-status-blocked/10 text-status-blocked`}><IconBan className="h-3.5 w-3.5" />{t("lists.dnd")}</span>}
            {marks.has("LAUNDRY") && <span className={`${chip} border-gold-line/60 bg-gold-soft/30 text-charcoal`}><IconLaundry className="h-3.5 w-3.5" />{t("lists.laundry")}</span>}
            {marks.has("DEFECT") && <span className={`${chip} border-status-defect/40 bg-status-defect/10 text-status-defect`}><IconWrench className="h-3.5 w-3.5" />{t("lists.defectOpen")}</span>}
            {marks.has("GUEST_WISH") && <span className={`${chip} border-status-pickup/40 bg-status-pickup/10 text-status-pickup`}><span aria-hidden>✨</span>{t("lists.guestWish")}</span>}
            {marks.has("HINT") && <span className={`${chip} border-navy/30 bg-navy/10 text-navy`}><span aria-hidden>📝</span>{t("lists.hint")}</span>}
            {room.pax != null && <span className={`${chip} border-charcoal/15 text-graphite`}><IconPerson className="h-3.5 w-3.5" />{room.pax === 1 ? t("lists.paxOne") : t("lists.pax", { n: room.pax })}</span>}
            {room.changed && <span className={`${chip} border-gold bg-parchment text-charcoal`}>↻ {t("lists.changed")}</span>}
          </div>
          {room.guest && (
            <p className="mt-1.5 text-sm font-medium">
              {room.guest}
              {room.kind === "ARRIVAL" || room.kind === "SAME_DAY_TURN" ? <span className="ml-2 text-xs font-normal text-graphite/60">{t("lists.guestArrives")}{room.eta ? ` ${room.eta}` : ""}</span> : null}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {style && (
            <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium ${style.chip}`}>
              <StatusIcon iconKey={style.iconKey} className="h-3 w-3 shrink-0" />
              {t(`status.${room.status}` as TKey)}
            </span>
          )}
          {room.credits > 0 && <span className="text-xs text-graphite/70">{t("lists.creditsN", { n: room.credits.toString().replace(".", ",") })}</span>}
        </div>
      </div>
      {(room.hints?.length ?? 0) > 0 && (
        <ul className="mt-2 space-y-0.5 rounded-lg border border-navy/20 bg-navy/5 px-2 py-1.5 text-sm text-navy" aria-label={t("lists.hints")}>
          {room.hints!.map((h) => <li key={h.id}><span aria-hidden>📝 </span><span className="font-semibold">{t("lists.hint")}:</span> {h.body}</li>)}
        </ul>
      )}
      {room.traces.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-charcoal/10 pt-1.5 text-xs" aria-label={t("lists.traces")}>
          {room.traces.map((x) => (
            <li key={x.id} className={x.status === "DONE" ? "text-graphite/50 line-through" : "text-graphite"}>
              <span aria-hidden>▸ </span>
              {showDept && <span className="mr-1 font-semibold">{t(`lists.dept${x.dept}` as TKey)}:</span>}
              {x.text}
            </li>
          ))}
          {openTraces.length === 0 && <li className="sr-only">✓</li>}
        </ul>
      )}
    </li>
  );
}
