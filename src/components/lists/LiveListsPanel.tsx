"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import { useSocket } from "@/components/useSocket";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { LiveOverview } from "@/lib/lists/overview";
import ServiceOverview from "./ServiceOverview";
import SupervisorList from "./SupervisorList";

type Tab = "overview" | "hk" | "sup" | "hm";

/**
 * Duty Manager: Live-Einsicht auf alle Listen — Zimmermädchen-Listen (alle Etagen), Supervisor-Listen (Fortschritt je
 * Etagengruppe) und Hausmann-Liste (wer hat welche Aufgabe, was ist erledigt, von wem). Aktualisiert sich per Socket.IO.
 * Supervisor sehen ihre eigene Liste weiter im Supervisor-Board (nur zugeteilte Etagen).
 */
export default function LiveListsPanel() {
  const { t } = useLocale();
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<LiveOverview | null>(null);
  const load = useCallback(() => api<LiveOverview>("/api/lists/overview").then(setData).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  const soon = useCoalescedRefetch(load, 1200);
  useSocket({ "trace:update": () => soon(), "roomtask:update": () => soon(), "assignments:applied": () => soon(), "room:update": () => soon(), "dayplan:updated": () => soon() });

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
            {data.supervisors.map((s) => (
              <div key={s.id} className="rounded-xl border border-charcoal/10 bg-white p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-medium">{s.name} <span className="text-xs text-graphite/60">· {t("planungTool.floorsLabel")} {s.floors.join(", ") || "—"}</span></div>
                  <div className="font-serif text-lg">{s.done} / {s.rooms}</div>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-charcoal/10" aria-hidden><div className="h-full bg-status-clean" style={{ width: `${s.rooms ? Math.round((s.done / s.rooms) * 100) : 0}%` }} /></div>
              </div>
            ))}
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
                    <span className="w-12 font-medium">{it.roomNumber}</span>
                    <span className="min-w-0 flex-1 text-graphite/70">{it.text}</span>
                    <span className="text-xs text-graphite/60">{it.assignedToName ?? t("planungTool.housemanAll")}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${it.status === "DONE" ? "bg-status-clean/15 text-status-clean" : "bg-parchment"}`}>
                      {it.status === "DONE" ? `✓ ${t("dutyManager.liveDone")}${it.doneByName ? ` · ${it.doneByName}` : ""}${it.doneAt ? ` · ${new Date(it.doneAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })}` : ""}` : t("dutyManager.liveOpen")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      )}
    </div>
  );
}
