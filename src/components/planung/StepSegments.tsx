"use client";

import Link from "next/link";

import type { StepId } from "@/lib/planung/model";

/**
 * Mobil (Design C): Kopfzeile mit Datum + „Schritt n von 4" und vier Fortschrittssegmente. Das aktuelle Segment füllt sich
 * (nur `transform`). Keine Bedienelemente — zurück geht es über die Daumenzone.
 */
export default function StepSegments({ current, labels, dateText, stepText, ariaLabel, leaveLabel }: { current: StepId; labels: Record<StepId, string>; dateText: string; stepText: string; ariaLabel: string; leaveLabel: string }) {
  return (
    <div className="mb-5 md:hidden">
      <Link href="/supervisor" className="-ml-3 mb-1 inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-medium text-pl-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light"><span aria-hidden>←</span>{leaveLabel}</Link>
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
