"use client";

import { IconBan, IconBroom, IconClock, IconLaundry, IconMoon, IconPerson, IconSuitcase, StatusIcon } from "@/components/icons";
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
  /** Durch Nachimport geändert (nur Supervisor-Liste). */
  changed?: boolean;
}

const KIND_ICON = { DEPARTURE: IconBroom, SAME_DAY_TURN: IconClock, STAYOVER: IconMoon, ARRIVAL: IconSuitcase } as const;
const chip = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium";

/**
 * Eine Zimmerzeile der Arbeitslisten. Jede Information steht als Icon **und** Text (nie nur Farbe/Symbol).
 * Gast nur als „Anrede Titel Nachname"; keine Altersangaben, keine Vornamen.
 */
export default function RoomRowView({ room, highlight = false, showDept = false }: { room: ListRoom; highlight?: boolean; showDept?: boolean }) {
  const { t } = useLocale();
  const KindIcon = room.kind ? KIND_ICON[room.kind] : null;
  const style = STATUS_STYLES[room.status as RoomStatus];
  const openTraces = room.traces.filter((x) => x.status === "OPEN");
  return (
    <li data-room={room.number} data-highlight={highlight ? "1" : undefined}
      className={`rounded-xl border bg-white px-3 py-2.5 transition-shadow duration-500 ${highlight ? "border-gold shadow-[0_0_0_3px_rgba(169,132,63,0.35)]" : "border-charcoal/10"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-2xl leading-none">{room.number}</span>
            <span className="text-xs text-graphite/60">{t("lists.floorN", { n: room.floor })}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className={`${chip} border-charcoal/15 bg-ivory text-charcoal`}>
              {KindIcon && <KindIcon className="h-3.5 w-3.5" />}
              {room.kind ? t(`lists.kind${room.kind}` as TKey) : t("lists.kindNone")}
            </span>
            {room.laundry && <span className={`${chip} border-gold-line/60 bg-gold-soft/30 text-charcoal`}><IconLaundry className="h-3.5 w-3.5" />{t("lists.laundry")}</span>}
            {room.vip && <span className={`${chip} border-gold bg-gold-soft/40 text-charcoal`}><span aria-hidden>★</span>{t("lists.vip")}</span>}
            {room.dnd && <span className={`${chip} border-status-blocked/40 bg-status-blocked/10 text-status-blocked`}><IconBan className="h-3.5 w-3.5" />{t("lists.dnd")}</span>}
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
