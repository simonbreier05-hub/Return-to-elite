"use client";

import { IconBan, IconLaundry, IconPerson } from "@/components/icons";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";

export interface DayInfo { kind: string | null; laundry: boolean; vip: boolean; eta: string | null; guest: string | null; pax: number | null; dnd?: boolean; credits?: number }
export interface DayTrace { id: string; text: string; dept: string; status: string }

const chip = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium";

/**
 * „Heute“ im Zimmer-Detail-Modal: Art (Anreise/Abreise/Bleiber/Turn), Wäschewechsel, VIP, DND, Gast nur als Kurzname
 * („Herr Dr. Krüger“), Personen, Anreisezeit — und die Traces deutlich als eigener Kasten. Keine Altersangaben, keine Vornamen.
 * Eine Darstellung für Housekeeper-Hub und Live-Listen (Supervisor/Duty Manager).
 */
export default function RoomDayInfo({ day, traces = [], showDept = false }: { day: DayInfo | null | undefined; traces?: DayTrace[] | null; showDept?: boolean }) {
  const { t } = useLocale();
  const list = Array.isArray(traces) ? traces : [];
  if (!day && list.length === 0) return null;
  return (
    <div className="mt-3 space-y-2" data-testid="room-today">
      {day && (
        <div className="rounded-lg bg-white p-2 text-sm">
          <span className="mr-1 font-medium">{t("roomEdit.today")}:</span>
          <span className="inline-flex flex-wrap gap-1.5 align-middle">
            <span className={`${chip} border-charcoal/15 bg-ivory`}>{day.kind ? t(`lists.kind${day.kind}` as TKey) : t("lists.kindNone")}</span>
            {day.laundry && <span className={`${chip} border-gold-line/60 bg-gold-soft/30`}><IconLaundry className="h-3.5 w-3.5" />{t("lists.laundry")}</span>}
            {day.vip && <span className={`${chip} border-gold bg-gold-soft/40`}><span aria-hidden>★</span>{t("lists.vip")}</span>}
            {day.dnd && <span className={`${chip} border-status-blocked/40 bg-status-blocked/10 text-status-blocked`}><IconBan className="h-3.5 w-3.5" />{t("lists.dnd")}</span>}
            {day.pax != null && <span className={`${chip} border-charcoal/15`}><IconPerson className="h-3.5 w-3.5" />{day.pax === 1 ? t("lists.paxOne") : t("lists.pax", { n: day.pax })}</span>}
            {day.credits != null && day.credits > 0 && <span className={`${chip} border-charcoal/15`}>{t("lists.creditsN", { n: day.credits.toString().replace(".", ",") })}</span>}
          </span>
          {(day.guest || day.eta) && (
            <p className="mt-1.5 font-medium">
              {day.guest}
              {day.eta && <span className="ml-2 text-xs font-normal text-graphite/60">{t("lists.guestArrives")} {day.eta}</span>}
            </p>
          )}
        </div>
      )}
      {list.length > 0 && (
        <div className="rounded-lg border-l-4 border-navy bg-white p-2 text-sm" aria-label={t("work.traces")}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-navy">▸ {t("work.traces")}</p>
          <ul className="space-y-1">
            {list.map((x) => (
              <li key={x.id} className={`break-words ${x.status === "DONE" ? "text-graphite/50 line-through" : "font-medium"}`}>
                {showDept && <span className="mr-1 text-xs font-semibold">{t(`lists.dept${x.dept}` as TKey)}:</span>}
                {x.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
