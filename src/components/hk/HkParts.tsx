"use client";

import { useId, useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import { BLOCK_REASONS, DEFECT_CATEGORIES, PAUSE_REASONS, type PauseTarget } from "@/lib/domain";
import { hhmm } from "@/lib/i18n/format";
import { notificationText, notificationTypeLabel } from "@/lib/i18n/notificationText";
import { CATEGORIES } from "@/lib/workdata/stats";
import { Banner, Button, Field, GlassCard, Glyph, ListRow, ListRowCompact, SectionLabel } from "@/components/ui";
import { errorText } from "@/lib/i18n/errorText";
import { cx, FOCUS_RING } from "@/components/ui/primitives";
import { GlassIconButton } from "@/components/shell/GlassIconButton";
import { Overlay } from "@/components/shell/Overlay";
import { useNoteThread, useRoleLabel, type ThreadNote } from "@/components/NoteThread";
import { reasonKey, usePauseAction, type PauseInfo } from "@/components/PauseControl";
import { useRoleNotifications } from "@/components/NotificationsPanel";
import { useMyWorkData } from "@/components/lists/MyWorkData";
import type { OfflineState } from "@/components/useOfflineQueue";

/* Glas-Darstellungen der Housekeeper-Teile (D2). Logik kommt aus denselben Hooks wie die alten Bausteine. */

const chipBtn = (active: boolean) =>
  cx(
    "press text-body-16 min-h-(--size-touch-min) rounded-pill border px-4",
    active ? "bg-champagne border-border-accent text-text-on-accent" : "glass-fill border-border-subtle text-text-primary",
    FOCUS_RING,
  );

/** Pausieren (mit festem Grund) — Fortsetzen ist der Hauptknopf des Details. Gleiches Verhalten wie `PauseControl`. */
export function HkPauseControl({ targetType, targetId, canPause, onChanged }: { targetType: PauseTarget; targetId: string; canPause: boolean; onChanged: (p: PauseInfo | null) => void }) {
  const { t } = useLocale();
  const { asking, setAsking, busy, error, send } = usePauseAction(targetType, targetId, onChanged);
  if (!canPause) return null;
  return (
    <div className="flex flex-col gap-3" data-testid="pause-control">
      {!asking ? (
        <Button variant="secondary" icon="pause" block onClick={() => setAsking(true)} disabled={busy}>
          {t("work.pause")}
        </Button>
      ) : (
        <div role="group" aria-label={t("work.reasonPrompt")} className="flex flex-col gap-3 rounded-(--glass-radius-md) bg-status-warning-bg p-4">
          <p className="text-body-16 text-text-primary">{t("work.reasonPrompt")}</p>
          <div className="grid grid-cols-2 gap-2">
            {PAUSE_REASONS.map((r) => (
              <button key={r} type="button" disabled={busy} onClick={() => send("pause", r)} className={chipBtn(false)}>
                {t(reasonKey(r))}
              </button>
            ))}
            <button type="button" disabled={busy} onClick={() => send("pause", null)} className={chipBtn(false)}>
              {t("work.noReason")}
            </button>
            <button type="button" disabled={busy} onClick={() => setAsking(false)} className={cx("text-body-16 min-h-(--size-touch-min) text-text-secondary underline", FOCUS_RING)}>
              {t("work.cancel")}
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-body-16 text-status-danger-fg">{error}</p>}
    </div>
  );
}

/** Notizen und Nachrichten am Zimmer (gleiche API wie `NoteThread`). */
export function HkNoteThread(props: { roomId: string; initialNotes: ThreadNote[]; onNoteAdded?: (n: ThreadNote) => void; onNoteUpdated?: (n: ThreadNote) => void; task?: { type: PauseTarget; id: string } }) {
  const { t } = useLocale();
  const roleLabel = useRoleLabel();
  const id = useId();
  const th = useNoteThread(props);
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel as="h3" icon="message" title={t("supervisor.notesTitle")} count={th.notes.filter((n) => n.status === "OPEN").length || undefined} />
      {th.outOfScope && th.notes.some((n) => n.kind === "MESSAGE") && <Banner tone="warning" title={t("work.outOfScopeHint")} />}
      {th.notes.length === 0 && <p className="text-body-16 text-text-muted">{t("work.noNotes")}</p>}
      <ul className="flex flex-col gap-2">
        {th.notes.map((n) => {
          const isMessage = n.kind === "MESSAGE";
          return (
            <li key={n.id} className={cx("flex flex-col gap-1 rounded-(--glass-radius-sm) bg-surface-card-raised p-3", isMessage && "border-s-4 border-accent-default")}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-label text-text-muted">
                  {isMessage && <span className="me-2 text-accent-text">{t("work.message")}</span>}
                  {isMessage && th.outOfScope && <span className="me-2 text-status-warning-fg">{t("work.outOfScope")}</span>}
                  <span className="text-text-secondary">{n.author?.name ?? "—"}</span> ({roleLabel(n.author?.role ?? "")}) · {hhmm(n.createdAt)}
                </span>
                <button
                  type="button"
                  onClick={() => th.toggleStatus(n)}
                  disabled={th.togglingId === n.id}
                  className={cx("text-label min-h-(--size-touch-min) shrink-0 rounded-pill px-3 text-accent-text underline disabled:opacity-40", FOCUS_RING)}
                >
                  {th.togglingId === n.id ? "…" : n.status === "OPEN" ? t("work.markDone") : t("work.reopen")}
                </button>
              </div>
              <p className={cx("text-body-16 break-words", n.status === "DONE" ? "text-text-muted" : "text-text-primary")}>{n.body}</p>
            </li>
          );
        })}
      </ul>
      {props.task && th.canMessage && (
        <div role="radiogroup" aria-label={t("work.message")} className="flex flex-wrap gap-2">
          {([true, false] as const).map((m) => (
            <button key={String(m)} type="button" role="radio" aria-checked={th.asMessage === m} onClick={() => th.setAsMessage(m)} className={chipBtn(th.asMessage === m)}>
              {m ? t("work.asMessage") : t("work.asNote")}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <Field
          id={`${id}-note`}
          label={th.messageMode ? t("work.message") : t("supervisor.notesTitle")}
          className="min-w-0 flex-1"
          value={th.noteBody}
          onChange={(e) => th.setNoteBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && th.addNote()}
          placeholder={th.messageMode ? t("work.messagePlaceholder") : t("work.notePlaceholder")}
          maxLength={2000}
        />
        <Button variant="secondary" className="min-h-(--size-touch-min)! px-5!" onClick={th.addNote} disabled={th.savingNote || !th.noteBody.trim()}>
          {th.savingNote ? "…" : t("work.send")}
        </Button>
      </div>
    </div>
  );
}

/** Meldungen der eigenen Rolle direkt im Hub (wie bisher `NotificationsPanel`), neueste zuerst. */
export function HkNotifications({ compact }: { compact: boolean }) {
  const { t, fmt } = useLocale();
  const { notifications, unread, ackAll } = useRoleNotifications("room_attendant");
  if (notifications.length === 0) return null;
  const Row = compact ? ListRowCompact : ListRow;
  return (
    <GlassCard as="section" aria-label={t("appShell.notifications")} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel icon="bell" title={t("appShell.notifications")} count={unread || undefined} />
        {unread > 0 && (
          <button type="button" onClick={ackAll} className={cx("text-label min-h-(--size-touch-min) px-2 text-accent-text underline", FOCUS_RING)}>
            {t("appShell.markAllRead")}
          </button>
        )}
      </div>
      <div className="max-h-80 overflow-y-auto">
        {notifications.slice(0, 20).map((n) => (
          <Row
            key={n.id}
            icon={n.level === "critical" ? "triangle-alert" : n.level === "warning" ? "zap" : "bell"}
            title={notificationText(n, t)}
            subtitle={`${notificationTypeLabel(n.type, t)} · ${fmt.time(n.createdAt)}`}
            state={n.acknowledged ? "done" : "default"}
          />
        ))}
      </div>
    </GlassCard>
  );
}

/** Offline-Warteschlange (wie `OfflineBar`): was noch wartet, was abgelehnt wurde. */
export function HkOfflineBar({ state }: { state: OfflineState }) {
  const { t } = useLocale();
  const { online, pending, rejected, dismissRejected, flush } = state;
  if (online && pending.length === 0 && rejected.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      {pending.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Banner
            tone="warning"
            icon="refresh"
            className="min-w-0 flex-1"
            title={`${online ? t("offline.sending") : t("offline.noConnection")} · ${pending.length} ${pending.length === 1 ? t("offline.actionWaiting") : t("offline.actionsWaiting")}`}
            detail={[t("offline.savedLocally"), ...pending.slice(0, 4).map((a) => a.label), ...(pending.length > 4 ? [t("offline.andNMore", { count: pending.length - 4 })] : [])].join(" · ")}
          />
          <Button variant="secondary" icon="refresh" onClick={() => flush()}>
            {t("common.tryNow")}
          </Button>
        </div>
      )}
      {!online && pending.length === 0 && <Banner tone="info" title={t("offline.canKeepWorking")} />}
      {rejected.length > 0 && (
        <div role="alert" className="flex items-start gap-2">
          <Banner
            tone="warning"
            icon="triangle-alert"
            className="min-w-0 flex-1"
            title={rejected.length === 1 ? t("offline.oneRejected") : t("offline.nRejected", { count: rejected.length })}
            detail={[...rejected.map((r) => `${r.label} — ${r.error}`), t("offline.mayHaveChanged")].join(" · ")}
          />
          <GlassIconButton icon="x" label={t("common.dismiss")} onClick={dismissRejected} />
        </div>
      )}
    </div>
  );
}

/** „Meine Zeiten“ (H3, nur eigene Daten), lädt erst beim Aufklappen. */
export function HkMyWorkData() {
  const { t } = useLocale();
  const { stats: s, loaded, load } = useMyWorkData();
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <GlassCard as="section" className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => { setOpen(!open); load(!open); }}
        className={cx("flex min-h-(--size-touch-min) w-full items-center justify-between gap-3 text-start", FOCUS_RING)}
      >
        <span className="text-body-18 flex items-center gap-3 text-text-primary">
          <Glyph name="clock" size={22} className="text-accent-text" />
          {t("workdata.mine")}
        </span>
        <Glyph name="chevron-down" size={22} className={cx("text-text-secondary", open && "rotate-180")} />
      </button>
      {open && (
        <div id={id} className="text-body-16 text-text-secondary">
          {!s ? (
            <p className="text-text-muted">{loaded ? t("workdata.tooLittle") : ""}</p>
          ) : (
            <>
              <p className="mb-2 text-text-muted">{t("workdata.basisShort", { n: s.samples, days: s.days })}</p>
              <ul className="flex flex-col gap-1">
                {CATEGORIES.map((c) => (
                  <li key={c} className="flex justify-between gap-3">
                    <span>{t(`workdata.cat_${c}` as TKey)}</span>
                    <span className="text-text-primary">{s.byCategory[c].enough ? `${s.byCategory[c].median} min` : t("workdata.tooLittle")}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </GlassCard>
  );
}

/** Rahmen eines Glas-Fensters in der Mitte mit Titel und Schließen. */
export function HkWindow({ title, subtitle, onClose, dirty, children }: { title: string; subtitle?: string; onClose: () => void; dirty?: boolean; children: React.ReactNode }) {
  const { t } = useLocale();
  const id = useId();
  return (
    <Overlay placement="center" onClose={onClose} labelledBy={`${id}-title`} dismissOnBackdrop={!dirty} className="w-full max-w-[560px]">
      <div className="glass flex max-h-[92dvh] flex-col gap-4 overflow-y-auto rounded-(--glass-radius-lg) p-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id={`${id}-title`} className="text-title-28 text-text-primary">{title}</h2>
            {subtitle && <p className="text-body-16 text-text-secondary">{subtitle}</p>}
          </div>
          <GlassIconButton icon="x" label={t("common.close")} onClick={onClose} />
        </div>
        {children}
      </div>
    </Overlay>
  );
}

const BLOCK_LABEL: Record<string, TKey> = {
  DND: "attendant.blockReasonDnd",
  GUEST_IN_ROOM: "attendant.blockReasonGuest",
  DOUBLE_LOCKED: "attendant.blockReasonLocked",
  REFUSED: "attendant.blockReasonRefused",
};

/** „Nicht möglich“ melden (DND, Gast im Zimmer …) — gleicher Weg wie bisher: Status BLOCKED mit Grund. */
export function HkBlockDialog({ room, onClose, onSubmit }: { room: string; onClose: () => void; onSubmit: (reason: string) => void }) {
  const { t } = useLocale();
  return (
    <HkWindow title={t("attendant.blockModalTitle", { number: room })} subtitle={t("attendant.blockModalSubtitle")} onClose={onClose}>
      <div className="grid gap-3">
        {BLOCK_REASONS.map((r) => (
          <Button key={r} variant="secondary" icon={r === "DND" ? "moon" : "triangle-alert"} block onClick={() => onSubmit(r)}>
            {t(BLOCK_LABEL[r])}
          </Button>
        ))}
      </div>
    </HkWindow>
  );
}

/** Mangel melden — gleiche API wie bisher (`POST /api/rooms/[id]/defects`, Formular mit Kategorie, Text, Foto). */
export function HkDefectDialog({ room, onClose, onSubmit }: { room: string; onClose: () => void; onSubmit: (fd: FormData) => Promise<void> }) {
  const { t } = useLocale();
  const [category, setCategory] = useState<string>("PLUMBING");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("category", category);
      fd.set("note", note);
      if (photo) fd.set("photo", photo);
      await onSubmit(fd);
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <HkWindow title={t("attendant.defectModalTitle", { number: room })} subtitle={t("attendant.defectModalSubtitle")} onClose={onClose} dirty={!!note.trim() || !!photo}>
      <div role="radiogroup" aria-label={t("attendant.category")} className="flex flex-col gap-2">
        <span className="text-label text-text-muted">{t("attendant.category")}</span>
        <div className="grid grid-cols-2 gap-2">
          {DEFECT_CATEGORIES.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={category === c} onClick={() => setCategory(c)} className={chipBtn(category === c)}>
              {t(`defectCategory.${c}` as TKey)}
            </button>
          ))}
        </div>
      </div>
      <Field multiline rows={3} label={t("attendant.description")} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("attendant.descriptionPlaceholder")} />
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-photo`} className="text-label text-text-muted">
          {t("attendant.photoOptional")} ({t("common.optional")})
        </label>
        <input id={`${id}-photo`} type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className={cx("text-body-16 min-h-(--size-touch-min) text-text-secondary", FOCUS_RING)} />
      </div>
      {error && <p role="alert" className="text-body-16 text-status-danger-fg">{error}</p>}
      <Button icon="wrench" block onClick={submit} disabled={busy || !note.trim()}>
        {busy ? t("attendant.sending") : t("attendant.sendToEngineering")}
      </Button>
    </HkWindow>
  );
}

