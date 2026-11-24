"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/components/api";
import type { GuestGreeting } from "@/lib/guestGreeting";

export interface GuestStatusItem {
  id: string;
  kind: "DND" | "CLEAN_REQUEST" | "CONTACT" | "DEFECT" | "NOTE" | "GREEN"; // GREEN = Betrieb L2 Green Option
  detail: string | null;
  status: "RECEIVED" | "IN_PROGRESS" | "DONE" | "CANCELLED";
  createdAt: string;
}

interface FeedResponse {
  greeting: GuestGreeting | null;
  items: GuestStatusItem[];
  activeDnd: { id: string; detail: string | null } | null;
}

const POLL_MS = 15_000;

/**
 * Polls this room's own request status (Prompt G2 Teil 3: "Live-Aktualisierung") — a narrow, access-checked
 * endpoint, never the staff Socket.IO channel (which only accepts logged-in staff since S1). Runs continuously
 * in the background so the DND tile can flip to "active" the moment a request lands.
 *
 * S1: Die Antwort trägt auch die Begrüßung („Anrede Titel Nachname“ des gerade aktiven Aufenthalts). Sie lebt nur
 * im Speicher dieser Seite — nie im Browser-Speicher. Antwortet der Server 404 (Aufenthalt beendet: Check-out,
 * Zimmerwechsel, …), meldet der Hook `ended` und die Seite wechselt auf die neutrale Ansicht ohne Namen.
 */
export function useGuestStatusFeed(actionBase: string, initialGreeting: GuestGreeting | null = null) {
  const [items, setItems] = useState<GuestStatusItem[]>([]);
  const [activeDnd, setActiveDnd] = useState<{ id: string; detail: string | null } | null>(null);
  const [greeting, setGreeting] = useState<GuestGreeting | null>(initialGreeting);
  const [ended, setEnded] = useState(false);
  // F9 (A3): einmal beendet, bleibt beendet — die Seite ist an ihren Aufenthalt gebunden (actionBase trägt dessen Kennung).
  const endedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (endedRef.current) return;
    try {
      const data = await api<FeedResponse>(`${actionBase}/status`);
      if (endedRef.current) return;
      setItems(data.items);
      setActiveDnd(data.activeDnd);
      setGreeting(data.greeting ?? null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        // Aufenthalt vorbei: Namen und Verlauf sofort vergessen, Abruf stoppen und neutral neu laden,
        // damit der Name auch aus den Seitendaten verschwindet.
        endedRef.current = true;
        setGreeting(null);
        setItems([]);
        setActiveDnd(null);
        setEnded(true);
        if (typeof window !== "undefined") window.location.replace(`${window.location.pathname}?ended=1`);
      }
      // Sonst still — ein Hintergrund-Abruf; echte Fehler zeigt die jeweilige Aktion.
    }
  }, [actionBase]);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => { if (endedRef.current) clearInterval(timer); else refresh(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return { items, activeDnd, greeting, ended, refresh };
}
