"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import { hhmm, dateTime } from "@/lib/i18n/format";
import { ROOM_STATUS_UI } from "@/lib/ui/status";
import { withoutLeadingSymbol } from "@/lib/ui/hkHub";
import type { RoomStatus } from "@/lib/domain";
import { Banner, Button, Field, FilterChip, Pill, SectionLabel, StatusChip } from "@/components/ui";
import { cx, FOCUS_RING } from "@/components/ui/primitives";
import { HkWindow } from "@/components/hk/HkParts";

export interface SupDetailRoom {
  id: string;
  number: string;
  floor: number;
  section: string;
  type: string;
  status: RoomStatus;
  blockReason?: string | null;
  reworkNote?: string | null;
  oooUntil?: string | null;
  assignedLabel: string | null;
  arrivals: { guestName: string; eta?: string | null; vip: boolean; neededNow: boolean }[];
  defects: { id: string; category: string; note: string; workOrder?: { status: string } | null }[];
}

/**
 * Inhalt des Zimmer-Details der Supervisor-Übersicht (im `DetailContainer`): Status, dieselben Aktionen wie bisher
 * (Freigeben, Nachbessern, Abreise/schmutzig, außer Betrieb/Service, zurück ins Inventar, Hausaufgabe), Zuteilung
 * mit Link in den Grundriss (Zuteilen gibt es nur dort), Anreisen, Mängel, Notizen. Reine Darstellung.
 */
