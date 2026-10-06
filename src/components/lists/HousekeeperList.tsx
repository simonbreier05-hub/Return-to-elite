"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/components/api";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import { useSocket } from "@/components/useSocket";
import { useLocale } from "@/lib/i18n/LocaleContext";
import RoomRowView, { type ListRoom } from "./RoomRowView";

interface HkList {
  date: string | null;
  progress: { done: number; total: number; creditsDone: number; creditsTotal: number };
  rooms: ListRoom[];
}

/**
 * Zimmermädchen-Liste: nur die eigenen Zimmer in empfohlener Route, Kopf mit „x von y" und Credits.
 * Live per Socket.IO; nach einem Nachimport werden geänderte Zimmer kurz hervorgehoben.
 */
export default function HousekeeperList() {
  const { t } = useLocale();
  const [list, setList] = useState<HkList | null>(null);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => { setList(await api<HkList>("/api/lists/housekeeper").catch(() => null)); }, []);
  useEffect(() => { void load(); }, [load]);
  const soon = useCoalescedRefetch(load, 1500);

  useSocket({
    "room:update": () => soon(),
    "assignments:applied": () => soon(),
    "dayplan:updated": (p: { changedRooms?: string[] }) => {
      soon();
      if (p?.changedRooms?.length) {
        setFlash(new Set(p.changedRooms));
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setFlash(new Set()), 3500);
      }
    },
  });
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!list) return null;
  const { progress: p } = list;
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  return (
    <section aria-labelledby="hk-list-title" className="mb-6 rounded-2xl border border-charcoal/10 bg-linen p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h3 id="hk-list-title" className="font-serif text-2xl">{t("lists.title")}</h3>
        <p className="text-sm font-medium" aria-live="polite">
          {t("lists.progress", { done: p.done, total: p.total })} · {t("lists.credits", { done: p.creditsDone.toString().replace(".", ","), total: p.creditsTotal.toString().replace(".", ",") })}
        </p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-charcoal/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t("lists.progress", { done: p.done, total: p.total })}>
        <div className="h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      {list.rooms.length === 0 ? (
        <p className="mt-4 text-sm text-graphite/70">{t("lists.noList")}</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {list.rooms.map((r) => <RoomRowView key={r.id} room={r} highlight={flash.has(r.number)} />)}
        </ol>
      )}
    </section>
  );
}
