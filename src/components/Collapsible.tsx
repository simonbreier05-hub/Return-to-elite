"use client";

import { useState, type ReactNode } from "react";

/**
 * A click-to-open sub-level for one floor (or any grouped section). Starts
 * collapsed by default — every floor, in every layout, opens as a scannable
 * list of headers first rather than a wall of tiles/chips. Used by the Live
 * Board, My Rooms, the planning cards, and the attendant running-order plan.
 *
 * Pass a `resetKey` that changes when the caller wants the open/closed state
 * re-decided from scratch (e.g. a search/filter turning on should force the
 * matching floor open) — React remounts the section and re-reads
 * `defaultOpen` when the key changes.
 */
export default function Collapsible({
  summary,
  defaultOpen = false,
  children,
}: {
  summary: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-charcoal/10 bg-linen/50">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition hover:bg-parchment/60"
        aria-expanded={open}
      >
        {summary}
        <svg
          className={`h-4 w-4 shrink-0 text-graphite/45 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="border-t border-charcoal/5 px-3 pb-3 pt-2.5">{children}</div>}
    </div>
  );
}
