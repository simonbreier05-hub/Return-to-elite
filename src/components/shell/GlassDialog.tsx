"use client";

import { useId, type ReactNode } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { Button } from "@/components/ui/Button";
import type { IconName } from "@/lib/ui/icons";
import { Overlay } from "./Overlay";

export interface GlassDialogProps {
  open: boolean;
  title: string;
  /** Hauptzeile unter dem Titel (Body/18), z. B. „Zimmer 312 · Licht im Bad defekt“. */
  message?: string;
  /** Weitere Angaben (Body/16, gedämpft) oder eigener Inhalt. */
  children?: ReactNode;
  confirmLabel: string;
  confirmIcon?: IconName;
  onConfirm: () => void;
  /** Standard: „Abbrechen“ (common.cancel). */
  cancelLabel?: string;
  onCancel: () => void;
  busy?: boolean;
}

/** Bestätigungsdialog im Glas-Stil (Figma `36:2364`): Titel, Text, Abbrechen (secondary) + Bestätigen (primary). Escape = Abbrechen. */
export function GlassDialog({ open, title, message, children, confirmLabel, confirmIcon = "check", onConfirm, cancelLabel, onCancel, busy }: GlassDialogProps) {
  const { t } = useLocale();
  const id = useId();
  if (!open) return null;
  return (
    <Overlay placement="center" onClose={onCancel} labelledBy={`${id}-title`} className="w-full max-w-[520px]">
      <div className="glass flex flex-col gap-3 rounded-(--glass-radius-lg) p-6">
        <h2 id={`${id}-title`} className="text-title-28 text-text-primary">
          {title}
        </h2>
        {message && <p className="text-body-18 text-text-primary">{message}</p>}
        {children && <div className="text-body-16 text-text-secondary">{children}</div>}
        <div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button variant="secondary" icon="x" onClick={onCancel} data-autofocus disabled={busy}>
            {cancelLabel ?? t("common.cancel")}
          </Button>
          <Button icon={confirmIcon} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}
