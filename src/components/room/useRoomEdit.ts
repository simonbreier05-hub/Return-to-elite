"use client";

import { useState } from "react";
import { api, ApiError } from "@/components/api";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
import type { TKey } from "@/lib/i18n/translations";
import type { RoomDetail } from "@/lib/rooms/roomDetail";

export const DEPTS = ["HOUSEKEEPING", "HOUSEMAN", "ENGINEERING", "FRONT_OFFICE"] as const;
export const ACTION_LABEL: Record<string, TKey> = {
  ROOM_ASSIGNED: "shared.logRoomAssigned", ROOM_MOVED_STARTED: "shared.logRoomMovedStarted", TRACE_ADDED: "shared.logTraceAdded", TRACE_EDITED: "shared.logTraceEdited", TRACE_DONE: "shared.logTraceDone",
  TRACE_REOPENED: "shared.logTraceReopened", NOTE_ADDED: "shared.logNoteAdded", NOTE_EDITED: "shared.logNoteEdited", NOTE_STATUS_CHANGED: "shared.logNoteStatus", GUEST_REQUEST_UPDATED: "shared.logGuestRequest", STATUS_CHANGE: "shared.logStatus",
};

/**
 * Logik des Bearbeiten-Bereichs (Status, DND, Zuteilung, Traces, Notizen) — eine Quelle für die helle Fassung
 * (`RoomEditPanel`) und das Glas-Fenster (`RoomEditGlass`, D7). Gleiche API-Wege wie bisher; gespeichert wird erst
 * nach dem zweiten Tipp (`TwoTapButton` in der Ansicht).
 */
export function useRoomEdit(room: RoomDetail, onChanged: () => void | Promise<void>) {
  const { t } = useLocale();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ooo, setOoo] = useState("");
  const [oooReason, setOooReason] = useState("");
  /** F2: Rückfrage „Zimmer ist belegt / Anreise heute — trotzdem sperren?“ (Server-Text, ohne Gastdaten). */
  const [occupiedPrompt, setOccupiedPrompt] = useState<string | null>(null);
  /** F3 (K4): Rückfrage „Gast laut Front Office noch im Zimmer“ — Status und Late Check-out, mit Bestätigung weiter. */
  const [guestPrompt, setGuestPrompt] = useState<{ status: string; lateCheckout: string | null } | null>(null);
  const [assignTo, setAssignTo] = useState("");
  const [newText, setNewText] = useState("");
  const [newDept, setNewDept] = useState<(typeof DEPTS)[number]>("HOUSEKEEPING");
  const [editing, setEditing] = useState<{ kind: "trace" | "note"; id: string; text: string } | null>(null);
  const [startedPrompt, setStartedPrompt] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setMsg(null);
    // `false` = nicht gespeichert (z. B. Rückfrage offen) — dann kein „Gespeichert“
    try { if ((await fn()) === false) return; setMsg({ ok: true, text: t("roomEdit.saved") }); await onChanged(); }
    catch (e) { setMsg({ ok: false, text: errorText(e, t, "roomEdit.failed") }); }
  };
  const setStatus = (status: string, confirmOccupied = false, confirmGuestPresent = false) => run(async () => {
    // F6-Nachtrag (M19): Fertigmelden durch Supervisor/DM — Wäschewechsel einmal bestätigen (nur wenn heute fällig)
    const askLaundry = (status === "CLEAN" || status === "INSPECTED") && room.status !== "CLEAN" && room.status !== "INSPECTED" && !!room.day?.laundry;
    const laundry = askLaundry ? { laundryChanged: window.confirm(t("hk.laundryConfirm", { n: room.number })) } : {};
    try {
      await api(`/api/rooms/${room.id}/status`, { body: { status, ...laundry, ...(confirmGuestPresent ? { confirmGuestPresent } : {}), ...(status === "OUT_OF_ORDER" ? { oooUntil: new Date(ooo).toISOString(), oooReason: oooReason.trim(), confirmOccupied } : {}) } });
      setOccupiedPrompt(null); setGuestPrompt(null);
    } catch (e) {
      if (e instanceof ApiError && e.code === "OCCUPIED_CONFIRM_REQUIRED") { setOccupiedPrompt(e.message); return false; }
      if (e instanceof ApiError && e.code === "GUEST_STILL_IN_ROOM") { setGuestPrompt({ status, lateCheckout: (e.data?.lateCheckout as string | null) ?? null }); return false; }
      throw e;
    }
  });
  /** F2: gesperrtes Zimmer wieder in Betrieb nehmen (nur Supervisor/Duty Manager — Server prüft) */
  const isBlocked = room.status === "OUT_OF_ORDER" || room.status === "OUT_OF_SERVICE";
  const setDnd = (on: boolean) => run(() => api(`/api/rooms/${room.id}/status`, { body: on ? { status: "BLOCKED", blockReason: "DND" } : { status: "DIRTY" } }));
  const assign = (attendantId: string | null, confirmStarted = false) =>
    run(async () => {
      try { await api(`/api/rooms/${room.id}/assign`, { body: { attendantId, confirmStarted } }); setStartedPrompt(null); }
      catch (e) {
        if (e instanceof ApiError && e.code === "STARTED_ROOM") { setStartedPrompt(attendantId ?? ""); return false; }
        // F4 (H3): Warnungen beim Zuteilen von Hand — Rückfrage, dann trotzdem
        if (e instanceof ApiError && e.code === "ASSIGN_WARNINGS") {
          if (!window.confirm(`${e.message}

${t("assign.warnConfirm")}`)) return false;
          await api(`/api/rooms/${room.id}/assign`, { body: { attendantId, confirmStarted, confirmWarnings: true } }); setStartedPrompt(null); return;
        }
        throw e;
      }
    });
  const traceDone = (id: string, done: boolean) => run(() => api(`/api/rooms/${room.id}/traces/${id}`, { method: "PATCH", body: { status: done ? "DONE" : "OPEN" } }));
  const addTrace = () => run(async () => { await api(`/api/rooms/${room.id}/traces`, { body: { text: newText, dept: newDept } }); setNewText(""); });
  const saveEdit = async () => { if (editing) await run(async () => {
    if (editing.kind === "trace") await api(`/api/rooms/${room.id}/traces/${editing.id}`, { method: "PATCH", body: { text: editing.text } });
    else await api(`/api/rooms/${room.id}/notes/${editing.id}`, { method: "PATCH", body: { body: editing.text } });
    setEditing(null);
  }); };
  const guestDnd = room.guestRequests.find((g) => g.kind === "DND");
  const clearGuestDnd = () => guestDnd && run(() => api(`/api/guest-requests/${guestDnd.id}`, { method: "PATCH", body: { status: "DONE" } }));
  const isDnd = room.status === "BLOCKED" && room.blockReason === "DND";
  // Planung L1 (Regel 7): Abreise heute → „Gast ausgecheckt“ melden; erst dann rückt ein Turn vor die Bleiber
  const canCheckOut = room.day?.kind === "SAME_DAY_TURN" || room.day?.kind === "DEPARTURE";
  const checkOut = () => run(() => api(`/api/rooms/${room.id}/checkout`, { body: {} }));
  return { msg, ooo, setOoo, oooReason, setOooReason, occupiedPrompt, setOccupiedPrompt, guestPrompt, setGuestPrompt, isBlocked, assignTo, setAssignTo, newText, setNewText, newDept, setNewDept, editing, setEditing, startedPrompt, setStartedPrompt,
    setStatus, setDnd, assign, traceDone, addTrace, saveEdit, guestDnd, clearGuestDnd, isDnd, canCheckOut, checkOut };
}

