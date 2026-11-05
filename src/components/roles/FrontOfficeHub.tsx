"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import { hhmm } from "@/lib/i18n/format";
import { foFilterCounts, foKpis, foPill, FO_FILTER_LABEL, isOverdue, isReady, matchesFoFilter, sortArrivals, type ArrivalView, type FoFilter } from "@/lib/ui/frontOfficeHub";
import { ROOM_STATUS_UI } from "@/lib/ui/status";
import { HkWindow } from "@/components/hk/HkParts";
import { TextAction } from "@/components/hk/HkRoomDetail";
import { DetailContainer } from "@/components/shell/DetailContainer";
import type { Breakpoint } from "@/components/shell/useBreakpoint";
import { Banner, Button, Field, FilterChip, StatusChip } from "@/components/ui";
import { DETAIL_FIT, DetailLine, RoleHub } from "./RoleHub";

/** Änderung aus dem Detail: nur Felder, die `PATCH /api/arrivals/[id]` kennt. */
export interface ArrivalPatch {
  eta?: string;
  vip?: boolean;
  earlyCheckIn?: boolean;
  neededNow?: boolean;
  status?: "CHECKED_IN";
}
export interface NewArrivalInput {
  roomNumber: string;
  guestName: string;
  eta: string;
  vip: boolean;
  earlyCheckIn: boolean;
  neededNow: boolean;
}