export function SupervisorRoomDetail({
  room,
  busy,
  isDutyManager,
  onAct,
  onOpenDialog,
  thread,
}: {
  room: SupDetailRoom;
  busy: boolean;
  isDutyManager: boolean;
  onAct: (status: RoomStatus) => void;
  onOpenDialog: (kind: "rework" | "ooo" | "roomTask") => void;
  thread: ReactNode;
}) {
  const { t } = useLocale();
  const ui = ROOM_STATUS_UI[room.status];
  const outOfOrder = room.status === "OUT_OF_ORDER" || room.status === "OUT_OF_SERVICE";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-label text-text-muted">
          {t("supervisor.floorN", { floor: room.floor })} · {room.section} · {t(`roomType.${room.type}` as TKey)}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={ui} label={t(`status.${room.status}` as TKey)} />
          {room.blockReason && <Pill tone="danger">{t(`blockReason.${room.blockReason}` as TKey)}</Pill>}
        </div>
        {room.oooUntil && <p className="text-body-16 text-text-secondary">{t("supervisor.oooUntil", { date: dateTime(room.oooUntil) })}</p>}
        {room.reworkNote && room.status === "PICKUP" && <Banner tone="warning" icon="refresh" title={t("attendant.reworkNote")} detail={room.reworkNote} />}
      </div>

      <div className="grid gap-3">
        {room.status === "CLEAN" && (
          <>
            <Button icon="check" block onClick={() => onAct("INSPECTED")} disabled={busy}>
              {busy ? t("supervisor.releasing") : withoutLeadingSymbol(t("supervisor.inspectRelease"))}
            </Button>
            <Button variant="secondary" icon="refresh" block onClick={() => onOpenDialog("rework")} disabled={busy}>
              {withoutLeadingSymbol(t("supervisor.sendBackRework"))}
            </Button>
          </>
        )}
        {room.status === "INSPECTED" && (
          <Button variant="secondary" icon="log-out" block onClick={() => onAct("DIRTY")} disabled={busy}>
            {withoutLeadingSymbol(t("supervisor.setDirtyCheckout"))}
          </Button>
        )}
        {outOfOrder ? (
          <Button variant="secondary" icon="refresh" block onClick={() => onAct("DIRTY")} disabled={busy}>
            {withoutLeadingSymbol(t("supervisor.returnToInventory"))}
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" icon="wrench" className="px-4!" onClick={() => onOpenDialog("ooo")} disabled={busy}>
              {withoutLeadingSymbol(t("supervisor.setOoo"))}
            </Button>
            <Button variant="secondary" icon="x" className="px-4!" onClick={() => onAct("OUT_OF_SERVICE")} disabled={busy}>
              {withoutLeadingSymbol(t("supervisor.setOos"))}
            </Button>
          </div>
        )}
        <Button variant="secondary" icon="list" block onClick={() => onOpenDialog("roomTask")}>
          {withoutLeadingSymbol(t("supervisor.houseTaskBtn"))}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel as="h3" icon="user" title={t("supervisor.assignedAttendant")} />
        <p className="text-body-18 text-text-primary">{room.assignedLabel ?? t("supervisor.unassignedOption")}</p>
        <Link href="/floor-plan" className={cx("text-body-16 inline-flex min-h-(--size-touch-min) items-center text-accent-text underline underline-offset-4", FOCUS_RING)}>
          {t("roster.changeInFloorPlan")}
        </Link>
      </div>

      {room.arrivals.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel as="h3" icon="log-in" title={t("supervisor.expectedArrivals")} count={room.arrivals.length} />
          <ul className="flex flex-col gap-2">
            {room.arrivals.map((a, i) => (
              <li key={i} className="text-body-16 flex flex-wrap items-center gap-2 text-text-primary">
                {a.vip && <Pill tone="accent">VIP</Pill>}
                <span>{a.guestName}</span>
                {a.eta && <span className="text-text-secondary">· ETA {hhmm(a.eta)}</span>}
                {a.neededNow && <Pill tone="danger">{withoutLeadingSymbol(t("supervisor.neededNowFlag"))}</Pill>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {room.defects.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel as="h3" icon="wrench" title={t("supervisor.defectsTitle")} count={room.defects.length} />
          <ul className="flex flex-col gap-2">
            {room.defects.map((d) => (
              <li key={d.id} className="text-body-16 text-text-primary">
                <span className="text-text-secondary">{t(`defectCategory.${d.category}` as TKey)}:</span> {d.note}
                {d.workOrder && <span className="text-label ms-2 text-text-muted">[{t(`workOrderStatus.${d.workOrder.status}` as TKey)}]</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {thread}

      {isDutyManager && <p className="text-label text-center text-text-muted">{t("supervisor.dutyManagerAudit")}</p>}
    </div>
  );
}

/** Nachbessern-Gründe, die ein Supervisor am häufigsten braucht — ein Tipp statt Tippen (wie bisher). */
const REWORK_PRESETS: TKey[] = ["shared.reworkPreset1", "shared.reworkPreset2", "shared.reworkPreset3", "shared.reworkPreset4", "shared.reworkPreset5", "shared.reworkPreset6"];

/** Zurück zum Nachbessern (Status PICKUP mit Notiz) — gleiche Felder und Vorgaben wie bisher. */
export function ReworkDialog({ number, onClose, onSubmit }: { number: string; onClose: () => void; onSubmit: (note: string) => void }) {
  const { t } = useLocale();
  const [note, setNote] = useState("");
  const add = (preset: string) => setNote((n) => (n ? `${n}, ${preset.toLowerCase()}` : preset));
  return (
    <HkWindow title={t("supervisor.reworkModalTitle", { number })} subtitle={t("supervisor.reworkModalSubtitle")} onClose={onClose} dirty={note.trim() !== ""}>
      <div className="flex flex-wrap gap-2">
        {REWORK_PRESETS.map((k) => t(k)).map((p) => (
          <FilterChip key={p} onClick={() => add(p)} className="px-4!">
            + {p}
          </FilterChip>
        ))}
      </div>
      <Field multiline label={t("supervisor.reworkModalSubtitle")} value={note} onChange={(e) => setNote(e.target.value)} rows={3} autoFocus placeholder={t("supervisor.reworkPlaceholder")} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="secondary" icon="x" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button icon="refresh" onClick={() => onSubmit(note.trim())} disabled={!note.trim()}>
          {withoutLeadingSymbol(t("supervisor.sendBack"))}
        </Button>
      </div>
    </HkWindow>
  );
}

const OOO_PRESET_HOURS = [4, 12, 24, 48, 72, 168];

/** Außer Betrieb bis … (Status OUT_OF_ORDER mit `oooUntil`) — gleiche Vorgaben wie bisher. */
export function OooDialog({ number, onClose, onSubmit }: { number: string; onClose: () => void; onSubmit: (until: Date) => void }) {
  const { t } = useLocale();
  const [hours, setHours] = useState<number>(48);
  const until = new Date(Date.now() + hours * 3600_000);
  const presetLabel = (h: number) => (h < 24 ? `${h} h` : h % 24 === 0 ? `${h / 24} d` : `${h} h`);
  return (
    <HkWindow title={t("supervisor.oooModalTitle", { number })} subtitle={t("supervisor.oooModalSubtitle")} onClose={onClose}>
      <div className="grid grid-cols-3 gap-2">
        {OOO_PRESET_HOURS.map((h) => (
          <FilterChip key={h} active={hours === h} onClick={() => setHours(h)} className="px-3!">
            {presetLabel(h)}
          </FilterChip>
        ))}
      </div>
      <Field label={t("supervisor.customHours")} type="number" min={1} value={hours} onChange={(e) => setHours(Math.max(1, Number(e.target.value) || 1))} />
      <p className="text-body-16 text-text-secondary">
        {t("supervisor.backInInventory")} <strong className="text-text-primary">{dateTime(until)}</strong>
      </p>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="secondary" icon="x" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button icon="wrench" onClick={() => onSubmit(until)}>
          {withoutLeadingSymbol(t("supervisor.setOutOfOrder"))}
        </Button>
      </div>
    </HkWindow>
  );
}
