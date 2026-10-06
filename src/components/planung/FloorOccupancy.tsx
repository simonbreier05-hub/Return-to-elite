"use client";

import type { FloorStats } from "@/lib/planung/model";

/** Auslastungsbalken + Text je Etage. Der Balken wächst von 0 auf die Belegung (1100 ms, je Etage 120 ms später). */
export default function FloorOccupancy({
  stats, hasData, index, animateKey, textOccupied, textNoData,
}: { stats: FloorStats; hasData: boolean; index: number; animateKey: number; textOccupied: string; textNoData: string }) {
  return (
    <div className="w-28 shrink-0 sm:w-36">
      <div className="h-2 overflow-hidden rounded-full bg-line-1/70" aria-hidden>
        {hasData && (
          <div key={animateKey} className="pl-bar h-full w-full rounded-full bg-brass-light" style={{ transform: `scaleX(${stats.ratio})`, ["--i" as string]: index }} />
        )}
      </div>
      <div className="mt-1 text-right text-xs text-pl-muted">{hasData ? textOccupied : textNoData}</div>
    </div>
  );
}
