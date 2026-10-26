"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";

/**
 * Zwei-Tap-Bestätigung: der erste Tipp „scharf" (Text wechselt zu „Nochmal tippen zum Bestätigen"), erst der zweite speichert.
 * Fällt nach 4 s von selbst zurück — so wird nie versehentlich etwas gespeichert.
 */
export default function TwoTapButton({ children, onConfirm, disabled, className = "" }: { children: ReactNode; onConfirm: () => void | Promise<void>; disabled?: boolean; className?: string }) {
  const { t } = useLocale();
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const click = () => {
    if (!armed) { setArmed(true); timer.current = setTimeout(() => setArmed(false), 4000); return; }
    if (timer.current) clearTimeout(timer.current);
    setArmed(false);
    void onConfirm();
  };
  return (
    <button type="button" disabled={disabled} onClick={click} aria-live="polite"
      className={`min-h-11 rounded-lg border px-3 text-sm font-medium disabled:opacity-40 ${armed ? "border-gold bg-gold text-white" : "border-charcoal/20 bg-white"} ${className}`}>
      {armed ? t("roomEdit.confirm") : children}
    </button>
  );
}
