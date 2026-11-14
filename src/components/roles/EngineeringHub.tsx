"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import { hhmm } from "@/lib/i18n/format";
import {
  ENG_FILTER_LABEL,
  engFilterCounts,
  engKpis,
  matchesEngFilter,
  needsConfirm,
  NEXT_STEP,
  sortWorkOrders,
  sourceOf,
  STATUS_PILL,
  type EngFilter,
  type WorkOrderView,
} from "@/lib/ui/engineeringHub";
import { pillTone } from "@/lib/ui/pill-tone";
import type { PauseInfo } from "@/components/PauseControl";
import ImageLightbox from "@/components/ImageLightbox";
import { HkNoteThread } from "@/components/hk/HkParts";
import { TextAction } from "@/components/hk/HkRoomDetail";
import { DetailContainer } from "@/components/shell/DetailContainer";
import type { Breakpoint } from "@/components/shell/useBreakpoint";
import { GlassDialog } from "@/components/shell/GlassDialog";
import { Banner, Button, Field, Pill } from "@/components/ui";
import TwoTapButton from "@/components/TwoTapButton";
import { DETAIL_FIT, DetailLine, RoleHub } from "./RoleHub";
import { RolePause } from "./RolePause";

export interface EngineeringHubProps {
  orders: WorkOrderView[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Nächster Schritt (gleicher PATCH wie bisher); „Erledigt“ kommt erst nach dem Bestätigungsdialog hier an. */
  /** Betrieb L2 (Punkt 7): beim „Erledigt“ optional die Notiz aus dem Bestätigungsdialog (als Nachricht am Auftrag). */
  onAdvance: (wo: WorkOrderView, note?: string) => void;
  /** Betrieb L2 (Punkt 7): Zimmer außer Betrieb setzen (bis `untilIso`). */
  onSetOutOfOrder?: (roomId: string, untilIso: string) => void;
  busyId: string | null;
  actionError: string | null;
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  onPauseChanged: (id: string, pause: PauseInfo | null) => void;
  onOpenRoom: (number: string) => void;
  notices?: ReactNode;
  /** Nur Demo: Bestätigungsdialog für diesen Auftrag offen starten. */
  confirmPreviewId?: string;
  /** Nur Tests/Demo: Detail-Darstellung erzwingen. */
  detailMode?: Breakpoint;
}

/**
 * Techniker-Hub „Glas & Premium“ (Figma `36:1351`, Dialog `36:2364`): Kennzahlen, Auftragsliste, Detail mit
 * Hauptknopf (nächster Schritt), Pause, Notizen/Nachrichten am Auftrag. Reine Darstellung — Daten von `app/engineering/view.tsx`.
 * Fehlende Angaben (Melder, Zimmer, Kategorie) zeigen „Unbekannt“ statt die Ansicht abstürzen zu lassen.
 */
export function EngineeringHub(p: EngineeringHubProps) {
  const { t } = useLocale();
  const [filter, setFilter] = useState<EngFilter>("all");
  const [confirmFor, setConfirmFor] = useState<WorkOrderView | null>(() => p.orders.find((o) => o.id === p.confirmPreviewId) ?? null);
  const [doneNote, setDoneNote] = useState("");
  const [oooUntil, setOooUntil] = useState("");

  const sorted = useMemo(() => sortWorkOrders(p.orders), [p.orders]);
  const counts = useMemo(() => engFilterCounts(sorted), [sorted]);
  const active: EngFilter = counts.some((c) => c.filter === filter) ? filter : "all";
  const visible = sorted.filter((v) => matchesEngFilter(v, active));
  const k = engKpis(p.orders);
  const unknown = t("roleHub.unknown");

  const roomLabel = (v: WorkOrderView) => (v.room.number ? t("hkHub.earlyRooms", { rooms: v.room.number }) : unknown);
  const categoryLabel = (v: WorkOrderView) => (v.category ? t(`defectCategory.${v.category}` as TKey) : unknown);
  const reporterLabel = (v: WorkOrderView) => (sourceOf(v) === "guest" ? t("engineering.sourceGuest") : v.reporter.name ?? unknown);
  const pillOf = (v: WorkOrderView) => ({ label: t(STATUS_PILL[v.status].labelKey), tone: STATUS_PILL[v.status].tone });

  const sel = p.selectedId ? p.orders.find((o) => o.id === p.selectedId) ?? null : null;

  const step = (v: WorkOrderView) => {
    const next = NEXT_STEP[v.status];
    if (!next) return;
    if (needsConfirm(next.to)) setConfirmFor(v);
    else p.onAdvance(v);
  };

  const detail = sel && (() => {
    const next = NEXT_STEP[sel.status];
    const source = sourceOf(sel);
    return (
      <DetailContainer
        open
        forceMode={p.detailMode}
        className={DETAIL_FIT}
        onClose={() => p.onSelect(null)}
        title={sel.room.number ? t("hkHub.roomTitle", { n: sel.room.number }) : unknown}
        footer={
          next ? (
            <Button icon={next.icon} block onClick={() => step(sel)} disabled={p.busyId === sel.id}>
              {p.busyId === sel.id ? "…" : t(next.labelKey)}
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-4" data-testid="eng-detail">
          <div className="flex flex-wrap gap-2">
            <Pill tone={STATUS_PILL[sel.status].tone}>{t(STATUS_PILL[sel.status].labelKey)}</Pill>
            {source !== "other" && <Pill tone={pillTone(source)}>{source === "guest" ? t("engineering.sourceGuest") : t("department.housekeeping")}</Pill>}
          </div>
          <DetailLine icon="wrench">
            {sel.note || categoryLabel(sel)}
            {sel.note && <span className="block text-text-secondary">{categoryLabel(sel)}</span>}
          </DetailLine>
          {sel.createdAt && <DetailLine icon="clock">{t("roleHub.reportedAt", { time: hhmm(sel.createdAt) })}</DetailLine>}
          <DetailLine icon="user">{t("engineering.reportedBy", { name: reporterLabel(sel) })}</DetailLine>
          {sel.assignedName && <DetailLine icon="users">{t("engineering.assignedTo", { name: sel.assignedName })}</DetailLine>}
          {sel.photoPath && <ImageLightbox src={sel.photoPath} alt={t("shared.defectPhoto")} className="max-h-40 rounded-(--glass-radius-sm) object-cover" />}
          {p.actionError && (
            <div role="alert">
              <Banner tone="warning" icon="triangle-alert" title={p.actionError} />
            </div>
          )}
          {sel.room.id && <HkNoteThread key={sel.id} roomId={sel.room.id} initialNotes={[]} task={{ type: "WORKORDER", id: sel.id }} />}
          {sel.status !== "RESOLVED" && <RolePause targetType="WORKORDER" targetId={sel.id} pause={sel.pause} onChanged={(pz) => p.onPauseChanged(sel.id, pz)} />}
          {/* Betrieb L2 (Punkt 7): Technik darf das Zimmer außer Betrieb setzen — mit Endzeit, zweiter Tipp speichert */}
          {sel.room.id && p.onSetOutOfOrder && sel.status !== "RESOLVED" && (
            <div className="flex flex-wrap items-end gap-3" data-testid="eng-ooo">
              <div className="w-56"><Field label={t("engineering.oooUntil")} type="datetime-local" value={oooUntil} onChange={(e) => setOooUntil(e.target.value)} /></div>
              <TwoTapButton disabled={!oooUntil || p.busyId === sel.id} onConfirm={() => { p.onSetOutOfOrder!(sel.room.id!, new Date(oooUntil).toISOString()); setOooUntil(""); }}>{t("engineering.setOoo")}</TwoTapButton>
            </div>
          )}
          {sel.room.number && (
            <TextAction icon="bed-single" onClick={() => p.onOpenRoom(sel.room.number!)}>
              {t("lists.hmOpenRoom", { n: sel.room.number })}
            </TextAction>
          )}
        </div>
      </DetailContainer>
    );
  })();

  return (
    <>
      <RoleHub
        testId="engineering-hub"
        kpis={[
          { key: "open", label: t("hkHub.kpiOpen"), value: k.open, icon: "circle", warm: false },
          { key: "inProgress", label: t("hkHub.kpiInProgress"), value: k.inProgress, icon: "refresh" },
          { key: "doneToday", label: t("roleHub.doneToday"), value: k.doneToday, icon: "check" },
          { key: "guest", label: t("roleHub.fromGuest"), value: k.guestOpen, icon: "triangle-alert", warm: k.guestOpen > 0 },
        ]}
        listTitle={t("engineering.workOrders")}
        listIcon="wrench"
        filters={counts.map((c) => ({ id: c.filter, label: t(ENG_FILTER_LABEL[c.filter]), count: c.count }))}
        activeFilter={active}
        onFilter={(id) => setFilter(id as EngFilter)}
        rows={visible.map((v) => ({
          key: v.id,
          icon: "wrench",
          title: `${roomLabel(v)} · ${v.note || categoryLabel(v)}`,
          subtitle: t("engineering.reportedBy", { name: reporterLabel(v) }),
          pill: pillOf(v),
          meta: v.createdAt ? hhmm(v.createdAt) : undefined,
          done: v.status === "RESOLVED",
        }))}
        selectedKey={p.selectedId}
        onSelect={(id) => p.onSelect(id)}
        detail={detail}
        detailOpen={!!sel}
        notices={p.notices}
        loading={p.loading}
        loadError={p.loadError}
        onRetry={p.onRetry}
        emptyText={t("engineering.noOrders")}
        selectHint={t("roleHub.selectHint")}
      />
      <GlassDialog
        open={!!confirmFor}
        title={t("roleHub.confirmDoneTitle")}
        message={confirmFor ? `${confirmFor.room.number ? t("hkHub.roomTitle", { n: confirmFor.room.number }) : unknown} · ${confirmFor.note || categoryLabel(confirmFor)}` : undefined}
        confirmLabel={t("roleHub.confirm")}
        busy={!!confirmFor && p.busyId === confirmFor.id}
        onCancel={() => setConfirmFor(null)}
        onConfirm={() => {
          if (confirmFor) p.onAdvance(confirmFor, doneNote.trim() || undefined);
          setDoneNote("");
          setConfirmFor(null);
        }}
      >
        {t("roleHub.doneConfirmHint")}
        {/* Betrieb L2 (Punkt 7): Notiz zum Erledigen (optional) — landet als Nachricht am Auftrag, nie in Logbuch/Meldung */}
        <div className="mt-3">
          <Field label={t("engineering.doneNote")} value={doneNote} maxLength={500} onChange={(e) => setDoneNote(e.target.value)} />
        </div>
      </GlassDialog>
    </>
  );
}
