"use client";

import { useState } from "react";
import { api, ApiError } from "@/components/api";
import TwoTapButton from "@/components/TwoTapButton";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import type { RoomDetail } from "@/lib/rooms/roomDetail";
import { STATUS_STYLES } from "@/components/status";

const DEPTS = ["HOUSEKEEPING", "HOUSEMAN", "ENGINEERING", "FRONT_OFFICE"] as const;
const field = "min-h-11 w-full rounded-lg border border-charcoal/20 bg-white px-3 text-sm outline-none focus:border-gold";
const h4 = "mb-1 text-sm font-semibold uppercase tracking-wider text-graphite/60";
const ACTION_LABEL: Record<string, string> = {
  ROOM_ASSIGNED: "Zuteilung", ROOM_MOVED_STARTED: "Zuteilung (begonnen)", TRACE_ADDED: "Trace hinzugefügt", TRACE_EDITED: "Trace geändert", TRACE_DONE: "Trace erledigt",
  TRACE_REOPENED: "Trace wieder geöffnet", NOTE_ADDED: "Notiz", NOTE_EDITED: "Notiz geändert", NOTE_STATUS_CHANGED: "Notiz-Status", STATUS_CHANGE: "Status",
};

/**
 * Bearbeiten im gemeinsamen Zimmer-Detail-Modal (Duty Manager/Supervisor): Status (nur sinnvolle Übergänge), Zuteilung,
 * Bitte-nicht-stören, Traces (hinzufügen/ändern/erledigen), Notizen ändern, Zimmer-Logbuch.
 * Jede Änderung wird erst mit dem zweiten Tipp (TwoTapButton) gespeichert; danach lädt `onChanged` das Zimmer neu,
 * der Server meldet die Betroffenen live und schreibt das Logbuch.
 */
