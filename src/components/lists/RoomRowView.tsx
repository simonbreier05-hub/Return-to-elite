"use client";

import { IconBan, IconBroom, IconClock, IconLaundry, IconMoon, IconPerson, IconSuitcase, IconWrench, StatusIcon } from "@/components/icons";
import { mainLabel, markers, type MainLabel } from "@/lib/lists/rowLabels";
import { STATUS_STYLES } from "@/components/status";
import type { RoomStatus } from "@/lib/domain";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import type { ReactNode } from "react";
import { PauseBadge, type PauseInfo } from "@/components/PauseControl";
import { workProgress } from "@/lib/ui/workProgress";
import { hhmm } from "@/lib/i18n/format";

export interface ListTrace { id: string; code: string; text: string; dept: string; status: string }
export interface ListRoom {
  id: string; number: string; floor: number; status: string;
  kind: "DEPARTURE" | "SAME_DAY_TURN" | "STAYOVER" | "ARRIVAL" | null;
  laundry: boolean; vip: boolean; eta: string | null; guest: string | null; pax: number | null; dnd: boolean; credits: number;
  /** Sprache des Aufenthalts (z. B. „en“) — Sprach-Chip im Housekeeper-Hub (D2). */
  lang?: string | null;
  traces: ListTrace[];
  /** Zimmertyp, offene Mängel und Gästewunsch — nur in Supervisor-/Duty-Manager-Listen gefüllt. */
  type?: string; defects?: number; wish?: string | null;
  /** H2: offene Hinweise des Teams (z. B. aus der Planung). */
  hints?: { id: string; body: string }[];
  /** Durch Nachimport geändert (nur Supervisor-Liste). */
  changed?: boolean;
  /** Aktive Pause (Grund, seit, von wem) — Supervisor/Duty Manager sehen sie in jeder Liste. */
  pause?: PauseInfo | null;
  /** Planung L1: Signale der Listen-Reihenfolge (`src/lib/planung/listOrder.ts`). */
  rush?: boolean;
  serviceNow?: boolean;
  /** Gastwunsch „Reinigung ab HH:MM“ — wird angezeigt. */
  cleanAfter?: string | null;
  checkedOut?: boolean;
  /** Betrieb L2: Start der Reinigung (ISO) und geschätzte Dauer (Credit × Minuten je Credit). */
  startedAt?: string | null;
  estMinutes?: number;
  /** Betrieb L2: Late Check-out „HH:MM“. */
  lateCheckout?: string | null;
  /** Betrieb L2 (Punkt 4): DND ab 12 Uhr noch nicht gereinigt — Karte ans Zimmer hängen. */
  dndCard?: boolean;
  /** Betrieb L2: Gast hat heute die Green Option gewählt (kein Wäschewechsel). */
  green?: boolean;
}

const LABEL_ICON = { TURN: IconClock, DEPARTURE: IconBroom, STAYOVER: IconMoon, ARRIVAL: IconSuitcase, NONE: null } as const;
/**
 * Gedämpfte Farben je Hauptlabel (immer zusammen mit Icon + Text). Betrieb L2 (Meeting 13.11.): Bleiber Grün, Abreise Rot,
 * Anreise Blau, Turn Blau/Rot (blaue Pille, roter Rand). Gleiche Zuordnung wie `KIND_PILL` im Glas-Design.
 */
export const LABEL_STYLE: Record<MainLabel, { chip: string; edge: string }> = {
  TURN: { chip: "border-status-inspected/40 bg-status-inspected/10 text-status-inspected font-semibold", edge: "border-s-status-dirty" },
  DEPARTURE: { chip: "border-status-dirty/40 bg-status-dirty/10 text-status-dirty", edge: "border-s-status-dirty" },
  STAYOVER: { chip: "border-status-clean/40 bg-status-clean/10 text-status-clean", edge: "border-s-status-clean" },
  ARRIVAL: { chip: "border-status-inspected/40 bg-status-inspected/10 text-status-inspected", edge: "border-s-status-inspected" },
  NONE: { chip: "border-charcoal/15 bg-ivory text-charcoal", edge: "border-s-charcoal/15" },
};
const chip = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium";

/**
 * Eine Zimmerzeile der Arbeitslisten. Jede Information steht als Icon **und** Text (nie nur Farbe/Symbol).
 * Gast nur als „Anrede Titel Nachname"; keine Altersangaben, keine Vornamen.
 */
