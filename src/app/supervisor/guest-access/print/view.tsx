"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { api, ApiError } from "@/components/api";
import ImageLightbox from "@/components/ImageLightbox";

interface GuestAccessRoom {
  id: string;
  number: string;
  floor: number;
  section: string;
  code: string;
}

interface PrintableRoom extends GuestAccessRoom {
  qrDataUrl: string;
}

/**
 * One card per room: QR code + room number in plain text for staff (never
 * shown to the guest side — the guest only ever sees the code inside the
 * URL, not the room number it maps to). Use the browser's Print dialog
 * (Ctrl/Cmd+P → Save as PDF) for the "druckbares PDF" requirement — no
 * server-side PDF generation needed for an internal tool.
 */
export default function GuestAccessPrintView() {
  const [rooms, setRooms] = useState<PrintableRoom[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const origin = window.location.origin;
        const { rooms: fetched } = await api<{ rooms: GuestAccessRoom[] }>("/api/rooms/guest-access");
        const withQr = await Promise.all(
          fetched.map(async (room) => ({
            ...room,
            qrDataUrl: await QRCode.toDataURL(`${origin}/g/r/${room.code}`, { width: 220, margin: 1 }),
          }))
        );
        if (!cancelled) setRooms(withQr);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Konnte die QR-Codes nicht erzeugen.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link href="/supervisor/guest-access" className="text-sm font-medium text-navy hover:underline">
          ← Zurück
        </Link>
        <button
          onClick={() => window.print()}
          disabled={!rooms}
          className="h-11 rounded-lg bg-navy px-5 text-sm font-semibold text-ivory hover:bg-navy-line disabled:opacity-40"
        >
          Drucken / Als PDF speichern
        </button>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 print:hidden">{error}</p>}
      {!rooms && !error && <p className="text-sm text-graphite/70 print:hidden">Erzeuge QR-Codes…</p>}

      {rooms && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 print:grid-cols-3 print:gap-3">
          {rooms.map((room) => (
            <div
              key={room.id}
              className="flex flex-col items-center rounded-xl border border-charcoal/15 p-4 text-center break-inside-avoid print:border-black/40"
            >
              <ImageLightbox src={room.qrDataUrl} alt={`QR-Code Zimmer ${room.number}`} className="h-28 w-28" />
              <div className="mt-2 text-lg font-semibold">Zimmer {room.number}</div>
              <div className="text-xs text-graphite/60">Etage {room.floor}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
