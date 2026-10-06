"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/components/api";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import { useSocket } from "@/components/useSocket";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import RoomRowView, { type ListRoom } from "./RoomRowView";

type Group = "PROGRESS" | "DONE" | "OPEN" | "DND" | "ARRIVAL";
const GROUPS: Group[] = ["PROGRESS", "OPEN", "DND", "ARRIVAL", "DONE"];
const GROUP_KEY: Record<Group, TKey> = {
  PROGRESS: "lists.supGroupProgress", OPEN: "lists.supGroupOpen", DND: "lists.supGroupDnd", ARRIVAL: "lists.supGroupArrival", DONE: "lists.supGroupDone",
};
type SupRoom = ListRoom & { group: Group; changed: boolean };
interface Hk { id: string; name: string; dailyNumber: number | null; progress: { done: number; total: number; credits: number; creditsDone: number }; rooms: SupRoom[] }
interface Data {
  date: string | null; floors: number[]; noFloors: boolean; dataAsOf: string | null;
  housekeepers: Hk[]; unassigned: SupRoom[]; attendants: { id: string; name: string; dailyNumber: number | null }[];
}
const label = (a: { name: string; dailyNumber?: number | null }) => (a.dailyNumber ? `#${a.dailyNumber} ${a.name}` : a.name);
const num = (n: number) => n.toString().replace(".", ",");

/**
 * Supervisor-Liste (Etagenliste): je Housekeeper Fortschritt und Credits, aufklappbare Zimmerliste in Gruppen,
 * Traces aller Abteilungen, „durch Nachimport geändert", „Stand der Daten". Zimmer lassen sich über die
 * bestehende Verschieben-Funktion jederzeit manuell zuteilen. Nur die zugeteilten Etagen.
 */
export default function SupervisorList() {
  const { t } = useLocale();
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => { setData(await api<Data>("/api/lists/supervisor").catch(() => null)); }, []);
  useEffect(() => { void load(); }, [load]);
  const soon = useCoalescedRefetch(load, 1500);
  useSocket({
    "room:update": () => soon(),
    "assignments:applied": () => soon(),
    "dayplan:updated": (p: { changedRooms?: string[] }) => {
      soon();
      if (p?.changedRooms?.length) { setFlash(new Set(p.changedRooms)); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setFlash(new Set()), 3500); }
    },
  });
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!data) return null;
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const move = async (room: SupRoom, toId: string, fromId: string | null) => {
    setBusy(room.id); setError(null);
    try {
      if (fromId) await api(`/api/rooms/${room.id}/move`, { body: { toAttendantId: toId } });
      else await api(`/api/rooms/${room.id}/assign`, { body: { attendantId: toId } });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : t("lists.supMoveFailed")); } finally { setBusy(null); }
  };
  const mover = (room: SupRoom, fromId: string | null) => (
    <select value="" disabled={busy === room.id} aria-label={t("lists.supMove")} onChange={(e) => e.target.value && void move(room, e.target.value, fromId)}
      className="mt-1.5 h-11 w-full rounded-lg border border-charcoal/20 bg-white px-2 text-sm outline-none focus:border-gold disabled:opacity-50">
      <option value="">{busy === room.id ? t("lists.supMoving") : `→ ${t("lists.supMove")}`}</option>
      {data.attendants.filter((a) => a.id !== fromId).map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}
    </select>
  );
  const roomItem = (room: SupRoom, fromId: string | null) => (
    <div key={room.id}>
      <ol><RoomRowView room={{ ...room, changed: room.changed || flash.has(room.number) }} highlight={flash.has(room.number)} showDept /></ol>
      {mover(room, fromId)}
    </div>
  );
  const stand = data.dataAsOf ? new Date(data.dataAsOf).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <section aria-labelledby="sup-list-title" className="mb-6 rounded-2xl border border-charcoal/10 bg-white p-4 shadow-sm">
      <h3 id="sup-list-title" className="font-serif text-2xl">{t("lists.supTitle")}</h3>
      <p className="mt-0.5 text-xs text-graphite/70">
        {!data.noFloors && <>{t("lists.supFloors", { list: data.floors.join(", ") })}</>}
        {stand && <> · {t("lists.stand", { time: stand })}</>} · {t("lists.live")}
      </p>
      {data.noFloors ? (
        <p className="mt-3 rounded-lg border border-gold-line/50 bg-parchment p-3 text-sm">{t("lists.supNoFloors")}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {error && <p role="alert" className="rounded-lg border border-status-out-of-order/30 bg-status-out-of-order/10 px-3 py-2 text-sm text-status-out-of-order">{error}</p>}
          {data.housekeepers.map((h) => {
            const isOpen = open.has(h.id);
            const pct = h.progress.total ? Math.round((h.progress.done / h.progress.total) * 100) : 0;
            return (
              <div key={h.id} className="rounded-xl border border-charcoal/10 bg-ivory">
                <button type="button" aria-expanded={isOpen} onClick={() => toggle(h.id)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-semibold text-ivory">{h.dailyNumber ?? h.name.charAt(0)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{h.name}</span>
                    <span className="block text-xs text-graphite/70">{t("lists.progress", { done: h.progress.done, total: h.progress.total })} · {t("lists.credits", { done: num(h.progress.creditsDone), total: num(h.progress.credits) })}</span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-charcoal/10" aria-hidden><span className="block h-full rounded-full bg-gold" style={{ width: `${pct}%` }} /></span>
                  </span>
                  <span aria-hidden className="text-graphite/60">{isOpen ? "▾" : "▸"}</span>
                </button>
                {isOpen && (
                  <div className="space-y-3 border-t border-charcoal/10 px-3 py-3">
                    {GROUPS.map((g) => {
                      const rs = h.rooms.filter((r) => r.group === g);
                      if (!rs.length) return null;
                      return (
                        <div key={g}>
                          <h4 className="mb-1 text-[0.7rem] font-semibold uppercase tracking-wider text-graphite/70">{t(GROUP_KEY[g])} ({rs.length})</h4>
                          <div className="space-y-2">{rs.map((r) => roomItem(r, h.id))}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {data.unassigned.length > 0 && (
            <div className="rounded-xl border border-dashed border-charcoal/25 p-3">
              <h4 className="mb-1 text-[0.7rem] font-semibold uppercase tracking-wider text-graphite/70">{t("lists.supUnassigned")} ({data.unassigned.length})</h4>
              <div className="space-y-2">{data.unassigned.map((r) => roomItem(r, null))}</div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
