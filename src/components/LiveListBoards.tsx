"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import Collapsible from "@/components/Collapsible";
import DragDropBoard from "@/components/DragDropBoard";
import { distributeHouseman } from "@/lib/planung/housemanAssign";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { HousemanItem } from "@/lib/lists/housemanList";

interface Person { id: string; name: string }
interface TeamInfo { members: { sup: Person[]; hm: Person[] }; selected: { sup: string[]; hm: string[] }; floorAssign: Record<number, string | null> }
const FLOORS = [1, 2, 3, 4, 5];

/**
 * Nach dem Bestätigen: Supervisor- (Etage → Supervisor) und Hausmann-Liste (Aufgabe → Hausmann) bleiben bearbeitbar.
 * Gleiches Brett wie im Entwurf; hier wird sofort gespeichert (`PUT /api/planung/floors|houseman`), die Server-Routen melden
 * die Betroffenen. Optimistisch, Fehler = Hinweis + Zurückrollen; nie ein Neuaufbau der Seite.
 */
export default function LiveListBoards({ date }: { date: string }) {
  const { t } = useLocale();
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [floors, setFloors] = useState<Record<number, string | null>>({});
  const [tasks, setTasks] = useState<HousemanItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [tm, hm] = await Promise.all([
      api<TeamInfo>(`/api/planung/team?date=${date}`).catch(() => null),
      api<{ items: HousemanItem[] }>("/api/lists/houseman").catch(() => null),
    ]);
    if (tm) { setTeam(tm); setFloors(tm.floorAssign); }
    if (hm) setTasks(hm.items);
  }, [date]);
  useEffect(() => { void load(); }, [load]);
  const soon = useCoalescedRefetch(() => { void load(); }, 1200);
  useSocket({ "trace:update": () => soon(), "assignments:applied": () => soon(), "dayplan:updated": () => soon() });

  if (!team) return null;
  const sups = team.members.sup.filter((s) => team.selected.sup.includes(s.id));
  const hms = team.members.hm.filter((h) => team.selected.hm.includes(h.id));
  const open = tasks.filter((it) => it.status === "OPEN");
  const hmNow = distributeHouseman(open.map((it) => ({ id: it.id, floor: it.floor, assignedToId: it.assignedToId })), hms.map((h) => h.id), {});

  const moveFloors = async (ids: string[], to: string | null) => {
    setError(null);
    if (!to) { setError(t("planungTool.liveFloorNeedsSup")); return; }
    const prev = floors;
    const next = { ...floors };
    for (const f of ids) next[Number(f)] = to;
    setFloors(next);
    try { await api("/api/planung/floors", { method: "PUT", body: { date, floors: Object.fromEntries(FLOORS.map((f) => [String(f), next[f]])) } }); }
    catch (e) { setFloors(prev); setError(e instanceof Error ? e.message : t("planungTool.liveFloorNeedsSup")); }
  };
  const moveTasks = async (ids: string[], to: string | null) => {
    setError(null);
    const prev = tasks;
    setTasks((cur) => cur.map((it) => (ids.includes(it.id) ? { ...it, assignedToId: to } : it)));
    try { await api("/api/planung/houseman", { method: "PUT", body: { assignments: ids.map((traceId) => ({ traceId, userId: to })) } }); }
    catch (e) { setTasks(prev); setError(e instanceof Error ? e.message : t("planungTool.liveFloorNeedsSup")); }
  };

  const floorItem = (f: number) => ({ id: String(f), label: t("planungTool.floorLabel", { n: f }) });
  const taskItem = (it: HousemanItem) => ({ id: it.id, label: it.roomNumber, sub: it.text.length > 28 ? `${it.text.slice(0, 27)}…` : it.text, title: it.text });
  return (
    <section className="mb-4" aria-label={t("planungTool.liveBoardsTitle")}>
      <Collapsible summary={<span><span className="font-serif text-lg">{t("planungTool.liveBoardsTitle")}</span><span className="block text-xs text-graphite/60">{t("planungTool.liveBoardsHint")}</span></span>}>
        {error && <p role="alert" className="mb-2 text-sm text-status-out-of-order">{error}</p>}
        <h4 className="mb-1 font-serif text-base">{t("planungTool.tabSupervisors")}</h4>
        <DragDropBoard hint={t("board.hint")} onMove={moveFloors}
          columns={sups.map((sp) => ({ id: sp.id as string | null, title: sp.name, items: FLOORS.filter((f) => floors[f] === sp.id).map(floorItem) }))} />
        <h4 className="mb-1 mt-4 font-serif text-base">{t("planungTool.tabHouseman")}</h4>
        {open.length === 0 ? <p className="text-sm text-graphite/70">{t("planungTool.noHousemanTasks")}</p> : (
          <DragDropBoard hint={t("board.hint")} onMove={moveTasks}
            columns={[
              ...hms.map((h) => ({ id: h.id as string | null, title: h.name, items: open.filter((it) => hmNow[it.id] === h.id).map(taskItem) })),
              { id: null, title: t("planungTool.housemanUnassigned"), tone: "open" as const, items: open.filter((it) => !hmNow[it.id]).map(taskItem) },
            ]} />
        )}
      </Collapsible>
    </section>
  );
}
