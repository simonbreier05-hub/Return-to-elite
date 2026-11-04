"use client";

import type { ReactNode } from "react";

/**
 * Rahmen des Planungstools im Design „Glas & Premium“ (D4, Figma `34:1410`). Ab 768 px zweispaltig (links das Haus,
 * rechts das Steuerpanel mit Stepper). Darunter (Handy): dieselben dunklen Glas-Token, oben `top` (Fortschrittssegmente),
 * das Haus entfällt, unten fest die Daumenzone `actions` mit Hauptbutton und Zurück (Safe-Area beachtet).
 */
export default function PlanungShell({ top, house, panel, actions }: { top: ReactNode; house: ReactNode; panel: ReactNode; actions: ReactNode }) {
  return (
    <div className="planung-root theme-glass bg-atmosphere min-h-screen text-text-primary md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <div className="hidden px-4 py-6 md:block md:px-6 md:py-10 lg:px-8 lg:py-12">{house}</div>
      <aside className="flex min-h-screen flex-col bg-bg-sidebar px-4 pb-40 pt-4 md:min-h-[28rem] md:border-s md:border-border-subtle md:px-6 md:pb-10 md:pt-10 lg:px-8">
        {top}
        {panel}
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border-subtle bg-bg-sidebar px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:static md:z-auto md:mt-6 md:border-0 md:bg-transparent md:p-0">
          {actions}
        </div>
      </aside>
    </div>
  );
}