export default function RoomRowView({ room, highlight = false, showDept = false, onOpen, precheck = false, badges, action, prefix }: {
  room: ListRoom; highlight?: boolean; showDept?: boolean; onOpen?: (room: ListRoom) => void; precheck?: boolean;
  /** Zusätzliche (nicht klickbare) Kennzeichen in der Chip-Zeile, z. B. Notizen-Zähler. */
  badges?: ReactNode;
  /** Knopf unter der Zeile, außerhalb der antippbaren Fläche (Housekeeper: Ein-Tipp-Start/Fertig/Fortsetzen). */
  action?: ReactNode;
  /** Vor der Zimmernummer, z. B. die Stopp-Nummer der empfohlenen Route. */
  prefix?: ReactNode;
}) {
  const { t } = useLocale();
  const label = mainLabel(room.kind);
  const KindIcon = LABEL_ICON[label];
  const marks = new Set(markers({ ...room, number: room.number }));
  const style = STATUS_STYLES[room.status as RoomStatus];
  const traces = Array.isArray(room.traces) ? room.traces : [];
  const openTraces = traces.filter((x) => x.status === "OPEN");
  const wp = workProgress(room.startedAt, room.estMinutes ?? 0, new Date());
  return (
    <li data-room={room.number} data-highlight={highlight ? "1" : undefined}
      className={`rounded-xl border border-s-4 bg-white transition-shadow duration-500 ${LABEL_STYLE[label].edge} ${highlight ? "border-gold shadow-[0_0_0_3px_rgba(169,132,63,0.35)]" : "border-charcoal/10"}`}>
      <Wrap onOpen={onOpen ? () => onOpen(room) : undefined} label={t("lists.hmOpenRoom", { n: room.number })}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            {prefix}
            <span className="font-serif text-2xl leading-none">{room.number}</span>
            <span className="text-xs text-graphite/60">{t("lists.floorN", { n: room.floor })}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className={`${chip} ${LABEL_STYLE[label].chip}`} data-label={label}>
              {KindIcon && <KindIcon className="h-3.5 w-3.5" />}
              {room.kind ? t(`lists.kind${room.kind}` as TKey) : t("lists.kindNone")}
            </span>
            {room.laundry && <span className={`${chip} border-gold-line/60 bg-gold-soft/30 text-charcoal`}><IconLaundry className="h-3.5 w-3.5" />{t("lists.laundry")}</span>}
            {room.vip && <span className={`${chip} border-gold bg-gold-soft/40 text-charcoal`}><span aria-hidden>★</span>{t("lists.vip")}</span>}
            {room.dnd && <span className={`${chip} border-status-blocked/40 bg-status-blocked/10 text-status-blocked`}><IconBan className="h-3.5 w-3.5" />{t("lists.dnd")}</span>}
            {precheck && room.kind === "ARRIVAL" && (room.status === "INSPECTED"
              ? <span className={`${chip} border-status-clean/40 bg-status-clean/10 text-charcoal`}><span aria-hidden>✓</span>{t("lists.arrivalReleased")}</span>
              : <span className={`${chip} border-gold bg-gold-soft/40 text-charcoal`}><span aria-hidden>🔎</span>{t("lists.precheckArrival")}</span>)}
            {precheck && room.kind === "DEPARTURE" && <span className={`${chip} border-gold-line/60 bg-parchment text-charcoal`}><span aria-hidden>📌</span>{t("lists.precheckNoted")}</span>}
            {room.type && <span className={`${chip} border-charcoal/15 bg-white text-graphite`}>{t(`roomType.${room.type}` as TKey)}</span>}
            {traces.length > 0 && <span className={`${chip} border-charcoal/15 bg-white text-graphite`}><span aria-hidden>▸</span>{t("lists.rowTraces", { n: traces.length })}</span>}
            {(room.defects ?? 0) > 0 && <span className={`${chip} border-status-defect/40 bg-status-defect/10 text-status-defect`}><IconWrench className="h-3.5 w-3.5" />{t("lists.rowDefects", { n: room.defects ?? 0 })}</span>}
            {room.wish && <span className={`${chip} border-gold-line/60 bg-parchment text-charcoal`}><span aria-hidden>{room.wish === "CLEAN_REQUEST" ? "✨" : "💬"}</span>{t(`lists.wish${room.wish}` as TKey)}</span>}
            {marks.has("HINT") && <span className={`${chip} border-navy/30 bg-navy/10 text-navy`}><span aria-hidden>📝</span>{t("lists.hint")}</span>}
            {room.pax != null && <span className={`${chip} border-charcoal/15 text-graphite`}><IconPerson className="h-3.5 w-3.5" />{room.pax === 1 ? t("lists.paxOne") : t("lists.pax", { n: room.pax })}</span>}
            {room.changed && <span className={`${chip} border-gold bg-parchment text-charcoal`}>↻ {t("lists.changed")}</span>}
            {room.pause && <PauseBadge pause={room.pause} showBy={showDept} />}
            {/* Betrieb L2: In Arbeit (Start/Laufzeit/Rest), Late Check-out, Ausgecheckt, Green Option, Gastsprache — immer Symbol + Text */}
            {wp && <span className={`${chip} ${wp.overMin > 0 ? "border-status-dirty/40 bg-status-dirty/10 text-status-dirty" : "border-status-inspected/40 bg-status-inspected/10 text-status-inspected"}`}><IconClock className="h-3.5 w-3.5" />{wp.overMin > 0 ? t("lists.workOver", { start: hhmm(wp.startedAt), elapsed: wp.elapsedMin, over: wp.overMin }) : t("lists.workRunning", { start: hhmm(wp.startedAt), elapsed: wp.elapsedMin, remaining: wp.remainingMin })}</span>}
            {room.lateCheckout && <span className={`${chip} border-gold bg-gold-soft/40 text-charcoal`}><IconClock className="h-3.5 w-3.5" />{t("lists.lateCheckout", { time: room.lateCheckout })}</span>}
            {room.checkedOut && (room.kind === "SAME_DAY_TURN" || room.kind === "DEPARTURE") && <span className={`${chip} border-status-clean/40 bg-status-clean/10 text-status-clean`}><span aria-hidden>✓</span>{t("lists.checkedOut")}</span>}
            {room.dndCard && <span className={`${chip} border-status-blocked/40 bg-status-blocked/10 text-status-blocked`}><IconBan className="h-3.5 w-3.5" />{t("lists.dndCard")}</span>}
            {room.green && <span className={`${chip} border-status-clean/40 bg-status-clean/10 text-status-clean`}><span aria-hidden>🌿</span>{t("lists.green")}</span>}
            {room.lang && <span className={`${chip} border-charcoal/15 bg-white text-graphite`} title={t("lists.guestLanguage")}><span aria-hidden>🗣</span>{room.lang.toUpperCase()}</span>}
            {badges}
          </div>
          {room.guest && (
            <p className="mt-1.5 text-sm font-medium">
              {room.guest}
              {room.kind === "ARRIVAL" || room.kind === "SAME_DAY_TURN" ? <span className="ms-2 text-xs font-normal text-graphite/60">{t("lists.guestArrives")}{room.eta ? ` ${room.eta}` : ""}</span> : null}
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
        <ul className="mt-2 space-y-0.5 break-words rounded-lg border border-navy/20 bg-navy/5 px-2 py-1.5 text-sm text-navy" aria-label={t("lists.hints")}>
          {room.hints!.map((h) => <li key={h.id}><span aria-hidden>📝 </span><span className="font-semibold">{t("lists.hint")}:</span> {h.body}</li>)}
        </ul>
      )}
      {traces.length > 0 && (
        <ul className="mt-2 space-y-0.5 break-words border-t border-charcoal/10 pt-1.5 text-xs" aria-label={t("lists.traces")}>
          {traces.map((x) => (
            <li key={x.id} className={x.status === "DONE" ? "text-graphite/50 line-through" : "text-graphite"}>
              <span aria-hidden>▸ </span>
              {showDept && <span className="me-1 font-semibold">{t(`lists.dept${x.dept}` as TKey)}:</span>}
              {x.text}
            </li>
          ))}
          {openTraces.length === 0 && <li className="sr-only">✓</li>}
        </ul>
      )}
      </Wrap>
      {action && <div className="px-3 pb-3">{action}</div>}
    </li>
  );
}

/** Zeile antippbar (ganze Fläche, ≥ 44 px) — ohne `onOpen` (Housekeeper-Liste) bleibt sie reiner Text. */
function Wrap({ onOpen, label, children }: { onOpen?: () => void; label: string; children: React.ReactNode }) {
  if (!onOpen) return <div className="px-3 py-2.5">{children}</div>;
  return (
    <button type="button" onClick={onOpen} title={label} className="block min-h-11 w-full rounded-xl px-3 py-2.5 text-start hover:bg-parchment/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold">
      {children}
    </button>
  );
}
