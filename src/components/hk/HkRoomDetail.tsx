"use client";

import type { ReactNode } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import { Banner, Glyph, LangChip, MarkerBadge, Pill, StatusChip } from "@/components/ui";
import { cx, FOCUS_RING } from "@/components/ui/primitives";
import { MARKER_UI } from "@/lib/ui/markers";
import { STATUS_UI } from "@/lib/ui/status";
import { hkMarkers, hkRowStatus, kindPill, langCode, type HkRoomView } from "@/lib/ui/hkHub";

/** Alles, was das Detail eines Zimmers zeigt — fertig aus Board, Tagesliste und Priorität zusammengesetzt. */
export interface HkDetailData {
  view: HkRoomView;
  /** Genauer Status-Text des Bestands (`status.<STATUS>`), z. B. „Sauber · Prüfung offen“. */
  statusKey: TKey;
  blockReasonKey?: TKey | null;
  guest: string | null;
  lang: string | null;
  pax: number | null;
  credits?: number;
  traces: { id: string; text: string; status: string }[];
  hints: { id: string; body: string }[];
  reworkNote?: string | null;
  defects: { id: string; label: string }[];
  guestRequests: { id: string; label: string }[];
  priority?: { score: number; estimatedMinutes: number; reasons: { points: number; reason: string }[] } | null;
  pauseText?: string | null;
}

/** Textlink-Aktion (≥ 48 px Tippfläche, unterstrichen, Fokusring). */
export function TextAction({ children, onClick, disabled, icon }: { children: ReactNode; onClick: () => void; disabled?: boolean; icon?: Parameters<typeof Glyph>[0]["name"] }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "press text-body-16 inline-flex min-h-(--size-touch-min) items-center gap-2 rounded-(--glass-radius-sm) px-2 text-accent-text underline underline-offset-4 disabled:opacity-40",
        FOCUS_RING,
      )}
    >
      {icon && <Glyph name={icon} size={20} />}
      {children}
    </button>
  );
}

/**
 * Inhalt des Zimmer-Details (Figma `22:67` rechts, `41:2140`): Kennzeichen, Gast „Anrede Titel Nachname“ + Personen,
 * Anreisezeit, Hinweise/Traces, danach Status-Zusätze, Pause, Nebenaktionen und Verlauf (als Slots vom Hub).
 * Reine Darstellung — Aktionen kommen als Slots/Callbacks.
 */
export function HkRoomDetail({ data, pause, actions, thread }: { data: HkDetailData; pause?: ReactNode; actions?: ReactNode; thread?: ReactNode }) {
  const { t } = useLocale();
  const v = data.view;
  const ui = hkRowStatus(v);
  const pill = kindPill(v.kind);
  const code = langCode(data.lang);
  const markers = hkMarkers(v);
  const openTraces = data.traces.filter((x) => x.status !== "DONE");
  const doneTraces = data.traces.filter((x) => x.status === "DONE");
  const hasNotes = data.traces.length > 0 || data.hints.length > 0;
  const paxText = data.pax == null ? null : data.pax === 1 ? t("lists.paxOne") : t("lists.pax", { n: data.pax });

  return (
    <div className="flex flex-col gap-4" data-testid="hk-detail">
      <div className="flex flex-wrap items-center gap-2">
        {pill && <Pill tone={pill.tone} edge={pill.edge}>{t(pill.labelKey)}</Pill>}
        {code && <LangChip code={code} />}
        {markers.map((m) => (
          <MarkerBadge key={m} marker={m} label={t(MARKER_UI[m].labelKey)} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <StatusChip status={ui} label={t(STATUS_UI[ui].labelKey)} />
        <span className="text-body-16 text-text-secondary">
          {t(data.statusKey)}
          {data.blockReasonKey && ` · ${t(data.blockReasonKey)}`}
        </span>
      </div>

      {(data.guest || paxText) && (
        <p className="text-body-16 flex items-center gap-3 text-text-primary">
          <Glyph name="user" size={22} className="shrink-0 text-text-secondary" />
          {[data.guest, paxText].filter(Boolean).join(" · ")}
        </p>
      )}
      {v.eta && (
        <p className="text-body-16 flex items-center gap-3 text-text-primary">
          <Glyph name="clock" size={22} className="shrink-0 text-text-secondary" />
          {v.early ? t("hkHub.earlyArrival", { time: v.eta }) : t("hkHub.arrivalAt", { time: v.eta })}
        </p>
      )}

      {data.pauseText && <Banner tone="warning" icon="pause" title={t("ui.status.paused")} detail={data.pauseText} />}
      {v.dnd && <Banner tone="warning" icon="moon" title={t("attendant.guestDndActive")} />}
      {data.reworkNote && <Banner tone="warning" icon="refresh" title={t("attendant.reworkNote")} detail={data.reworkNote} />}

      {hasNotes && (
        <section className="flex flex-col gap-3 border-t border-border-subtle pt-4" aria-label={t("lists.traces")}>
          <h3 className="text-body-18 flex items-center gap-3 text-text-primary">
            <Glyph name="file-text" size={22} className="text-accent-text" />
            {t("lists.traces")}
          </h3>
          <ul className="flex flex-col gap-2">
            {[...openTraces.map((x) => ({ id: x.id, text: x.text, done: false })), ...data.hints.map((h) => ({ id: h.id, text: h.body, done: false })), ...doneTraces.map((x) => ({ id: x.id, text: x.text, done: true }))].map((x) => (
              <li key={x.id} className={cx("text-body-16 flex items-start gap-3 break-words", x.done ? "text-text-muted line-through" : "text-text-secondary")}>
                <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-pill bg-accent-default" />
                {x.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.priority && data.priority.score > 0 && (
        <section className="flex flex-col gap-2 border-t border-border-subtle pt-4">
          <p className="text-label flex items-center gap-2 text-status-warning-fg">
            <Glyph name="zap" size={18} />
            {t("attendant.priorityScore", { score: data.priority.score, minutes: data.priority.estimatedMinutes })}
          </p>
          <ul className="flex flex-col gap-1">
            {data.priority.reasons.map((r, i) => (
              <li key={i} className="text-label text-text-secondary">
                <span className="text-accent-text">+{r.points}</span> {r.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.defects.length > 0 && (
        <section className="flex flex-col gap-2 border-t border-border-subtle pt-4">
          <h3 className="text-label flex items-center gap-2 text-text-muted">
            <Glyph name="wrench" size={18} className="text-status-danger-fg" />
            {t("supervisor.defectsTitle")}
          </h3>
          {data.defects.map((d) => (
            <p key={d.id} className="text-body-16 break-words text-text-secondary">{d.label}</p>
          ))}
        </section>
      )}

      {data.guestRequests.length > 0 && (
        <section className="flex flex-col gap-2 border-t border-border-subtle pt-4">
          <h3 className="text-label text-text-muted">{t("supervisor.guestRequestsTitle")}</h3>
          {data.guestRequests.map((g) => (
            <p key={g.id} className="text-body-16 text-text-secondary">{g.label}</p>
          ))}
        </section>
      )}

      {pause}
      {actions && <div className="flex flex-wrap items-center gap-x-4 gap-y-1">{actions}</div>}
      {thread && <section className="flex flex-col gap-3 border-t border-border-subtle pt-4">{thread}</section>}
    </div>
  );
}