export interface FrontOfficeHubProps {
  arrivals: ArrivalView[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** `eta` kommt als „HH:MM“; der Aufrufer rechnet es wie bisher in einen Zeitpunkt um. */
  onSave: (a: ArrivalView, patch: ArrivalPatch) => Promise<boolean>;
  onCreate: (input: NewArrivalInput) => Promise<string | null>;
  onOpenRoom: (number: string) => void;
  busyId: string | null;
  actionError: string | null;
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  notices?: ReactNode;
  /** Uhrzeit „HH:MM“ einer ETA für das Eingabefeld (wie bisher Gerätezeit). */
  etaInput: (iso: string | null) => string;
  detailMode?: Breakpoint;
  /** Nur Demo: Fenster „Neue Anreise“ offen starten. */
  newOpen?: boolean;
}

/**
 * Front-Office-Hub „Glas & Premium“ (Figma `36:1839`): Kennzahlen, Anreisen-Liste mit Zimmerstatus, Detail
 * „Anreise bearbeiten“ (ETA, VIP/Früh/Sofort, Check-in nur bei freigegebenem Zimmer), Fenster „Neue Anreise“.
 * Gast nur als „Anrede Titel Nachname“. Reine Darstellung — Daten und Wege von `app/front-office/view.tsx`.
 */
export function FrontOfficeHub(p: FrontOfficeHubProps) {
  const { t } = useLocale();
  const [filter, setFilter] = useState<FoFilter>("all");
  const [newOpen, setNewOpen] = useState(!!p.newOpen);

  const cap = (x: string) => x.charAt(0).toLocaleUpperCase() + x.slice(1);
  const sorted = useMemo(() => sortArrivals(p.arrivals), [p.arrivals]);
  const counts = useMemo(() => foFilterCounts(sorted), [sorted]);
  const active: FoFilter = counts.some((c) => c.filter === filter) ? filter : "all";
  const visible = sorted.filter((a) => matchesFoFilter(a, active));
  const k = foKpis(p.arrivals);
  const unknown = t("roleHub.unknown");
  const roomStatusLabel = (a: ArrivalView) => (a.room.status ? t(`status.${a.room.status}` as TKey) : unknown);

  const sel = p.selectedId ? p.arrivals.find((a) => a.id === p.selectedId) ?? null : null;

  return (
    <>
      <RoleHub
        testId="front-office-hub"
        kpis={[
          { key: "expected", label: t("frontOffice.arrivals"), value: k.expected, icon: "log-in" },
          { key: "early", label: t("frontOffice.early"), value: k.early, icon: "clock", warm: k.early > 0 },
          { key: "vip", label: t("frontOffice.vip"), value: k.vip, icon: "star" },
          { key: "ready", label: t("roleHub.readyKpi"), value: `${k.ready} / ${k.expected}`, icon: "check" },
        ]}
        listTitle={t("frontOffice.arrivals")}
        listIcon="log-in"
        listAction={
          <Button variant="secondary" icon="log-in" onClick={() => setNewOpen(true)} className="min-h-(--size-touch-min)! px-5!">
            {t("roleHub.newArrival")}
          </Button>
        }
        filters={counts.map((c) => ({ id: c.filter, label: cap(t(FO_FILTER_LABEL[c.filter])), count: c.count }))}
        activeFilter={active}
        onFilter={(id) => setFilter(id as FoFilter)}
        rows={visible.map((a) => {
          const pill = foPill(a);
          return {
            key: a.id,
            icon: "log-in",
            title: `${a.room.number ?? unknown} · ${a.guest ?? unknown}`,
            subtitle: [roomStatusLabel(a), isOverdue(a) ? t("roleHub.etaPassed") : null].filter(Boolean).join(" · "),
            pill: pill ? { label: cap(t(pill.labelKey)), tone: pill.tone } : undefined,
            meta: a.eta ? hhmm(a.eta) : undefined,
            done: a.status === "CHECKED_IN",
          };
        })}
        selectedKey={p.selectedId}
        onSelect={(id) => p.onSelect(id)}
        detail={sel && <ArrivalDetail key={sel.id} a={sel} {...p} roomStatusLabel={roomStatusLabel(sel)} />}
        detailOpen={!!sel}
        notices={p.notices}
        loading={p.loading}
        loadError={p.loadError}
        onRetry={p.onRetry}
        emptyText={t("roleHub.noArrivals")}
        selectHint={t("roleHub.selectHint")}
        below={<p className="text-label text-text-muted">{t("frontOffice.cannotChangeStatus")}</p>}
      />
      {newOpen && <NewArrivalWindow onClose={() => setNewOpen(false)} onCreate={p.onCreate} />}
    </>
  );
}

function ArrivalDetail({ a, roomStatusLabel, ...p }: FrontOfficeHubProps & { a: ArrivalView; roomStatusLabel: string }) {
  const { t } = useLocale();
  const initialEta = p.etaInput(a.eta);
  const [eta, setEta] = useState(initialEta);
  const [vip, setVip] = useState(a.vip);
  const [early, setEarly] = useState(a.earlyCheckIn);
  const [now, setNow] = useState(a.neededNow);
  const patch: ArrivalPatch = {
    ...(eta && eta !== initialEta ? { eta } : {}),
    ...(vip !== a.vip ? { vip } : {}),
    ...(early !== a.earlyCheckIn ? { earlyCheckIn: early } : {}),
    ...(now !== a.neededNow ? { neededNow: now } : {}),
  };
  const dirty = Object.keys(patch).length > 0;
  const busy = p.busyId === a.id;
  const ready = isReady(a);
  const expected = a.status === "EXPECTED";

  return (
    <DetailContainer
      open
      forceMode={p.detailMode}
      className={DETAIL_FIT}
      onClose={() => p.onSelect(null)}
      title={a.room.number ? t("hkHub.roomTitle", { n: a.room.number }) : t("roleHub.editArrival")}
      dirty={dirty}
      footer={
        <div className="flex flex-col gap-3">
          <Button icon="check" block onClick={() => void p.onSave(a, patch)} disabled={!dirty || busy}>
            {busy ? "…" : t("common.save")}
          </Button>
          {expected && (
            <Button variant="secondary" icon="log-in" block onClick={() => void p.onSave(a, { status: "CHECKED_IN" })} disabled={!ready || busy || dirty}>
              {t("frontOffice.checkIn")}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4" data-testid="fo-detail">
        <p className="text-section text-text-muted">{t("roleHub.editArrival")}</p>
        <DetailLine icon="user">{a.guest ?? t("roleHub.unknown")}</DetailLine>
        <DetailLine icon="bed-single">
          {t("hkHub.roomTitle", { n: a.room.number ?? "—" })}
          <span className="block">
            {a.room.status ? <StatusChip status={ROOM_STATUS_UI[a.room.status]} label={roomStatusLabel} /> : <span className="text-text-secondary">{roomStatusLabel}</span>}
          </span>
        </DetailLine>
        {!expected && <Banner tone="info" icon="check" title={t("frontOffice.checkedIn").charAt(0).toLocaleUpperCase() + t("frontOffice.checkedIn").slice(1)} />}
        {expected && !ready && <Banner tone="warning" icon="clock" title={t("frontOffice.roomNotReady")} />}
        {expected && (
          <>
            <Field label={t("frontOffice.eta")} type="time" value={eta} onChange={(e) => setEta(e.target.value)} />
            <div role="group" aria-label={t("frontOffice.flags")} className="flex flex-wrap gap-2">
              <FilterChip active={vip} onClick={() => setVip((v) => !v)}>{t("frontOffice.vip")}</FilterChip>
              <FilterChip active={early} onClick={() => setEarly((v) => !v)}>{t("frontOffice.early")}</FilterChip>
              <FilterChip active={now} onClick={() => setNow((v) => !v)}>{t("frontOffice.neededNow")}</FilterChip>
            </div>
          </>
        )}
        {p.actionError && (
          <div role="alert">
            <Banner tone="warning" icon="triangle-alert" title={p.actionError} />
          </div>
        )}
        {a.room.number && (
          <TextAction icon="bed-single" onClick={() => p.onOpenRoom(a.room.number!)}>
            {t("lists.hmOpenRoom", { n: a.room.number })}
          </TextAction>
        )}
      </div>
    </DetailContainer>
  );
}

function NewArrivalWindow({ onClose, onCreate }: { onClose: () => void; onCreate: (input: NewArrivalInput) => Promise<string | null> }) {
  const { t } = useLocale();
  const [f, setF] = useState<NewArrivalInput>({ roomNumber: "", guestName: "", eta: "", vip: false, earlyCheckIn: false, neededNow: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = !!(f.roomNumber || f.guestName || f.eta);
  const submit = async () => {
    setBusy(true);
    setError(null);
    const err = await onCreate(f);
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };
  return (
    <HkWindow title={t("roleHub.newArrival")} onClose={onClose} dirty={dirty}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("frontOffice.roomNumber")} inputMode="numeric" value={f.roomNumber} onChange={(e) => setF({ ...f, roomNumber: e.target.value })} />
        <Field label={t("frontOffice.eta")} type="time" value={f.eta} onChange={(e) => setF({ ...f, eta: e.target.value })} />
      </div>
      <Field label={t("frontOffice.guestName")} hint={t("roleHub.guestNameHint")} value={f.guestName} onChange={(e) => setF({ ...f, guestName: e.target.value })} />
      <div role="group" aria-label={t("frontOffice.flags")} className="flex flex-wrap gap-2">
        <FilterChip active={f.vip} onClick={() => setF({ ...f, vip: !f.vip })}>{t("frontOffice.vip")}</FilterChip>
        <FilterChip active={f.earlyCheckIn} onClick={() => setF({ ...f, earlyCheckIn: !f.earlyCheckIn })}>{t("frontOffice.earlyCheckIn")}</FilterChip>
        <FilterChip active={f.neededNow} onClick={() => setF({ ...f, neededNow: !f.neededNow })}>{t("frontOffice.neededNow")}</FilterChip>
      </div>
      {error && (
        <div role="alert">
          <Banner tone="warning" icon="triangle-alert" title={error} />
        </div>
      )}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="secondary" icon="x" onClick={onClose}>{t("common.cancel")}</Button>
        <Button icon="check" onClick={submit} disabled={busy || !f.roomNumber.trim() || !f.guestName.trim()}>
          {busy ? t("common.saving") : t("frontOffice.create")}
        </Button>
      </div>
    </HkWindow>
  );
}
