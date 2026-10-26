"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/api";
import CloseButton from "@/components/CloseButton";
import { useEscapeKey } from "@/components/useEscapeKey";
import ServiceOverview from "@/components/lists/ServiceOverview";
import PlanningFloorPlanPanel from "@/components/PlanningFloorPlanPanel";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { HousemanItem } from "@/lib/lists/housemanList";
import type { PlanDraft } from "./usePlanungFlow";

export type EditorTab = "rooms" | "supervisors" | "houseman" | "overview";

/**
 * Entwurf ansehen und bearbeiten (Vollbild-Sheet, mobil und iPad): Zimmerlisten (Grundriss im Entwurfsmodus oder Liste je
 * Zimmermädchen), Supervisor-Listen (welcher Supervisor prüft welche Etage) und Hausmann-Liste (Aufgaben → Hausmann).
 * Alles hier ist Entwurf — live wird es erst nach „Plan prüfen und bestätigen“; es gehen keine Meldungen raus.
 */
export default function PlanEditorWindow({
  draft, initialTab = "rooms", initialView = "plan",
  floorSel, supOptions, onPickFloor, housemen, hmEdits, onHmEdit, onAssign, onClose,
}: {
  draft: PlanDraft;
  initialTab?: EditorTab;
  initialView?: "plan" | "list";
  floorSel: Record<number, string | null>;
  supOptions: { id: string; name: string }[];
  onPickFloor: (floor: number, id: string) => void;
  housemen: { id: string; name: string }[];
  hmEdits: Record<string, string | null>;
  onHmEdit: (traceId: string, userId: string | null) => void;
  onAssign: (roomId: string, hkId: string | null, confirmStarted: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const [tab, setTab] = useState<EditorTab>(initialTab);
  const [tasks, setTasks] = useState<HousemanItem[] | null>(null);
  useEscapeKey(onClose);
  useEffect(() => {
    if (tab !== "houseman" || tasks) return;
    api<{ items: HousemanItem[] }>("/api/lists/houseman").then((d) => setTasks(d.items)).catch(() => setTasks([]));
  }, [tab, tasks]);

  const tabs: [EditorTab, string][] = [["overview", t("service.title")], ["rooms", t("planungTool.tabRooms")], ["supervisors", t("planungTool.tabSupervisors")], ["houseman", t("planungTool.tabHouseman")]];
  const roomsByFloor = (f: number) => draft.input.rooms.filter((r) => r.floor === f);
  const sel = "h-11 w-full rounded-lg border border-charcoal/20 bg-white px-2 text-sm sm:w-56";
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ivory text-charcoal" role="dialog" aria-modal="true" aria-label={t("planungTool.editorTitle")}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-charcoal/10 bg-linen px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate font-serif text-2xl leading-tight">{t("planungTool.editorTitle")}</h2>
          <p className="text-xs text-graphite/70">{t("planungTool.editorHint")}</p>
        </div>
        <CloseButton onClick={onClose} label={t("planungTool.backToPlan")} />
      </div>
      <div className="mx-auto max-w-6xl px-4 py-4">
        <div className="mb-4 flex flex-wrap gap-2" role="tablist">
          {tabs.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`h-11 rounded-lg border px-4 text-sm font-medium ${tab === id ? "border-gold-line bg-parchment shadow-sm" : "border-charcoal/15 bg-white"}`}>{label}</button>
          ))}
        </div>

        {tab === "overview" && <ServiceOverview />}

        {tab === "rooms" && (
          <PlanningFloorPlanPanel
            onShiftAttendants={draft.input.housekeepers.map((h) => ({ id: h.id, name: h.name }))}
            actionableRoomIds={draft.input.rooms.map((r) => r.id)}
            draft={{ rooms: draft.input.rooms, assignment: draft.assignment, onAssign }}
            initialView={initialView}
            bands={Object.fromEntries(draft.input.housekeepers.map((h) => [h.id, { lo: h.lo, hi: h.hi }]))}
          />
        )}

        {tab === "supervisors" && (
          <div>
            <p className="mb-3 text-sm text-graphite/70">{t("planungTool.supervisorsHint")}</p>
            <ul className="space-y-2">
              {[1, 2, 3, 4, 5].map((f) => (
                <li key={f} className="flex flex-col gap-2 rounded-xl border border-charcoal/10 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-medium">{t("planungTool.floorLabel", { n: f })}</div>
                    <div className="text-xs text-graphite/60">{roomsByFloor(f).length} {t("planungTool.roomsShort")}{roomsByFloor(f).length ? ` · ${roomsByFloor(f).map((r) => r.number).join(", ")}` : ""}</div>
                  </div>
                  <select aria-label={t("planungTool.supervisorFor", { n: f })} value={floorSel[f] ?? ""} onChange={(e) => e.target.value && onPickFloor(f, e.target.value)} className={sel}>
                    <option value="">{t("planungTool.chooseSupervisor")}</option>
                    {supOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "houseman" && (
          <div>
            <p className="mb-3 text-sm text-graphite/70">{t("planungTool.housemanHint")}</p>
            {tasks === null ? <p className="text-sm text-graphite/60">{t("common.loading")}</p> : tasks.length === 0 ? <p className="text-sm text-graphite/70">{t("planungTool.noHousemanTasks")}</p> : (
              <ul className="space-y-2">
                {tasks.map((it) => (
                  <li key={it.id} className="flex flex-col gap-2 rounded-xl border border-charcoal/10 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 text-sm"><span className="font-medium">{it.roomNumber}</span> · <span className="text-graphite/70">{it.text}</span></div>
                    <select aria-label={t("planungTool.housemanFor", { n: it.roomNumber })} value={(it.id in hmEdits ? hmEdits[it.id] : it.assignedToId) ?? ""} onChange={(e) => onHmEdit(it.id, e.target.value || null)} className={sel}>
                      <option value="">{t("planungTool.housemanAll")}</option>
                      {housemen.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
