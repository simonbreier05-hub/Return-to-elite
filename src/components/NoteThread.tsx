"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { NOTE_STATUS_STYLES } from "./status";
import type { NoteStatus } from "@/lib/domain";

export interface ThreadNote {
  id: string;
  body: string;
  status: NoteStatus;
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
 */
export default function NoteThread({
  roomId,
  initialNotes,
  onNoteAdded,
  onNoteUpdated,
  compact = false,
}: {
  roomId: string;
  initialNotes: ThreadNote[];
  onNoteAdded?: (note: ThreadNote) => void;
  onNoteUpdated?: (note: ThreadNote) => void;
  compact?: boolean;
}) {
  const [notes, setNotes] = useState<ThreadNote[]>(initialNotes);
  const [noteBody, setNoteBody] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    api<{ notes: ThreadNote[] }>(`/api/rooms/${roomId}/notes`)
      .then((d) => setNotes(d.notes))
      .catch(() => {});
    // Only the initial full-thread fetch — subsequent updates come through
    // the composer/toggle below or the parent's own realtime patching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const addNote = async () => {
    if (!noteBody.trim() || savingNote) return;
    setSavingNote(true);
    try {
      const res = await api<{ note: ThreadNote }>(`/api/rooms/${roomId}/notes`, { body: { body: noteBody } });
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
      {notes.length === 0 && <p className={`${textSize} text-graphite/50`}>No notes yet.</p>}
      {notes.map((n) => (
        <div key={n.id} className={`mb-1 rounded-lg bg-ivory ${pad} ${textSize}`}>
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs text-graphite/60">
              {n.author.name} ({n.author.role.replace(/_/g, " ")}) ·{" "}
              {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <button
              onClick={() => toggleStatus(n)}
              disabled={togglingId === n.id}
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.68rem] font-medium disabled:opacity-50 ${NOTE_STATUS_STYLES[n.status].badge}`}
              title={n.status === "OPEN" ? "Mark done" : "Reopen"}
            >
              {togglingId === n.id ? "…" : n.status === "OPEN" ? "Mark done" : "Reopen"}
            </button>
          </div>
          <p className="mt-0.5">{n.body}</p>
        </div>
      ))}
      <div className="mt-2 flex gap-2">
        <input
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addNote()}
          placeholder="Add a note…"
          className={`${compact ? "h-11" : "h-12"} flex-1 rounded-lg border border-charcoal/20 px-3 outline-none focus:border-gold`}
        />
        <button
          onClick={addNote}
          disabled={savingNote || !noteBody.trim()}
          className={`${compact ? "h-11" : "h-12"} rounded-lg bg-charcoal px-4 text-ivory disabled:opacity-40`}
        >
          {savingNote ? "…" : "Add"}
        </button>
      </div>
    </div>
  );
}
