"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/api";
import CloseButton from "@/components/CloseButton";
import { useEscapeKey } from "@/components/useEscapeKey";
import ServiceOverview from "@/components/lists/ServiceOverview";
import PlanningFloorPlanPanel from "@/components/PlanningFloorPlanPanel";
import DragDropBoard from "@/components/DragDropBoard";
import { distributeHouseman } from "@/lib/planung/housemanAssign";
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
  floorSel, supOptions, onPickFloor, housemen, hmEdits, onHmEdit, onAssign, onAssignMany, onClose,
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
  onAssignMany?: (roomIds: string[], hkId: string | null, confirmStarted: boolean) => void;
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
  // Vorschau der Hausmann-Verteilung: ein Hausmann bekommt alles, mehrere nach Etage; Handänderungen (hmEdits) gelten vorrangig.
  const openTasks = (tasks ?? []).filter((it) => it.status === "OPEN");
  const hmPreview = distributeHouseman(openTasks.map((it) => ({ id: it.id, floor: it.floor, assignedToId: it.assignedToId })), housemen.map((h) => h.id), hmEdits);
  const taskItem = (it: HousemanItem) => ({ id: it.id, label: it.roomNumber, sub: it.text.length > 28 ? `${it.text.slice(0, 27)}…` : it.text, title: it.text });
  const floorItem = (f: number) => ({ id: String(f), label: t("planungTool.floorLabel", { n: f }), sub: `${roomsByFloor(f).length} ${t("planungTool.roomsShort")}` });
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
            draft={{ rooms: draft.input.rooms, assignment: draft.assignment, onAssign, onAssignMany }}
            initialView={initialView}
            bands={Object.fromEntries(draft.input.housekeepers.map((h) => [h.id, { lo: h.lo, hi: h.hi }]))}
          />
        )}

        {tab === "supervisors" && (
          <div>
            <p className="mb-3 text-sm text-graphite/70">{t("planungTool.supervisorsHint")}</p>
            <DragDropBoard
              hint={t("board.hint")}
              onMove={(ids, to) => { if (to) for (const f of ids) onPickFloor(Number(f), to); }}
              columns={[
                ...supOptions.map((sp) => ({ id: sp.id as string | null, title: sp.name, items: [1, 2, 3, 4, 5].filter((f) => floorSel[f] === sp.id).map(floorItem) })),
                { id: null, title: t("planning.floorPlanOpenCard"), tone: "open" as const, items: [1, 2, 3, 4, 5].filter((f) => !floorSel[f] || !supOptions.some((sp) => sp.id === floorSel[f])).map(floorItem) },
              ]}
            />
          </div>
        )}

        {tab === "houseman" && (
          <div>
            <p className="mb-3 text-sm text-graphite/70">{t("planungTool.housemanHint")}</p>
            {tasks === null ? <p className="text-sm text-graphite/60">{t("common.loading")}</p> : tasks.length === 0 ? <p className="text-sm text-graphite/70">{t("planungTool.noHousemanTasks")}</p> : (
              <DragDropBoard
                hint={t("board.hint")}
                onMove={(ids, to) => { for (const id of ids) onHmEdit(id, to); }}
                columns={[
                  ...housemen.map((h) => ({ id: h.id as string | null, title: h.name, items: openTasks.filter((it) => hmPreview[it.id] === h.id).map(taskItem) })),
                  { id: null, title: t("planungTool.housemanUnassigned"), tone: "open" as const, items: openTasks.filter((it) => !hmPreview[it.id]).map(taskItem) },
                ]}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
