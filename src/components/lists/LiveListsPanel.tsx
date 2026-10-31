"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import { useSocket } from "@/components/useSocket";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { LiveOverview } from "@/lib/lists/overview";
import { usePersistedSet } from "@/components/usePersistedSet";
import LiveRoomModal from "./LiveRoomModal";
import RoomRowView from "./RoomRowView";
import RowLegend from "./RowLegend";
import ServiceOverview from "./ServiceOverview";
import SupervisorList from "./SupervisorList";
import { PauseBadge, type PauseInfo } from "@/components/PauseControl";
import type { TKey } from "@/lib/i18n/translations";
import { hhmm } from "@/lib/i18n/format";

/** Von Hand angelegte Hausmann-Aufgabe (RoomTask ohne Trace) — gehört in die Hausmann-Liste, nicht doppelt ins DM-Board. */
interface ManualTask { id: string; type: string; note?: string | null; status: "OPEN" | "DONE"; createdAt: string; doneAt?: string | null; room: { number: string }; createdBy?: { name: string } | null; assignedTo?: { name: string } | null; pause?: PauseInfo | null }

type Tab = "overview" | "hk" | "sup" | "hm";

/**
 * Duty Manager: Live-Einsicht auf alle Listen — Zimmermädchen-Listen (alle Etagen), Supervisor-Listen (Fortschritt je
 * Etagengruppe) und Hausmann-Liste (wer hat welche Aufgabe, was ist erledigt, von wem — Traces aus Opera und von Hand angelegte
 * Aufgaben). Aktualisiert sich per Socket.IO.
 * Supervisor sehen ihre eigene Liste weiter im Supervisor-Board (nur zugeteilte Etagen).
 */
