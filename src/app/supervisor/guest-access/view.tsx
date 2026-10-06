"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/components/api";

interface GuestAccessRoom {
  id: string;
  number: string;
  floor: number;
  section: string;
  code: string;
}

/**
 * QR/NFC generator (Prompt G2 Teil 2): the table below is the working view
 * (search, copy, regenerate a lost tag's code); /supervisor/guest-access/print
 * is the printable QR sheet (open it, then use the browser's Print → Save
 * as PDF — no server-side PDF generation needed for an internal tool).
 */
export default function GuestAccessView() {
  const [rooms, setRooms] = useState<GuestAccessRoom[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  useEffect(() => {
    api<{ rooms: GuestAccessRoom[] }>("/api/rooms/guest-access")
      .then((d) => setRooms(d.rooms))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Konnte die Zugangscodes nicht laden."));
  }, []);

  const filtered = useMemo(() => {
    if (!rooms) return [];
    const q = query.trim();
    return q ? rooms.filter((r) => r.number.includes(q)) : rooms;
  }, [rooms, query]);

  const urlFor = (code: string) => `${origin}/g/r/${code}`;

  const copy = async (room: GuestAccessRoom) => {
    try {
      await navigator.clipboard.writeText(urlFor(room.code));
      setCopiedId(room.id);
      setTimeout(() => setCopiedId((id) => (id === room.id ? null : id)), 2000);
    } catch {
      // Clipboard API can be unavailable (permissions, non-secure context) —
      // the URL is still selectable text in the row, so this isn't fatal.
    }
  };

  const regenerate = async (room: GuestAccessRoom) => {
    if (!rooms) return;
    if (!window.confirm(`Neuen Code für Zimmer ${room.number} erzeugen? Der alte QR-Code/NFC-Tag funktioniert danach nicht mehr.`)) {
      return;
    }
    setBusyId(room.id);
    setError(null);
    try {
      const { code } = await api<{ code: string }>(`/api/rooms/${room.id}/guest-access`, { method: "POST" });
      setRooms(rooms.map((r) => (r.id === room.id ? { ...r, code } : r)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Regenerieren fehlgeschlagen.");
    } finally {
      setBusyId(null);
    }
  };

  const downloadUrlList = () => {
    if (!rooms) return;
    const lines = rooms.map((r) => `${r.number}\t${urlFor(r.code)}`).join("\n");
    const blob = new Blob([`Zimmer\tNFC-URL\n${lines}\n`], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "stayclean-guest-nfc-urls.txt";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="animate-rise">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-4xl leading-none">Gästezugang (QR/NFC)</h2>
          <div className="rule-gold my-2 w-40" />
          <p className="max-w-2xl text-sm text-graphite/70">
            Jeder Code ist fest an ein Zimmer gebunden und löst immer zum aktuellen Aufenthalt auf — nie zur
            Zimmernummer im Klartext. Ist ein Tag verloren gegangen, hier neu erzeugen: der alte Code funktioniert
            danach sofort nicht mehr.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={downloadUrlList}
            disabled={!rooms}
            className="flex h-11 items-center rounded-lg border border-charcoal/15 bg-linen px-4 text-sm font-medium hover:border-gold-line disabled:opacity-40"
          >
            NFC-URL-Liste herunterladen
          </button>
          <Link
            href="/supervisor/guest-access/print"
            className="flex h-11 items-center rounded-lg bg-navy px-4 text-sm font-semibold text-ivory hover:bg-navy-line"
          >
            Druckbare QR-Liste öffnen
          </Link>
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Zimmer suchen…"
        className="mb-4 h-11 w-full max-w-xs rounded-lg border border-charcoal/20 px-3 text-sm outline-none focus:border-gold sm:w-64"
      />

      {!rooms && !error && <p className="text-sm text-graphite/70">Lädt…</p>}

      {rooms && (
        <div className="overflow-x-auto rounded-xl border border-charcoal/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-linen text-xs uppercase tracking-wide text-graphite/70">
              <tr>
                <th className="px-4 py-2.5">Zimmer</th>
                <th className="px-4 py-2.5">Etage</th>
                <th className="px-4 py-2.5">NFC/QR-URL</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((room) => (
                <tr key={room.id} className="border-t border-charcoal/10">
                  <td className="px-4 py-2.5 font-semibold">{room.number}</td>
                  <td className="px-4 py-2.5">{room.floor}</td>
                  <td className="max-w-xs truncate px-4 py-2.5 font-mono text-xs text-graphite/80" title={urlFor(room.code)}>
                    {urlFor(room.code)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => copy(room)}
                        className="h-11 rounded-md border border-charcoal/15 px-3 text-xs font-medium hover:border-gold-line md:h-8"
                      >
                        {copiedId === room.id ? "Kopiert!" : "Kopieren"}
                      </button>
                      <button
                        onClick={() => regenerate(room)}
                        disabled={busyId === room.id}
                        className="h-11 rounded-md border border-charcoal/15 px-3 text-xs font-medium text-status-out-of-order md:h-8 hover:border-status-out-of-order disabled:opacity-40"
                      >
                        {busyId === room.id ? "…" : "Neu erzeugen"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="p-4 text-sm text-graphite/70">Kein Zimmer gefunden.</p>}
        </div>
      )}
    </div>
  );
}
