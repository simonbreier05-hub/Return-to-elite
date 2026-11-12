"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import PriorityBanner from "@/components/PriorityBanner";
import RoomDetailModal from "@/components/RoomDetailModal";
import { useRoomLookup } from "@/components/useRoomLookup";
import { ConciergeHub, type NewExcursionInput } from "@/components/roles/ConciergeHub";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
import { ccKpis, normalizeExcursion, type ExcursionView } from "@/lib/ui/conciergeHub";

/** „HH:MM“ → Zeitpunkt heute (Gerätezeit, wie bisher). */
const timeToIso = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

/**
 * Concierge (`/concierge`): Daten und Aktionen — Darstellung in `src/components/roles/ConciergeHub.tsx`.
 * Gleiche Wege wie bisher: `GET/POST /api/excursions`, Live `excursion:update`. Die Außer-Haus-Fenster speisen
 * die Reinigungspriorität (Housekeeping reinigt, während der Gast unterwegs ist).
 */
export default function ConciergeView() {
  const { t } = useLocale();
  const [raw, setRaw] = useState<unknown[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const roomLookup = useRoomLookup();

  const load = useCallback(async () => {
    try {
      const data = await api<{ excursions?: unknown[] }>("/api/excursions");
      setRaw(Array.isArray(data?.excursions) ? data.excursions : []);
      setLoadError(null);
    } catch (e) {
      setLoadError(errorText(e, t));
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);
  // Zustand (außer Haus / kommt bald zurück) hängt an der Uhr: einmal pro Minute neu berechnen.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useSocket({ "excursion:update": () => void load(), "app:resync": () => void load() });

  const excursions = useMemo(() => (raw ?? []).map(normalizeExcursion).filter((x): x is ExcursionView => !!x), [raw]);

  const create = async (f: NewExcursionInput): Promise<string | null> => {
    try {
      await api("/api/excursions", {
        body: { roomNumber: f.roomNumber, guestName: f.guestName || undefined, startsAt: timeToIso(f.start), endsAt: timeToIso(f.end), note: f.note || undefined },
      });
      void load();
      return null;
    } catch (e) {
      return errorText(e, t);
    }
  };

  const endingSoon = ccKpis(excursions, now).endingSoon;

  return (
    <>
      <ConciergeHub
        excursions={excursions}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={create}
        onOpenRoom={(n) => roomLookup.open(n)}
        loading={raw === null && !loadError}
        loadError={raw === null ? loadError : null}
        onRetry={() => void load()}
        now={now}
        notices={<PriorityBanner items={[{ count: endingSoon, label: t("priority.excursionsEndingSoon"), icon: "clock", tone: "watch" }]} />}
      />
      {roomLookup.room && <RoomDetailModal room={roomLookup.room} onClose={roomLookup.close} />}
    </>
  );
}