export default function LiveListsPanel() {
  const { t } = useLocale();
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<LiveOverview | null>(null);
  const [supOpen, toggleSup] = usePersistedSet("stayclean.liveSup.open");
  const [roomRef, setRoomRef] = useState<string | null>(null);
  const [manual, setManual] = useState<ManualTask[]>([]);
  const load = useCallback(() => Promise.all([
    api<LiveOverview>("/api/lists/overview").then(setData).catch(() => {}),
    api<{ roomTasks?: ManualTask[] }>("/api/roomtasks").then((d) => setManual(Array.isArray(d.roomTasks) ? d.roomTasks : [])).catch(() => {}),
  ]), []);
  useEffect(() => { void load(); }, [load]);
  const soon = useCoalescedRefetch(load, 1200);
  useSocket({ "note:new": () => soon(), "note:update": () => soon(), "trace:update": () => soon(), "roomtask:update": () => soon(), "assignments:applied": () => soon(), "room:update": () => soon(), "dayplan:updated": () => soon(), "work:pause": () => soon() });

  const linked = new Set((data?.tasks ?? []).map((it) => it.roomTaskId).filter((x): x is string => !!x));
  const tabs: [Tab, string][] = [["overview", t("service.title")], ["hk", t("dutyManager.liveHk")], ["sup", t("dutyManager.liveSup")], ["hm", t("dutyManager.liveHm")]];
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`h-11 rounded-lg border px-4 text-sm font-medium ${tab === id ? "border-gold-line bg-parchment shadow-sm" : "border-charcoal/15 bg-white"}`}>{label}</button>
        ))}
      </div>

      {tab === "overview" && <ServiceOverview />}
      {tab === "hk" && <SupervisorList />}

      {tab === "sup" && (
        !data ? <p className="text-sm text-graphite/60">{t("common.loading")}</p> : (
          <div className="space-y-2">
            {data.uncoveredFloors.length > 0 && <p role="alert" className="rounded-xl border border-status-in-progress/40 bg-status-in-progress/10 p-3 text-sm font-medium">{t("dutyManager.liveUncovered", { floors: data.uncoveredFloors.join(", ") })}</p>}
            <RowLegend />
            {data.supervisors.map((s) => {
              const isOpen = supOpen.has(s.id);
              const pct = s.rooms ? Math.round((s.done / s.rooms) * 100) : 0;
              return (
                <div key={s.id} className="rounded-xl border border-charcoal/10 bg-ivory">
                  <button type="button" aria-expanded={isOpen} onClick={() => toggleSup(s.id)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{s.name} <span className="text-xs font-normal text-graphite/60">· {t("planungTool.floorsLabel")} {s.floors.join(", ") || "—"}</span></span>
                      <span className="block text-xs text-graphite/70">{t("lists.progress", { done: s.done, total: s.rooms })} · {t("lists.supRooms", { n: s.rooms })}</span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-charcoal/10" aria-hidden><span className="block h-full rounded-full bg-status-clean" style={{ width: `${pct}%` }} /></span>
                    </span>
                    <span aria-hidden className="text-graphite/60">{isOpen ? "▾" : "▸"}</span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-charcoal/10 px-3 py-3">
                      {s.list.length === 0 ? <p className="text-sm text-graphite/60">{t("lists.supNoRooms")}</p> : (
                        <ol className="space-y-2">{s.list.map((r) => <RoomRowView key={r.id} room={r} showDept precheck onOpen={(x) => setRoomRef(x.id)} />)}</ol>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === "hm" && (
        !data ? <p className="text-sm text-graphite/60">{t("common.loading")}</p> : (
          <div>
            <div className="mb-3 flex flex-wrap gap-2 text-sm">
              {data.housemen.map((h) => <span key={h.id} className="rounded-full border border-charcoal/15 bg-white px-3 py-1">{h.name} · {h.done} / {h.assigned}</span>)}
              <span className="rounded-full border border-charcoal/15 bg-white px-3 py-1">{t("dutyManager.liveUnassigned")} · {data.unassignedTasks.done} / {data.unassignedTasks.total}</span>
            </div>
            {data.tasks.length === 0 ? <p className="text-sm text-graphite/60">{t("planungTool.noHousemanTasks")}</p> : (
              <ul className="space-y-1.5">
                {data.tasks.map((it) => (
                  <li key={it.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-charcoal/10 bg-white p-3 text-sm">
                    <button type="button" onClick={() => setRoomRef(it.roomNumber)} title={t("lists.hmOpenRoom", { n: it.roomNumber })} className="min-h-11 w-14 text-start font-medium underline decoration-charcoal/20 underline-offset-4">{it.roomNumber}</button>
                    <span className="min-w-0 flex-1 text-graphite/70">{it.text}</span>
                    {it.status === "OPEN" && <PauseBadge pause={it.pause} showBy />}
                    <span className="text-xs text-graphite/60">{it.assignedToName ?? t("planungTool.housemanAll")}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${it.status === "DONE" ? "bg-status-clean/15 text-status-clean" : "bg-parchment"}`}>
                      {it.status === "DONE" ? `✓ ${t("dutyManager.liveDone")}${it.doneByName ? ` · ${it.doneByName}` : ""}${it.doneAt ? ` · ${hhmm(it.doneAt)}` : ""}` : t("dutyManager.liveOpen")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <ManualTasks tasks={manual.filter((m) => !linked.has(m.id))} onOpen={setRoomRef} />
          </div>
        )
      )}
      {roomRef && <LiveRoomModal roomRef={roomRef} onClose={() => setRoomRef(null)} onChanged={() => { void load(); }} />}
    </div>
  );
}

/** Offene und zuletzt erledigte, von Hand angelegte Hausmann-Aufgaben (vorher als doppelte Liste im DM-Board). */
function ManualTasks({ tasks, onOpen }: { tasks: ManualTask[]; onOpen: (roomNumber: string) => void }) {
  const { t } = useLocale();
  const label = (x: ManualTask) => (x.type === "SONSTIGES" ? x.note ?? t("roomTaskType.SONSTIGES") : t(`roomTaskType.${x.type}` as TKey));
    const open = tasks.filter((x) => x.status === "OPEN");
  const done = tasks.filter((x) => x.status === "DONE").slice(0, 10);
  const row = (x: ManualTask) => (
    <li key={x.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-charcoal/10 p-3 text-sm ${x.status === "DONE" ? "bg-linen/60" : "bg-white"}`}>
      <button type="button" onClick={() => onOpen(x.room.number)} title={t("lists.hmOpenRoom", { n: x.room.number })} className="min-h-11 w-14 text-start font-medium underline decoration-charcoal/20 underline-offset-4">{x.room.number}</button>
      <span className={`min-w-0 flex-1 ${x.status === "DONE" ? "text-graphite/60 line-through" : "text-graphite/80"}`}>{label(x)}</span>
      {x.status === "OPEN" && <PauseBadge pause={x.pause} showBy />}
      <span className="text-xs text-graphite/60">
        {x.createdBy?.name && `${t("houseman.requestedBy", { name: x.createdBy.name })} · `}{hhmm(x.createdAt)}
        {x.status === "DONE" && x.doneAt && ` · ✓ ${hhmm(x.doneAt)}${x.assignedTo?.name ? ` · ${x.assignedTo.name}` : ""}`}
      </span>
    </li>
  );
  return (
    <div className="mt-4">
      <h4 className="mb-2 font-serif text-lg">{t("lists.hmOtherTasks")}</h4>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-graphite/60">{t("dutyManager.openTasksLabel")}</h5>
          {open.length === 0 ? <p className="text-sm text-graphite/60">{t("dutyManager.noOpenTasks")}</p> : <ul className="space-y-1.5">{open.map(row)}</ul>}
        </div>
        <div>
          <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-graphite/60">{t("dutyManager.doneTasksLabel")}</h5>
          {done.length === 0 ? <p className="text-sm text-graphite/60">{t("dutyManager.noDoneTasks")}</p> : <ul className="space-y-1.5">{done.map(row)}</ul>}
        </div>
      </div>
    </div>
  );
}
