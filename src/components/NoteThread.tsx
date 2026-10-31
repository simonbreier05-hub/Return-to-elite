"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { NOTE_STATUS_STYLES } from "./status";
import type { NoteStatus, PauseTarget } from "@/lib/domain";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { SOURCE_DICTS } from "@/lib/i18n/core";
import type { TKey } from "@/lib/i18n/translations";
import { hhmm } from "@/lib/i18n/format";

export interface ThreadNote {
  id: string;
  body: string;
  status: NoteStatus;
  /** NOTE (Notiz) oder MESSAGE (Nachricht an Zimmer/Aufgabe, nur für Beteiligte). Ältere Antworten ohne Feld = NOTE. */
  kind?: string;
  author: { name: string; role: string };
  createdAt: string;
  roomId?: string;
}


/**
 * The room-note thread: full history, per-note OPEN/DONE toggle, and a
 * composer to add a new note. Shared by the attendant card's inline expand,
 * the supervisor RoomDrawer, and the global RoomDetailModal — it only needs
 * a roomId and the notes already known to the caller, and reports additions
 * / status changes back via callbacks so each parent can patch its own
 * board state however it already does. It fetches the full thread itself
 * (the board list API only ever sends the latest 3 notes per room).
 *
 * Mit `task` (Arbeits-Bildschirme: Housekeeper, Hausmann, Technik, Supervisor-Modal) schreibt der Verlauf standardmäßig
 * Nachrichten an alle Beteiligten — sofern der Server sagt, dass diese Person beteiligt ist (`canMessage`). Nachrichten stehen
 * im selben Verlauf, klar gekennzeichnet mit Autor, Rolle und Zeit.
 */
export default function NoteThread({
  roomId,
  initialNotes,
  onNoteAdded,
  onNoteUpdated,
  compact = false,
  task,
}: {
  roomId: string;
  initialNotes: ThreadNote[];
  onNoteAdded?: (note: ThreadNote) => void;
  onNoteUpdated?: (note: ThreadNote) => void;
  compact?: boolean;
  task?: { type: PauseTarget; id: string };
}) {
  const { t } = useLocale();
  const roleLabel = (r: string) => (r === "guest" ? t("shared.guest") : `role.${r}` in SOURCE_DICTS.de ? t(`role.${r}` as TKey) : r.replace(/_/g, " "));
  const [notes, setNotes] = useState<ThreadNote[]>(Array.isArray(initialNotes) ? initialNotes : []);
  const [noteBody, setNoteBody] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [canMessage, setCanMessage] = useState(false);
  const [asMessage, setAsMessage] = useState(true);
  const [outOfScope, setOutOfScope] = useState(false);

  useEffect(() => {
    if (!roomId) return;
    api<{ notes: ThreadNote[]; canMessage?: boolean; outOfScope?: boolean }>(`/api/rooms/${roomId}/notes`)
      .then((d) => { setNotes(Array.isArray(d.notes) ? d.notes : []); setCanMessage(!!d.canMessage); setOutOfScope(!!d.outOfScope); })
      .catch(() => {});
    // Only the initial full-thread fetch — subsequent updates come through
    // the composer/toggle below or the parent's own realtime patching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const messageMode = !!task && canMessage && asMessage;

  const addNote = async () => {
    if (!noteBody.trim() || savingNote) return;
    setSavingNote(true);
    try {
      const body = messageMode ? { body: noteBody, kind: "MESSAGE", task } : { body: noteBody };
      const res = await api<{ note: ThreadNote }>(`/api/rooms/${roomId}/notes`, { body });
      const note = { ...res.note, roomId };
      setNotes((prev) => [note, ...prev]);
      setNoteBody("");
      onNoteAdded?.(note);
    } finally {
      setSavingNote(false);
    }
  };

  const toggleStatus = async (note: ThreadNote) => {
    if (togglingId) return;
    setTogglingId(note.id);
    const next: NoteStatus = note.status === "OPEN" ? "DONE" : "OPEN";
    try {
      const res = await api<{ note: ThreadNote }>(`/api/rooms/${roomId}/notes/${note.id}`, {
        method: "PATCH",
        body: { status: next },
      });
      const updated = { ...res.note, roomId };
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      onNoteUpdated?.(updated);
    } finally {
      setTogglingId(null);
    }
  };

  const pad = compact ? "p-1.5" : "p-2";
  const textSize = compact ? "text-xs" : "text-sm";

  return (
    <div>
      {outOfScope && notes.some((n) => n.kind === "MESSAGE") && (
        <p role="note" className="mb-2 rounded-lg border border-gold-line/60 bg-parchment p-2 text-xs">⚠ {t("work.outOfScopeHint")}</p>
      )}
      {notes.length === 0 && <p className={`${textSize} text-graphite/50`}>{t("work.noNotes")}</p>}
      {notes.map((n) => {
        const isMessage = n.kind === "MESSAGE";
        return (
          <div key={n.id} className={`mb-1 rounded-lg ${isMessage ? "border-l-4 border-gold bg-parchment" : "bg-ivory"} ${pad} ${textSize}`}>
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs text-graphite/60">
                {isMessage && <span className="mr-1 rounded-full bg-gold/20 px-1.5 py-0.5 font-semibold text-charcoal">💬 {t("work.message")}</span>}
                {isMessage && outOfScope && <span className="mr-1 rounded-full border border-gold-line/60 bg-white px-1.5 py-0.5 font-semibold text-gold-soft">{t("work.outOfScope")}</span>}
                <span className="font-medium text-graphite">{n.author?.name ?? "—"}</span> ({roleLabel(n.author?.role ?? "")}) ·{" "}
                {hhmm(n.createdAt)}
              </span>
              <button
                onClick={() => toggleStatus(n)}
                disabled={togglingId === n.id}
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.68rem] font-medium disabled:opacity-50 ${NOTE_STATUS_STYLES[n.status]?.badge ?? ""}`}
                title={n.status === "OPEN" ? t("work.markDone") : t("work.reopen")}
              >
                {togglingId === n.id ? "…" : n.status === "OPEN" ? t("work.markDone") : t("work.reopen")}
              </button>
            </div>
            <p className="mt-0.5 break-words">{n.body}</p>
          </div>
        );
      })}
      {task && canMessage && (
        <div role="radiogroup" aria-label={t("work.message")} className="mt-2 flex flex-wrap gap-2 text-xs">
          {([true, false] as const).map((m) => (
            <button key={String(m)} type="button" role="radio" aria-checked={asMessage === m} onClick={() => setAsMessage(m)}
              className={`min-h-11 rounded-full border px-3 font-medium ${asMessage === m ? "border-gold-line bg-parchment" : "border-charcoal/15 bg-white"}`}>
              {m ? `💬 ${t("work.asMessage")}` : t("work.asNote")}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <input
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addNote()}
          placeholder={messageMode ? t("work.messagePlaceholder") : t("work.notePlaceholder")}
          maxLength={2000}
          className={`${compact ? "h-11" : "h-12"} min-w-0 flex-1 rounded-lg border border-charcoal/20 px-3 outline-none focus:border-gold`}
        />
        <button
          onClick={addNote}
          disabled={savingNote || !noteBody.trim()}
          className={`${compact ? "h-11" : "h-12"} rounded-lg bg-charcoal px-4 text-ivory disabled:opacity-40`}
        >
          {savingNote ? "…" : t("work.send")}
        </button>
      </div>
    </div>
  );
}