export default function RoomEditPanel({ room, onChanged }: { room: RoomDetail; onChanged: () => void | Promise<void> }) {
  const { t } = useLocale();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ooo, setOoo] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [newText, setNewText] = useState("");
  const [newDept, setNewDept] = useState<(typeof DEPTS)[number]>("HOUSEKEEPING");
  const [editing, setEditing] = useState<{ kind: "trace" | "note"; id: string; text: string } | null>(null);
  const [startedPrompt, setStartedPrompt] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setMsg(null);
    try { await fn(); setMsg({ ok: true, text: t("roomEdit.saved") }); await onChanged(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error && e.message ? e.message : t("roomEdit.failed") }); }
  };
  const setStatus = (status: string) => run(() => api(`/api/rooms/${room.id}/status`, { body: { status, ...(status === "OUT_OF_ORDER" ? { oooUntil: new Date(ooo).toISOString() } : {}) } }));
  const setDnd = (on: boolean) => run(() => api(`/api/rooms/${room.id}/status`, { body: on ? { status: "BLOCKED", blockReason: "DND" } : { status: "DIRTY" } }));
  const assign = (attendantId: string | null, confirmStarted = false) =>
    run(async () => {
      try { await api(`/api/rooms/${room.id}/assign`, { body: { attendantId, confirmStarted } }); setStartedPrompt(null); }
      catch (e) { if (e instanceof ApiError && e.code === "STARTED_ROOM") { setStartedPrompt(attendantId ?? ""); return; } throw e; }
    });
  const traceDone = (id: string, done: boolean) => run(() => api(`/api/rooms/${room.id}/traces/${id}`, { method: "PATCH", body: { status: done ? "DONE" : "OPEN" } }));
  const addTrace = () => run(async () => { await api(`/api/rooms/${room.id}/traces`, { body: { text: newText, dept: newDept } }); setNewText(""); });
  const saveEdit = async () => { if (editing) await run(async () => {
    if (editing.kind === "trace") await api(`/api/rooms/${room.id}/traces/${editing.id}`, { method: "PATCH", body: { text: editing.text } });
    else await api(`/api/rooms/${room.id}/notes/${editing.id}`, { method: "PATCH", body: { body: editing.text } });
    setEditing(null);
  }); };
  const isDnd = room.status === "BLOCKED" && room.blockReason === "DND";
  const editRow = (kind: "trace" | "note", id: string) => editing && editing.kind === kind && editing.id === id && (
    <div className="mt-1 flex flex-col gap-2 sm:flex-row">
      <input className={field} value={editing.text} maxLength={kind === "trace" ? 300 : 1000} onChange={(e) => setEditing({ ...editing, text: e.target.value })} aria-label={t(kind === "trace" ? "roomEdit.traceText" : "roomEdit.noteEdit")} />
      <TwoTapButton onConfirm={saveEdit} disabled={!editing.text.trim()}>{t("roomEdit.save")}</TwoTapButton>
      <button type="button" className="min-h-11 rounded-lg px-3 text-sm underline" onClick={() => setEditing(null)}>{t("roomEdit.cancel")}</button>
    </div>
  );

  return (
    <div className="mt-4 space-y-5 rounded-xl border border-gold-line/50 bg-parchment/40 p-3" data-testid="room-edit">
      <p className="text-xs text-graphite/70">{t("roomEdit.viewOnly")}</p>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm font-medium ${msg.ok ? "text-status-clean" : "text-status-out-of-order"}`}>{msg.text}</p>}

      <section>
        <h4 className={h4}>{t("roomEdit.status")}</h4>
        <p className="mb-1 text-xs text-graphite/60">{t("roomEdit.statusHint")}</p>
        <div className="flex flex-wrap gap-2">
          {room.allowedStatuses.map((s) => {
            const style = STATUS_STYLES[s];
            return s === "OUT_OF_ORDER" ? null : (
              <TwoTapButton key={s} onConfirm={() => setStatus(s)}><span className={`mr-1 inline-block h-2.5 w-2.5 rounded-full border ${style.chip}`} aria-hidden />{t("roomEdit.statusSet", { status: t(`status.${s}` as TKey) })}</TwoTapButton>
            );
          })}
        </div>
        {room.allowedStatuses.includes("OUT_OF_ORDER") && (
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="text-sm" htmlFor="ooo-until">{t("roomEdit.oooUntil")}</label>
            <input id="ooo-until" type="datetime-local" className={`${field} sm:w-auto`} value={ooo} onChange={(e) => setOoo(e.target.value)} />
            <TwoTapButton disabled={!ooo} onConfirm={() => setStatus("OUT_OF_ORDER")}>{t("roomEdit.statusSet", { status: t("status.OUT_OF_ORDER") })}</TwoTapButton>
          </div>
        )}
      </section>

      <section>
        <h4 className={h4}>{t("roomEdit.dnd")}</h4>
        {isDnd
          ? <TwoTapButton onConfirm={() => setDnd(false)}>{t("roomEdit.dndClear")}</TwoTapButton>
          : <TwoTapButton disabled={!room.canBlock} onConfirm={() => setDnd(true)}>{t("roomEdit.dndSet")}</TwoTapButton>}
      </section>

      <section>
        <h4 className={h4}>{t("roomEdit.assignment")}</h4>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select className={field} value={assignTo} onChange={(e) => { setAssignTo(e.target.value); setStartedPrompt(null); }} aria-label={t("roomEdit.assignment")}>
            <option value="">{t("roomEdit.assignPick")}</option>
            {room.attendants.map((a) => <option key={a.id} value={a.id}>{a.dailyNumber ? `#${a.dailyNumber} ` : ""}{a.name}</option>)}
          </select>
          <TwoTapButton disabled={!assignTo} onConfirm={() => assign(assignTo)}>{t("roomEdit.save")}</TwoTapButton>
          {room.assignedTo && <TwoTapButton onConfirm={() => assign(null)}>{t("roomEdit.assignNone")}</TwoTapButton>}
        </div>
        {startedPrompt !== null && (
          <p role="alert" className="mt-2 text-sm">{t("roomEdit.assignStarted")}{" "}
            <TwoTapButton onConfirm={() => assign(startedPrompt || null, true)}>{t("roomEdit.save")}</TwoTapButton>
          </p>
        )}
      </section>

      <section>
        <h4 className={h4}>{t("roomEdit.traces")}</h4>
        {room.traces.length === 0 ? <p className="text-sm text-graphite/60">{t("roomEdit.noTraces")}</p> : (
          <ul className="space-y-2">
            {room.traces.map((x) => (
              <li key={x.id} className="rounded-lg bg-white p-2 text-sm">
                <div className={`break-words ${x.status === "DONE" ? "text-graphite/50 line-through" : ""}`}><span className="mr-1 text-xs font-semibold">{t(`lists.dept${x.dept}` as TKey)}:</span>{x.text}</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  <TwoTapButton onConfirm={() => traceDone(x.id, x.status !== "DONE")}>{x.status === "DONE" ? t("roomEdit.traceReopen") : t("roomEdit.traceDone")}</TwoTapButton>
                  <button type="button" className="min-h-11 rounded-lg border border-charcoal/20 bg-white px-3 text-sm" onClick={() => setEditing({ kind: "trace", id: x.id, text: x.text })}>{t("roomEdit.traceEdit")}</button>
                </div>
                {editRow("trace", x.id)}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input className={field} value={newText} maxLength={300} placeholder={t("roomEdit.traceText")} aria-label={t("roomEdit.traceText")} onChange={(e) => setNewText(e.target.value)} />
          <select className={`${field} sm:w-auto`} value={newDept} onChange={(e) => setNewDept(e.target.value as (typeof DEPTS)[number])} aria-label={t("lists.supOtherDepts")}>
            {DEPTS.map((d) => <option key={d} value={d}>{t(`lists.dept${d}` as TKey)}</option>)}
          </select>
          <TwoTapButton disabled={!newText.trim()} onConfirm={addTrace}>{t("roomEdit.traceAdd")}</TwoTapButton>
        </div>
      </section>

      {room.notes.length > 0 && (
        <section>
          <h4 className={h4}>{t("roomEdit.notesEdit")}</h4>
          <ul className="space-y-2">
            {room.notes.map((n) => (
              <li key={n.id} className="rounded-lg bg-white p-2 text-sm">
                <div className="break-words">{n.body} <span className="text-xs text-graphite/60">· {n.author.name}</span></div>
                <button type="button" className="mt-1 min-h-11 rounded-lg border border-charcoal/20 bg-white px-3 text-sm" onClick={() => setEditing({ kind: "note", id: n.id, text: n.body })}>{t("roomEdit.noteEdit")}</button>
                {editRow("note", n.id)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h4 className={h4}>{t("roomEdit.logbook")}</h4>
        {room.logbook.length === 0 ? <p className="text-sm text-graphite/60">{t("roomEdit.logbookEmpty")}</p> : (
          <ul className="space-y-0.5 text-xs text-graphite">
            {room.logbook.map((l) => (
              <li key={l.id}>{new Date(l.at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })} · {ACTION_LABEL[l.action] ?? l.action}{l.from && l.to ? ` ${l.from} → ${l.to}` : ""}{l.by ? ` · ${l.by}` : ""}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
