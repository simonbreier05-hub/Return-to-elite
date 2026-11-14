"use client";

import { useId } from "react";
import TwoTapButton from "@/components/TwoTapButton";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import type { RoomStatus } from "@/lib/domain";
import type { RoomDetail } from "@/lib/rooms/roomDetail";
import { statusTargetIcon } from "@/lib/ui/roomWindow";
import { Field, Glyph, SectionLabel } from "@/components/ui";
import { cx, FOCUS_RING } from "@/components/ui/primitives";
import { ACTION_LABEL, DEPTS, useRoomEdit } from "./useRoomEdit";

const SELECT =
  "text-body-16 w-full min-h-(--size-touch-min) rounded-(--glass-radius-md) border border-border-subtle bg-surface-progress-track px-4 py-3 text-text-primary disabled:opacity-40";
const card = "flex flex-col gap-2 rounded-(--glass-radius-sm) bg-surface-card-raised p-3";
const linkBtn = cx("press text-body-16 inline-flex min-h-(--size-touch-min) items-center rounded-pill px-3 text-accent-text underline underline-offset-4", FOCUS_RING);
const sec = "flex flex-col gap-3";

function GlassSelect({ label, value, onChange, children, className }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-label text-text-muted">{label}</label>
      <select id={id} className={cx(SELECT, FOCUS_RING)} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  );
}

/**
 * Bearbeiten-Bereich im Glas-Fenster (D7, nur Supervisor/Duty Manager — kommt über den Slot `editor`):
 * gleiche Logik und API-Wege wie die helle Fassung (`useRoomEdit`), jede Änderung erst mit dem zweiten Tipp (`TwoTapButton`).
 * Status-Knöpfe zeigen Symbol + Text, Meldungen enthalten keine Gastdaten (Server-Fehlertext über `errorText`).
 */
