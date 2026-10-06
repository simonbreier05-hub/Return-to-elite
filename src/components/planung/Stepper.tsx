"use client";

import { Fragment } from "react";
import { canGoTo, stepState, type StepId } from "@/lib/planung/model";

const STEPS: StepId[] = [1, 2, 3, 4];

/**
 * Stepper (1–4): Kreise mit Linien. Beim Weitergehen füllt sich die Linie, der Punkt springt auf ein
 * Häkchen. Zustand steht auch im Text (aria-label, aria-current), nie nur in der Farbe.
 */
export default function Stepper({
  current, reached, labels, onSelect, ariaLabel,
}: { current: StepId; reached: StepId; labels: Record<StepId, string>; onSelect: (s: StepId) => void; ariaLabel: string }) {
  return (
    <nav aria-label={ariaLabel}>
      <ol className="flex items-center">
        {STEPS.map((s, i) => {
          const st = stepState(s, current);
          const enabled = canGoTo(s, current, reached);
          return (
            <Fragment key={s}>
              {i > 0 && (
                <li aria-hidden className="relative mx-1 h-0.5 flex-1 rounded-full bg-line-1">
                  {s <= current && <span key={`fill-${s}-${current}`} className="pl-fill absolute inset-0 rounded-full bg-brass-light" />}
                </li>
              )}
              <li>
                <button
                  type="button"
                  disabled={!enabled}
                  onClick={() => onSelect(s)}
                  aria-current={st === "current" ? "step" : undefined}
                  aria-label={`${labels[s]}${st === "done" ? " ✓" : ""}`}
                  title={labels[s]}
                  className={`relative flex h-11 w-11 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light focus-visible:ring-offset-2 focus-visible:ring-offset-night-700 ${
                    st === "current" ? "border-pl-text bg-pl-text text-night-900"
                    : st === "done" ? "border-brass-light bg-brass-light text-night-900"
                    : "border-line-2 text-pl-muted"
                  } ${enabled && st !== "current" ? "cursor-pointer hover:border-pl-text" : ""}`}
                >
                  {st === "done" ? (
                    <svg key={`check-${s}`} className="pl-pop h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M4 10.5l4 4 8-9" />
                    </svg>
                  ) : s}
                </button>
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
