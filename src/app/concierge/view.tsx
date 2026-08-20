"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import PriorityBanner from "@/components/PriorityBanner";
import { useLocale } from "@/lib/i18n/LocaleContext";

interface Excursion {
  id: string;
  guestName?: string | null;
  startsAt: string;
  endsAt: string;
  note?: string | null;
  room: { number: string; status: string };
}

export default function ConciergeView() {
  const { t } = useLocale();
  const [excursions, setExcursions] = useState<Excursion[]>([]);
  const [roomNumber, setRoomNumber] = useState("");
  const [guestName, setGuestName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const data = await api<{ excursions: Excursion[] }>("/api/excursions");
    setExcursions(data.excursions);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useSocket({ "excursion:update": () => load() });

  const timeToIso = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/excursions", {
        body: {
          roomNumber,
          guestName: guestName || undefined,
          startsAt: timeToIso(start),
          endsAt: timeToIso(end),
          note: note || undefined,
        },
      });
      setRoomNumber(""); setGuestName(""); setStart(""); setEnd(""); setNote("");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const now = Date.now();

  /** Guests whose out-of-house window closes within the hour — the room
   * should be finished before they walk back in. */
  const endingSoon = useMemo(
    () => excursions.filter((e) => new Date(e.startsAt).getTime() <= now && new Date(e.endsAt).getTime() - now <= 60 * 60_000 && new Date(e.endsAt).getTime() > now).length,
    [excursions, now]
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[24rem_1fr]">
      <div className="rounded-2xl border border-charcoal/10 bg-white p-5 shadow-sm">
        <h2 className="mb-1 font-serif text-2xl">{t("concierge.logExcursion")}</h2>
        <p className="mb-4 text-sm text-graphite/60">{t("concierge.outOfHouseHint")}</p>
        <label className="mb-1 block text-sm font-medium">{t("concierge.roomNumber")}</label>
        <input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} placeholder="402"
          className="mb-3 h-12 w-full rounded-lg border border-charcoal/20 px-3 outline-none focus:border-gold" />
        <label className="mb-1 block text-sm font-medium">
          {t("concierge.guestOptional")} ({t("common.optional")})
        </label>
        <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Mr. & Mrs. Tanaka"
          className="mb-3 h-12 w-full rounded-lg border border-charcoal/20 px-3 outline-none focus:border-gold" />
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">{t("concierge.outFrom")}</label>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)}
              className="h-12 w-full rounded-lg border border-charcoal/20 px-3 outline-none focus:border-gold" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("concierge.backAt")}</label>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)}
              className="h-12 w-full rounded-lg border border-charcoal/20 px-3 outline-none focus:border-gold" />
          </div>
        </div>
        <label className="mb-1 block text-sm font-medium">
          {t("concierge.noteOptional")} ({t("common.optional")})
        </label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("concierge.notePlaceholder")}
          className="mb-4 h-12 w-full rounded-lg border border-charcoal/20 px-3 outline-none focus:border-gold" />
        {error && <p className="mb-2 text-sm text-status-out-of-order">{error}</p>}
        <button onClick={submit} disabled={busy || !roomNumber || !start || !end}
          className="h-12 w-full rounded-xl bg-navy font-medium text-ivory disabled:opacity-40">
          {busy ? t("common.saving") : t("concierge.logExcursionBtn")}
        </button>
      </div>

      <div>
        <PriorityBanner items={[{ count: endingSoon, label: t("priority.excursionsEndingSoon"), icon: "clock", tone: "watch" }]} />

        <h2 className="mb-3 font-serif text-2xl">{t("concierge.todaysWindows")}</h2>
        <div className="space-y-2">
          {excursions.length === 0 && <p className="text-sm text-graphite/60">{t("concierge.noExcursions")}</p>}
          {excursions.map((e) => {
            const active = new Date(e.startsAt).getTime() <= now && new Date(e.endsAt).getTime() > now;
            return (
              <div key={e.id}
                className={`rounded-xl border p-4 transition-colors ${active ? "border-status-pickup/40 bg-status-pickup/10" : "border-charcoal/10 bg-white"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-serif text-2xl">{e.room.number}</span>
                  <span className="text-sm">
                    {new Date(e.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} –{" "}
                    {new Date(e.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {active && <span className="ml-2 rounded-full bg-status-pickup px-2 py-0.5 text-xs text-linen">{t("concierge.guestOut")}</span>}
                  </span>
                </div>
                <p className="mt-1 text-sm text-graphite/70">
                  {e.guestName ?? t("concierge.guestFallback")}{e.note ? ` · ${e.note}` : ""}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
