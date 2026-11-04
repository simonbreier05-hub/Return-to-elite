"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import PriorityBanner from "@/components/PriorityBanner";
import RoomDetailModal from "@/components/RoomDetailModal";
import { useRoomLookup } from "@/components/useRoomLookup";
import { FrontOfficeHub, type ArrivalPatch, type NewArrivalInput } from "@/components/roles/FrontOfficeHub";
import { Banner } from "@/components/ui";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
import { isOverdue, normalizeArrival, type ArrivalView } from "@/lib/ui/frontOfficeHub";

/** „HH:MM“ → Zeitpunkt heute (Gerätezeit, wie bisher). */
const timeToIso = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const etaInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toTimeString().slice(0, 5);
};

/**
 * Front Office (`/front-office`): Daten und Aktionen — Darstellung in `src/components/roles/FrontOfficeHub.tsx`.
 * Gleiche Wege wie bisher: `GET/POST /api/arrivals`, `PATCH /api/arrivals/[id]`, Live `arrival:update`, `room:update`
 * und die Meldung „Zimmer freigegeben“ (`ROOM_RELEASED`). Front Office ändert nie den Reinigungsstatus.
 */
export default function FrontOfficeView() {
  const { t } = useLocale();
  const [raw, setRaw] = useState<Record<string, unknown>[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [released, setReleased] = useState<string | null>(null);
  const roomLookup = useRoomLookup();

  const load = useCallback(async () => {
    try {
      const data = await api<{ arrivals?: Record<string, unknown>[] }>("/api/arrivals");
      setRaw(Array.isArray(data?.arrivals) ? data.arrivals : []);
      setLoadError(null);
    } catch (e) {
      setLoadError(errorText(e, t));
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);

  const upsert = (a: Record<string, unknown> | undefined) => {
    if (!a || typeof a.id !== "string") return;
    setRaw((prev) => {
      const list = prev ?? [];
      return list.some((x) => x.id === a.id) ? list.map((x) => (x.id === a.id ? { ...x, ...a } : x)) : [...list, a];
    });
  };

  useSocket({
    "arrival:update": (p: { arrival?: Record<string, unknown> } | undefined) => upsert(p?.arrival),
    // Ein Statuswechsel betrifft nur das Zimmer in der jeweiligen Anreise.
    "room:update": (p: { room?: { id?: string; status?: string } } | undefined) => {
      const r = p?.room;
      if (!r?.id) return;
      setRaw((prev) => prev && prev.map((x) => {
        const room = (x.room ?? {}) as Record<string, unknown>;
        return room.id === r.id ? { ...x, room: { ...room, status: r.status } } : x;
      }));
    },
    "notification:new": (p: { notification?: { type?: string; message?: string } } | undefined) => {
      if (p?.notification?.type === "ROOM_RELEASED" && p.notification.message) {
        setReleased(p.notification.message);
        setTimeout(() => setReleased(null), 10_000);
      }
    },
  });

  const arrivals = useMemo(() => (raw ?? []).map(normalizeArrival).filter((x): x is ArrivalView => !!x), [raw]);

  const save = async (a: ArrivalView, patch: ArrivalPatch): Promise<boolean> => {
    if (busyId) return false;
    setBusyId(a.id);
    setError(null);
    try {
      const body: Record<string, unknown> = { ...patch };
      if (patch.eta) body.eta = timeToIso(patch.eta);
      const res = await api<{ arrival?: Record<string, unknown> }>(`/api/arrivals/${a.id}`, { method: "PATCH", body });
      upsert(res?.arrival);
      return true;
    } catch (e) {
      setError(errorText(e, t));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const create = async (f: NewArrivalInput): Promise<string | null> => {
    try {
      const res = await api<{ arrival?: Record<string, unknown> }>("/api/arrivals", {
        body: { roomNumber: f.roomNumber, guestName: f.guestName, eta: f.eta ? timeToIso(f.eta) : undefined, vip: f.vip, earlyCheckIn: f.earlyCheckIn, neededNow: f.neededNow },
      });
      upsert(res?.arrival);
      return null;
    } catch (e) {
      return errorText(e, t);
    }
  };

  const expected = arrivals.filter((a) => a.status === "EXPECTED");
  const neededNowNotReady = expected.filter((a) => a.neededNow && a.room.status !== "INSPECTED").length;
  const overdueEta = expected.filter((a) => isOverdue(a)).length;

  return (
    <>
      <FrontOfficeHub
        arrivals={arrivals}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          setError(null);
        }}
        onSave={save}
        onCreate={create}
        onOpenRoom={(n) => roomLookup.open(n)}
        busyId={busyId}
        actionError={error}
        loading={raw === null && !loadError}
        loadError={raw === null ? loadError : null}
        onRetry={() => void load()}
        etaInput={etaInput}
        notices={
          <>
            {released && <Banner tone="info" icon="bell" title={released} />}
            <PriorityBanner
              items={[
                { count: neededNowNotReady, label: t("priority.neededNowArrivals"), icon: "warning", tone: "urgent" },
                { count: overdueEta, label: t("priority.overdueEta"), icon: "clock", tone: "urgent" },
              ]}
            />
          </>
        }
      />
      {roomLookup.room && <RoomDetailModal room={roomLookup.room} onClose={roomLookup.close} />}
    </>
  );
}
