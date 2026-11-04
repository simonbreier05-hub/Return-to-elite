"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { hhmm } from "@/lib/i18n/format";
import { CC_FILTER_LABEL, ccFilterCounts, ccKpis, matchesCcFilter, PHASE_PILL, phaseOf, sortExcursions, type CcFilter, type ExcursionView } from "@/lib/ui/conciergeHub";
import { HkWindow } from "@/components/hk/HkParts";
import { TextAction } from "@/components/hk/HkRoomDetail";
import { DetailContainer } from "@/components/shell/DetailContainer";
import type { Breakpoint } from "@/components/shell/useBreakpoint";
import { Banner, Button, Field, Pill } from "@/components/ui";
import { DETAIL_FIT, DetailLine, RoleHub } from "./RoleHub";

export interface NewExcursionInput {
  roomNumber: string;
  guestName: string;
  start: string;
  end: string;
  note: string;
}

export interface ConciergeHubProps {
  excursions: ExcursionView[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (input: NewExcursionInput) => Promise<string | null>;
  onOpenRoom: (number: string) => void;
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  notices?: ReactNode;
  /** Bezugszeit (Tests/Demo); Standard jetzt. */
  now?: number;
  detailMode?: Breakpoint;
  newOpen?: boolean;
}

/**
 * Concierge-Hub „Glas & Premium“ (Figma `36:2108`): Ausflüge/Außer-Haus-Fenster als Liste mit Zustand aus den Zeiten
 * (geplant, Gast außer Haus, kommt bald zurück, zurück — es gibt kein Status-Feld), Detail, Fenster „Ausflug erfassen“.
 * Bearbeiten/Löschen gibt es nicht (keine API). Reine Darstellung — Daten von `app/concierge/view.tsx`.
 */
export function ConciergeHub(p: ConciergeHubProps) {
  const { t } = useLocale();
  const [filter, setFilter] = useState<CcFilter>("all");
  const [newOpen, setNewOpen] = useState(!!p.newOpen);
  const now = p.now ?? Date.now();

  const sorted = useMemo(() => sortExcursions(p.excursions, now), [p.excursions, now]);
  const counts = ccFilterCounts(sorted, now);
  const active: CcFilter = counts.some((c) => c.filter === filter) ? filter : "all";
  const visible = sorted.filter((e) => matchesCcFilter(e, active, now));
  const k = ccKpis(p.excursions, now);
  const unknown = t("roleHub.unknown");
  const span = (e: ExcursionView) => [e.startsAt ? hhmm(e.startsAt) : "?", e.endsAt ? hhmm(e.endsAt) : "?"].join("–");

  const sel = p.selectedId ? p.excursions.find((e) => e.id === p.selectedId) ?? null : null;

  const detail = sel && (() => {
    const pill = PHASE_PILL[phaseOf(sel, now)];
    return (
      <DetailContainer open forceMode={p.detailMode} className={DETAIL_FIT} onClose={() => p.onSelect(null)} title={sel.room.number ? t("hkHub.roomTitle", { n: sel.room.number }) : unknown}>
        <div className="flex flex-col gap-4" data-testid="cc-detail">
          <div className="flex flex-wrap gap-2">
            <Pill tone={pill.tone}>{t(pill.labelKey)}</Pill>
          </div>
          <DetailLine icon="user">{sel.guest ?? t("concierge.guestFallback")}</DetailLine>
          <DetailLine icon="clock">{t("roleHub.outWindow", { from: sel.startsAt ? hhmm(sel.startsAt) : "?", to: sel.endsAt ? hhmm(sel.endsAt) : "?" })}</DetailLine>
          {sel.note && <DetailLine icon="file-text">{sel.note}</DetailLine>}
          <p className="text-label text-text-muted">{t("concierge.outOfHouseHint")}</p>
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
        testId="concierge-hub"
        kpis={[
          { key: "total", label: t("roleHub.excursions"), value: k.total, icon: "calendar-days" },
          { key: "out", label: t("roleHub.guestOut"), value: k.out, icon: "log-out" },
          { key: "soon", label: t("roleHub.endingSoon"), value: k.endingSoon, icon: "clock", warm: k.endingSoon > 0 },
          { key: "planned", label: t("roleHub.planned"), value: k.planned, icon: "calendar-days" },
        ]}
        listTitle={t("concierge.todaysWindows")}
        listIcon="calendar-days"
        listAction={
          <Button variant="secondary" icon="calendar-days" onClick={() => setNewOpen(true)} className="min-h-(--size-touch-min)! px-5!">
            {t("concierge.logExcursion")}
          </Button>
        }
        filters={counts.map((c) => ({ id: c.filter, label: t(CC_FILTER_LABEL[c.filter]), count: c.count }))}
        activeFilter={active}
        onFilter={(id) => setFilter(id as CcFilter)}
        rows={visible.map((e) => {
          const pill = PHASE_PILL[phaseOf(e, now)];
          return {
            key: e.id,
            icon: "calendar-days",
            title: `${e.note ?? t("roleHub.excursion")} · ${e.startsAt ? hhmm(e.startsAt) : "?"}`,
            subtitle: `${e.guest ?? t("concierge.guestFallback")} (${e.room.number ?? unknown})`,
            pill: { label: t(pill.labelKey), tone: pill.tone },
            meta: span(e),
            done: phaseOf(e, now) === "back",
          };
        })}
        selectedKey={p.selectedId}
        onSelect={(id) => p.onSelect(id)}
        detail={detail}
        detailOpen={!!sel}
        notices={p.notices}
        loading={p.loading}
        loadError={p.loadError}
        onRetry={p.onRetry}
        emptyText={t("concierge.noExcursions")}
        selectHint={t("roleHub.selectHint")}
      />
      {newOpen && <NewExcursionWindow onClose={() => setNewOpen(false)} onCreate={p.onCreate} />}
    </>
  );
}

function NewExcursionWindow({ onClose, onCreate }: { onClose: () => void; onCreate: (input: NewExcursionInput) => Promise<string | null> }) {
  const { t } = useLocale();
  const [f, setF] = useState<NewExcursionInput>({ roomNumber: "", guestName: "", start: "", end: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = Object.values(f).some(Boolean);
  const submit = async () => {
    setBusy(true);
    setError(null);
    const err = await onCreate(f);
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };
  return (
    <HkWindow title={t("concierge.logExcursion")} subtitle={t("concierge.outOfHouseHint")} onClose={onClose} dirty={dirty}>
      <Field label={t("concierge.roomNumber")} inputMode="numeric" value={f.roomNumber} onChange={(e) => setF({ ...f, roomNumber: e.target.value })} />
      <Field label={`${t("concierge.guestOptional")} (${t("common.optional")})`} hint={t("roleHub.guestNameHint")} value={f.guestName} onChange={(e) => setF({ ...f, guestName: e.target.value })} />
      <div className="grid grid-cols-2 gap-4">
        <Field label={t("concierge.outFrom")} type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        <Field label={t("concierge.backAt")} type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
      </div>
      <Field label={`${t("concierge.noteOptional")} (${t("common.optional")})`} placeholder={t("concierge.notePlaceholder")} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      {error && (
        <div role="alert">
          <Banner tone="warning" icon="triangle-alert" title={error} />
        </div>
      )}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="secondary" icon="x" onClick={onClose}>{t("common.cancel")}</Button>
        <Button icon="check" onClick={submit} disabled={busy || !f.roomNumber.trim() || !f.start || !f.end}>
          {busy ? t("common.saving") : t("concierge.logExcursionBtn")}
        </Button>
      </div>
    </HkWindow>
  );
}