export function RoomEditGlass({ room, onChanged }: { room: RoomDetail; onChanged: () => void | Promise<void> }) {
  const { t, fmt } = useLocale();
  const e = useRoomEdit(room, onChanged);
  const editRow = (kind: "trace" | "note", id: string) =>
    e.editing && e.editing.kind === kind && e.editing.id === id && (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field
          className="min-w-0 flex-1"
          label={t(kind === "trace" ? "roomEdit.traceText" : "roomEdit.noteEdit")}
          value={e.editing.text}
          maxLength={kind === "trace" ? 300 : 1000}
          onChange={(ev) => e.editing && e.setEditing({ ...e.editing, text: ev.target.value })}
        />
        <TwoTapButton onConfirm={e.saveEdit} disabled={!e.editing.text.trim()}>{t("roomEdit.save")}</TwoTapButton>
        <button type="button" className={linkBtn} onClick={() => e.setEditing(null)}>{t("roomEdit.cancel")}</button>
      </div>
    );

  return (
    <section className="flex flex-col gap-5 border-t border-border-subtle pt-4" data-testid="room-edit">
      <p className="text-label flex items-start gap-2 text-text-muted">
        <Glyph name="info" size={18} className="mt-px shrink-0" />
        {t("roomEdit.viewOnly")}
      </p>
      {e.msg && (
        <p role={e.msg.ok ? "status" : "alert"} className={cx("text-body-16 flex items-center gap-2", e.msg.ok ? "text-status-success-fg" : "text-status-danger-fg")}>
          <Glyph name={e.msg.ok ? "check" : "triangle-alert"} size={20} />
          {e.msg.text}
        </p>
      )}

      <div className={sec}>
        <SectionLabel as="h3" icon="refresh" title={t("roomEdit.status")} />
        <p className="text-label text-text-muted">{t("roomEdit.statusHint")}</p>
        <div className="flex flex-wrap gap-2">
          {room.allowedStatuses.map((s) =>
            s === "OUT_OF_ORDER" ? null : (
              <TwoTapButton key={s} onConfirm={() => e.setStatus(s)}>
                <Glyph name={statusTargetIcon(s as RoomStatus)} size={18} />
                {t("roomEdit.statusSet", { status: t(`status.${s}` as TKey) })}
              </TwoTapButton>
            ),
          )}
        </div>
        {room.allowedStatuses.includes("OUT_OF_ORDER") && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field className="min-w-0 flex-1" type="datetime-local" label={t("roomEdit.oooUntil")} value={e.ooo} onChange={(ev) => e.setOoo(ev.target.value)} />
            <TwoTapButton disabled={!e.ooo} onConfirm={() => e.setStatus("OUT_OF_ORDER")}>
              <Glyph name="wrench" size={18} />
              {t("roomEdit.statusSet", { status: t("status.OUT_OF_ORDER") })}
            </TwoTapButton>
          </div>
        )}
      </div>

      <div className={sec}>
        <SectionLabel as="h3" icon="moon" title={t("roomEdit.dnd")} />
        <div className="flex flex-wrap gap-2">
          {e.isDnd ? (
            <TwoTapButton onConfirm={() => e.setDnd(false)}>{t("roomEdit.dndClear")}</TwoTapButton>
          ) : (
            <TwoTapButton disabled={!room.canBlock} onConfirm={() => e.setDnd(true)}>{t("roomEdit.dndSet")}</TwoTapButton>
          )}
          {e.guestDnd && <TwoTapButton onConfirm={e.clearGuestDnd}>{t("roomEdit.guestDndClear")}</TwoTapButton>}
          {e.canCheckOut && <TwoTapButton onConfirm={e.checkOut}>{t("roomEdit.checkedOut")}</TwoTapButton>}
        </div>
      </div>

      <div className={sec}>
        <SectionLabel as="h3" icon="users" title={t("roomEdit.assignment")} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <GlassSelect className="min-w-0 flex-1" label={t("roomEdit.assignment")} value={e.assignTo} onChange={(v) => { e.setAssignTo(v); e.setStartedPrompt(null); }}>
            <option value="">{t("roomEdit.assignPick")}</option>
            {room.attendants.map((a) => (
              <option key={a.id} value={a.id}>{a.dailyNumber ? `#${a.dailyNumber} ` : ""}{a.name}</option>
            ))}
          </GlassSelect>
          <TwoTapButton disabled={!e.assignTo} onConfirm={() => e.assign(e.assignTo)}>{t("roomEdit.save")}</TwoTapButton>
          {room.assignedTo && <TwoTapButton onConfirm={() => e.assign(null)}>{t("roomEdit.assignNone")}</TwoTapButton>}
        </div>
        {e.startedPrompt !== null && (
          <div role="alert" className="flex flex-col gap-2 rounded-(--glass-radius-md) bg-status-warning-bg p-3 sm:flex-row sm:items-center">
            <p className="text-body-16 flex-1 text-text-primary">{t("roomEdit.assignStarted")}</p>
            <TwoTapButton onConfirm={() => e.assign(e.startedPrompt || null, true)}>{t("roomEdit.save")}</TwoTapButton>
          </div>
        )}
      </div>

      <div className={sec}>
        <SectionLabel as="h3" icon="file-text" title={t("roomEdit.traces")} count={room.traces.length || undefined} />
        {room.traces.length === 0 ? (
          <p className="text-body-16 text-text-muted">{t("roomEdit.noTraces")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {room.traces.map((x) => (
              <li key={x.id} className={card}>
                <p className={cx("text-body-16 break-words", x.status === "DONE" ? "text-text-muted line-through" : "text-text-primary")}>
                  <span className="text-label me-2 text-text-muted">{t(`lists.dept${x.dept}` as TKey)}:</span>
                  {x.text}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <TwoTapButton onConfirm={() => e.traceDone(x.id, x.status !== "DONE")}>
                    <Glyph name={x.status === "DONE" ? "refresh" : "check"} size={18} />
                    {x.status === "DONE" ? t("roomEdit.traceReopen") : t("roomEdit.traceDone")}
                  </TwoTapButton>
                  <button type="button" className={linkBtn} onClick={() => e.setEditing({ kind: "trace", id: x.id, text: x.text })}>{t("roomEdit.traceEdit")}</button>
                </div>
                {editRow("trace", x.id)}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field className="min-w-0 flex-1" label={t("roomEdit.traceText")} value={e.newText} maxLength={300} placeholder={t("roomEdit.traceText")} onChange={(ev) => e.setNewText(ev.target.value)} />
          <GlassSelect label={t("lists.supOtherDepts")} value={e.newDept} onChange={(v) => e.setNewDept(v as (typeof DEPTS)[number])}>
            {DEPTS.map((d) => (
              <option key={d} value={d}>{t(`lists.dept${d}` as TKey)}</option>
            ))}
          </GlassSelect>
          <TwoTapButton disabled={!e.newText.trim()} onConfirm={e.addTrace}>{t("roomEdit.traceAdd")}</TwoTapButton>
        </div>
      </div>

      {room.notes.length > 0 && (
        <div className={sec}>
          <SectionLabel as="h3" icon="message" title={t("roomEdit.notesEdit")} />
          <ul className="flex flex-col gap-2">
            {room.notes.map((n) => (
              <li key={n.id} className={card}>
                <p className="text-body-16 break-words text-text-primary">
                  {n.body} <span className="text-label text-text-muted">· {n.author.name}</span>
                </p>
                <div>
                  <button type="button" className={linkBtn} onClick={() => e.setEditing({ kind: "note", id: n.id, text: n.body })}>{t("roomEdit.noteEdit")}</button>
                </div>
                {editRow("note", n.id)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={sec}>
        <SectionLabel as="h3" icon="list" title={t("roomEdit.logbook")} />
        {room.logbook.length === 0 ? (
          <p className="text-body-16 text-text-muted">{t("roomEdit.logbookEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {room.logbook.map((l) => (
              <li key={l.id} className="text-label text-text-secondary">
                <span className="text-text-muted">{fmt.time(l.at)}</span> · {ACTION_LABEL[l.action] ? t(ACTION_LABEL[l.action]) : l.action}
                {l.from && l.to ? ` ${l.from} → ${l.to}` : ""}
                {l.by ? ` · ${l.by}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
