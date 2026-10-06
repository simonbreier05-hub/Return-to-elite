"use client";

import type { StepId } from "@/lib/planung/model";

/**
 * Mobil (Design C): Kopfzeile mit Datum + „Schritt n von 4" und vier Fortschrittssegmente. Das aktuelle Segment füllt sich
 * (nur `transform`). Keine Bedienelemente — zurück geht es über die Daumenzone.
 */
export default function StepSegments({ current, labels, dateText, stepText, ariaLabel }: { current: StepId; labels: Record<StepId, string>; dateText: string; stepText: string; ariaLabel: string }) {
  return (
    <div className="mb-5 md:hidden">
      <div className="flex items-baseline justify-between">
        <span className="font-serif text-2xl font-semibold">StayClean</span>
        <span className="text-xs text-pl-muted">{dateText} · {stepText}</span>
      </div>
      <ol aria-label={ariaLabel} className="mt-3 flex gap-2">
        {([1, 2, 3, 4] as StepId[]).map((s) => (
          <li key={s} aria-current={s === current ? "step" : undefined} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-line-1">
            <span className="sr-only">{labels[s]}{s < current ? " ✓" : ""}</span>
            {s <= current && <span key={`${s}-${current}`} className={`${s === current ? "pl-fill" : ""} absolute inset-0 origin-left rounded-full bg-pl-text`} />}
          </li>
        ))}
      </ol>
    </div>
  );
}
