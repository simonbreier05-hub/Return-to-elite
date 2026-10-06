"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import { useSocket } from "@/components/useSocket";
import { useLocale } from "@/lib/i18n/LocaleContext";

interface Item {
  id: string; roomNumber: string; floor: number; text: string; times: string[]; status: "OPEN" | "DONE";
  doneAt: string | null; roomTaskId: string | null; guest: string | null; waitsForDeparture: boolean;
}
interface Data { date: string | null; floors: number[]; items: Item[] }

/**
 * Hausmann-Liste: Traces der Abteilung Hausmann für den Tag. Abhaken per Tap (Zeitstempel + Nutzer im Logbuch),
 * Filter nach Etage, Gast nur als Anrede + Nachname. Live per Socket.IO.
 */
export default function HousemanList({ onLinkedTasks }: { onLinkedTasks?: (roomTaskIds: Set<string>) => void }) {
  const { t } = useLocale();
  const [data, setData] = useState<Data | null>(null);
  const [floor, setFloor] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await api<Data>("/api/lists/houseman").catch(() => null);
    setData(d);
    if (d) onLinkedTasks?.(new Set(d.items.map((i) => i.roomTaskId).filter((x): x is string => !!x)));
  }, [onLinkedTasks]);
  useEffect(() => { void load(); }, [load]);
  const soon = useCoalescedRefetch(load, 1000);
  useSocket({ "trace:update": () => soon(), "roomtask:update": () => soon(), "dayplan:updated": () => soon() });

  if (!data) return null;
  const shown = floor ? data.items.filter((i) => i.floor === floor) : data.items;
  const open = data.items.filter((i) => i.status === "OPEN").length;
  const done = data.items.length - open;

  const toggle = async (item: Item) => {
    if (busy) return;
    setBusy(item.id); setError(null);
    const next = item.status === "DONE" ? "OPEN" : "DONE";
    try {
      await api(`/api/traces/${item.id}`, { method: "PATCH", body: { status: next } });
      setData((d) => d && { ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, status: next, doneAt: next === "DONE" ? new Date().toISOString() : null } : i)) });
      soon();
    } catch { setError(t("lists.hmFailed")); } finally { setBusy(null); }
  };
  const time = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

  return (
    <section aria-labelledby="hm-list-title" className="mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h3 id="hm-list-title" className="font-serif text-3xl">{t("lists.hmTitle")}</h3>
        <p className="text-sm text-graphite/70" aria-live="polite">{t("lists.hmOpen", { n: open })} · {t("lists.hmDone", { n: done })}</p>
      </div>
      {data.floors.length > 1 && (
        <div role="group" aria-label={t("lists.floorN", { n: "" }).trim()} className="mt-3 flex flex-wrap gap-2">
          {[null, ...data.floors].map((f) => (
            <button key={f ?? "all"} type="button" aria-pressed={floor === f} onClick={() => setFloor(f)}
              className={`min-h-11 rounded-full border px-4 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${floor === f ? "border-navy bg-navy text-ivory" : "border-charcoal/20 bg-white"}`}>
              {f === null ? t("lists.hmAllFloors") : t("lists.floorN", { n: f })}
            </button>
          ))}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-status-out-of-order">{error}</p>}
      {shown.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-charcoal/10 bg-linen p-6 text-center text-graphite/60">{t("lists.hmNone")}</p>
      ) : (
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {shown.map((i) => (
            <li key={i.id} data-status={i.status} className={`rounded-2xl border p-4 shadow-sm ${i.status === "DONE" ? "border-charcoal/10 bg-linen/70" : "border-charcoal/10 bg-white"}`}>
              <div className="flex items-baseline gap-2">
                <span className="font-serif text-3xl leading-none">{i.roomNumber}</span>
                <span className="text-xs text-graphite/60">{t("lists.floorN", { n: i.floor })}</span>
              </div>
              <p className={`mt-1.5 text-base ${i.status === "DONE" ? "text-graphite/60 line-through" : "font-medium"}`}>{i.text}</p>
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-graphite/70">
                {i.times.length > 0 && <span>{t("lists.hmTimes", { list: i.times.join(", ") })}</span>}
                {i.guest && <span>{i.guest}</span>}
                {i.waitsForDeparture && i.status === "OPEN" && <span className="font-medium text-gold">⏳ {t("lists.hmWaitsDeparture")}</span>}
                {i.status === "DONE" && i.doneAt && <span>✓ {t("lists.hmDoneAt", { time: time(i.doneAt) })}</span>}
              </div>
              <button type="button" onClick={() => toggle(i)} disabled={busy === i.id} aria-pressed={i.status === "DONE"}
                className={`mt-3 h-12 w-full rounded-xl text-base font-semibold transition active:scale-[0.98] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${i.status === "DONE" ? "border border-charcoal/20 bg-white text-graphite" : "bg-status-inspected text-linen"}`}>
                {busy === i.id ? "…" : i.status === "DONE" ? t("lists.hmUntick") : `✓ ${t("lists.hmTick")}`}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
