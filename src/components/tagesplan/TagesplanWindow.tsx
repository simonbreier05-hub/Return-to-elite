"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { useEscapeKey } from "@/components/useEscapeKey";
import { GlassMode } from "@/components/shell/GlassMode";
import { Button } from "@/components/ui";
import type { DraftBinding, OnShiftAttendant } from "@/components/usePlanningFloorPlan";
import { TagesplanView } from "./TagesplanView";
import type { TagesplanMeta } from "./useTagesplanMeta";

/**
 * Tagesplan im Planungstool (Duty Manager, Schritt „Plan“): der Vorschlag als letzter Schritt — Vollbild im Glas-Stil,
 * per Portal an `body`. Zuteilen ändert nur den Entwurf (`DraftBinding`); live geht der Plan erst mit
 * „Plan prüfen und bestätigen“ (bestehender Weg `PlanConfirmDialog` → `confirmProposal`). Schließen mit Knopf und Escape.
 */
export function TagesplanWindow({
  onClose, onShiftAttendants, draft, meta, date, onLists, confirm,
}: {
  onClose: () => void;
  onShiftAttendants: OnShiftAttendant[];
  draft: DraftBinding;
  meta: TagesplanMeta;
  date: string | null;
  /** Listen-Ansicht (Zimmerlisten/Supervisor/Hausmann) im bisherigen `PlanEditorWindow`. */
  onLists: () => void;
  /** Hauptknopf unten, z. B. „Plan prüfen und bestätigen“. */
  confirm: ReactNode;
}) {
  const { t } = useLocale();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEscapeKey(onClose);
  if (!mounted) return null;
  return createPortal(
    <div className="theme-glass bg-atmosphere fixed inset-0 z-40 overflow-y-auto text-text-primary" role="dialog" aria-modal="true" aria-labelledby="tp-window-title">
      <GlassMode>
        <div className="mx-auto flex max-w-[1680px] flex-col gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <h1 id="tp-window-title" className="text-title-28 min-w-0 flex-1 truncate">{t("tagesplan.title")}</h1>
            <Button variant="secondary" icon="list" onClick={onLists}>{t("tagesplan.lists")}</Button>
            <Button variant="secondary" icon="x" onClick={onClose}>{t("common.close")}</Button>
          </div>
          <TagesplanView onShiftAttendants={onShiftAttendants} draft={draft} meta={meta} date={date} footer={confirm} />
        </div>
      </GlassMode>
    </div>,
    document.body,
  );
}
