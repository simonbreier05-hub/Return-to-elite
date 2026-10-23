"use client";

import { useState } from "react";
import CloseButton from "@/components/CloseButton";
import { useEscapeKey } from "@/components/useEscapeKey";
import PlanningFloorPlanPanel from "@/components/PlanningFloorPlanPanel";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { PlanDraft } from "./usePlanungFlow";

type Tab = "rooms" | "supervisors" | "houseman";

/**
 * Entwurf ansehen und bearbeiten: Zimmerlisten im Grundriss (dieselbe Komponente wie die Zuteilung nach der Bestätigung,
 * hier im Entwurfsmodus), dazu die Supervisor-Listen (Etagen) und die Hausmann-Liste. Nichts ist live, bevor bestätigt wird.
 */
export default function PlanEditorWindow({
  draft, supervisors, housemen, onAssign, onClose, onEditFloors,
}: {
  draft: PlanDraft;
  supervisors: { name: string; floors: number[] }[];
  housemen: string[];
  onAssign: (roomId: string, hkId: string | null, confirmStarted: boolean) => void;
  onClose: () => void;
  onEditFloors: () => void;
}) {
  const { t } = useLocale();
  const [tab, setTab] = useState<Tab>("rooms");
  useEscapeKey(onClose);
  const tabs: [Tab, string][] = [["rooms", t("planungTool.tabRooms")], ["supervisors", t("planungTool.tabSupervisors")], ["houseman", t("planungTool.tabHouseman")]];
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ivory text-charcoal" role="dialog" aria-modal="true" aria-label={t("planungTool.editorTitle")}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-charcoal/10 bg-linen px-4 py-3">
        <div>
          <h2 className="font-serif text-2xl leading-tight">{t("planungTool.editorTitle")}</h2>
          <p className="text-xs text-graphite/70">{t("planungTool.editorHint")}</p>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="mx-auto max-w-6xl px-4 py-4">
        <div className="mb-4 flex flex-wrap gap-2" role="tablist">
          {tabs.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`h-11 rounded-lg border px-4 text-sm font-medium ${tab === id ? "border-gold-line bg-parchment shadow-sm" : "border-charcoal/15 bg-white"}`}>{label}</button>
          ))}
        </div>
        {tab === "rooms" && (
          <PlanningFloorPlanPanel
            onShiftAttendants={draft.input.housekeepers.map((h) => ({ id: h.id, name: h.name }))}
            actionableRoomIds={draft.input.rooms.map((r) => r.id)}
            draft={{ rooms: draft.input.rooms, assignment: draft.assignment, onAssign }}
          />
        )}
        {tab === "supervisors" && (
          <div>
            {supervisors.length === 0 ? <p className="text-sm text-graphite/70">{t("planungTool.noSupervisorLists")}</p> : (
              <ul className="space-y-2">
                {supervisors.map((s) => (
                  <li key={s.name} className="rounded-xl border border-charcoal/10 bg-white p-3 text-sm"><span className="font-medium">{s.name}</span> · {t("planungTool.floorsLabel")} {s.floors.join(", ")}</li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => { onClose(); onEditFloors(); }} className="mt-3 h-11 rounded-lg border border-charcoal/15 bg-white px-4 text-sm font-medium hover:border-gold-line">{t("planungTool.editFloors")}</button>
          </div>
        )}
        {tab === "houseman" && (
          <div className="text-sm">
            {housemen.length === 0 ? <p className="text-graphite/70">{t("planungTool.noHousemanList")}</p> : (
              <ul className="space-y-2">{housemen.map((n) => <li key={n} className="rounded-xl border border-charcoal/10 bg-white p-3 font-medium">{n}</li>)}</ul>
            )}
            <p className="mt-3 text-graphite/70">{t("planungTool.housemanHint")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
