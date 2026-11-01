"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { api } from "./api";
import RoomDetailModal, { type SearchedRoom } from "./RoomDetailModal";

/**
 * Ein gemeinsamer Weg, das Zimmer-Detailfenster zu öffnen (H2, Schritt 8): AppShell stellt den Provider bereit,
 * jede Liste, jeder Chat und jede Meldung ruft `useOpenRoom()` bzw. `<RoomLink>` — es gibt nur eine Detailkomponente
 * (`RoomDetailModal`), nie pro Screen eine neue. Daten kommen aus derselben Abfrage wie die Schnellsuche
 * (`GET /api/rooms?q=`), dadurch gelten dieselben Rechte wie bisher.
 */
type Opener = (number: string) => void;
const Ctx = createContext<Opener | null>(null);

export function RoomOpenerProvider({ children }: { children: ReactNode }) {
  const [room, setRoom] = useState<SearchedRoom | null>(null);
  const open = useCallback<Opener>((number) => {
    api<{ rooms: SearchedRoom[] }>(`/api/rooms?q=${encodeURIComponent(number)}`)
      .then((d) => setRoom(d.rooms.find((r) => r.number === number) ?? null))
      .catch(() => setRoom(null));
  }, []);
  return (
    <Ctx.Provider value={open}>
      {children}
      {room && <RoomDetailModal room={room} onClose={() => setRoom(null)} />}
    </Ctx.Provider>
  );
}

/** Öffnet das gemeinsame Detailfenster; `null` außerhalb der AppShell (dann bleibt die Nummer reiner Text). */
export function useOpenRoom(): Opener | null {
  return useContext(Ctx);
}

/** Zimmernummer als Link auf das Detailfenster (Tippfläche ≥ 44 px). */
export function RoomLink({ number, className = "" }: { number: string; className?: string }) {
  const open = useOpenRoom();
  if (!open) return <span className={className}>{number}</span>;
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); open(number); }} aria-label={`Zimmer ${number}`}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-md font-semibold underline decoration-gold/50 underline-offset-2 hover:decoration-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${className}`}>
      {number}
    </button>
  );
}

/** Text mit Zimmernummern (z. B. Meldungen, Chat): 3-stellige Nummern 101–599 werden zu Links. */
export function RoomLinkedText({ text }: { text: string }) {
  const open = useOpenRoom();
  if (!open) return <>{text}</>;
  const parts = text.split(/(\b[1-5]\d{2}\b)/g);
  return <>{parts.map((p, i) => (/^[1-5]\d{2}$/.test(p) ? <RoomLink key={i} number={p} className="!min-h-0 !min-w-0 -my-3 px-1 py-3" /> : <span key={i}>{p}</span>))}</>;
}
