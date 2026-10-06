"use client";

import type { ReactNode } from "react";

/**
 * Rahmen des Planungstools: links das Haus (dunkle Fläche), rechts das Steuerpanel mit Stepper.
 * Auf schmalen Bildschirmen untereinander (Mobil-Design C folgt in D2), ab 1024 px zweispaltig.
 */
export default function PlanungShell({ house, panel }: { house: ReactNode; panel: ReactNode }) {
  return (
    <div className="planung-root min-h-screen bg-night-900 text-pl-text lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <div className="px-4 py-6 sm:px-8 sm:py-10 lg:py-12">{house}</div>
      <aside className="flex min-h-[28rem] flex-col border-t border-line-1 bg-night-700 px-4 py-6 sm:px-8 sm:py-10 lg:border-l lg:border-t-0">{panel}</aside>
    </div>
  );
}
