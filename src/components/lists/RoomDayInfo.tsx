"use client";

import { IconBan, IconLaundry, IconPerson } from "@/components/icons";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import { useGlassMode } from "@/components/shell/GlassMode";
import { Glyph, Pill, SectionLabel } from "@/components/ui";
import { cx } from "@/components/ui/primitives";
import { kindPill, type DayKind } from "@/lib/ui/hkHub";
import { windowGuestName } from "@/lib/ui/roomWindow";

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
  const glass = useGlassMode();
  const list = Array.isArray(traces) ? traces : [];
  if (!day && list.length === 0) return null;
  if (glass) return <RoomDayInfoGlass day={day} traces={list} showDept={showDept} />;
  return (
    <div className="mt-3 space-y-2" data-testid="room-today">
      {day && (
        <div className="rounded-lg bg-white p-2 text-sm">
          <span className="me-1 font-medium">{t("roomEdit.today")}:</span>
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
              {day.eta && <span className="ms-2 text-xs font-normal text-graphite/60">{t("lists.guestArrives")} {day.eta}</span>}
            </p>
          )}
        </div>
      )}
      {list.length > 0 && (
        <div className="rounded-lg border-s-4 border-navy bg-white p-2 text-sm" aria-label={t("work.traces")}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-navy">▸ {t("work.traces")}</p>
          <ul className="space-y-1">
            {list.map((x) => (
              <li key={x.id} className={`break-words ${x.status === "DONE" ? "text-graphite/50 line-through" : "font-medium"}`}>
                {showDept && <span className="me-1 text-xs font-semibold">{t(`lists.dept${x.dept}` as TKey)}:</span>}
                {x.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** „Heute“ im Glas-Fenster (D7): Art als Pille, Kennzeichen mit Symbol + Text, Gast „Anrede Titel Nachname“ + Personen, Anreisezeit, Traces. */
function RoomDayInfoGlass({ day, traces, showDept }: { day: DayInfo | null | undefined; traces: DayTrace[]; showDept: boolean }) {
  const { t } = useLocale();
  const pill = day ? kindPill((day.kind as DayKind) ?? null) : null;
  const guest = day ? windowGuestName(day.guest, "IMPORT") : null;
  const pax = day?.pax == null ? null : day.pax === 1 ? t("lists.paxOne") : t("lists.pax", { n: day.pax });
  return (
    <div className="flex flex-col gap-4" data-testid="room-today">
      {day && (
        <section className="flex flex-col gap-3" aria-label={t("roomEdit.today")}>
          <SectionLabel as="h3" icon="calendar-days" title={t("roomEdit.today")} />
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={pill?.tone ?? "neutral"}>{pill ? t(pill.labelKey) : day.kind ? t(`lists.kind${day.kind}` as TKey) : t("lists.kindNone")}</Pill>
            {day.vip && <Pill tone="accent" className="gap-1.5"><Glyph name="star" size={14} />{t("lists.vip")}</Pill>}
            {day.laundry && <Pill tone="info" className="gap-1.5"><Glyph name="shirt" size={14} />{t("lists.laundry")}</Pill>}
            {day.dnd && <Pill tone="danger" className="gap-1.5"><Glyph name="moon" size={14} />{t("lists.dnd")}</Pill>}
            {day.credits != null && day.credits > 0 && <Pill>{t("lists.creditsN", { n: day.credits.toString().replace(".", ",") })}</Pill>}
          </div>
          {(guest || pax) && (
            <p className="text-body-16 flex items-center gap-3 text-text-primary">
              <Glyph name="user" size={22} className="shrink-0 text-text-secondary" />
              {[guest, pax].filter(Boolean).join(" · ")}
            </p>
          )}
          {day.eta && (
            <p className="text-body-16 flex items-center gap-3 text-text-primary">
              <Glyph name="clock" size={22} className="shrink-0 text-text-secondary" />
              {t("hkHub.arrivalAt", { time: day.eta })}
            </p>
          )}
        </section>
      )}
      {traces.length > 0 && (
        <section className="flex flex-col gap-2" aria-label={t("work.traces")}>
          <SectionLabel as="h3" icon="file-text" title={t("work.traces")} />
          <ul className="flex flex-col gap-2">
            {traces.map((x) => (
              <li key={x.id} className={cx("text-body-16 flex items-start gap-3 break-words", x.status === "DONE" ? "text-text-muted line-through" : "text-text-primary")}>
                <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-pill bg-accent-default" />
                <span>
                  {showDept && <span className="text-label me-2 text-text-muted">{t(`lists.dept${x.dept}` as TKey)}:</span>}
                  {x.text}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
