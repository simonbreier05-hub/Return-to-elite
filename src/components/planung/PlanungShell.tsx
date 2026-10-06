"use client";

import type { ReactNode } from "react";

/**
 * Rahmen des Planungstools. Ab 768 px zweispaltig (links das Haus, rechts das Steuerpanel mit Stepper).
 * Darunter (Mobil, Design C): helle Variante, oben `top` (Fortschrittssegmente), das Haus entfällt, unten fest die
 * Daumenzone `actions` mit Hauptbutton und Zurück (Safe-Area beachtet).
 */
export default function PlanungShell({ top, house, panel, actions }: { top: ReactNode; house: ReactNode; panel: ReactNode; actions: ReactNode }) {
  return (
    <div className="planung-root min-h-screen bg-night-900 text-pl-text md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <div className="hidden px-4 py-6 md:block md:px-6 md:py-10 lg:px-8 lg:py-12">{house}</div>
      <aside className="flex min-h-screen flex-col bg-night-700 px-4 pb-36 pt-4 md:min-h-[28rem] md:border-l md:border-line-1 md:px-6 md:pb-10 md:pt-10 lg:px-8">
        {top}
        {panel}
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line-1 bg-night-700/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:static md:z-auto md:mt-6 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          {actions}
        </div>
      </aside>
    </div>
  );
}
