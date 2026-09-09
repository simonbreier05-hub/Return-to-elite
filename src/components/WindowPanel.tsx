"use client";

import type { ReactNode } from "react";

/**
 * A titled panel that sits in-flow inside an existing hub page — a "window"
 * onto a focused slice of that hub's data (e.g. "Meine Zimmer", "Zimmerstatus"),
 * additive to whatever the hub already renders. `shadow-card` rather than the
 * heavier `shadow-2xl` used by floating overlays (RoomDrawer, the notification
 * dropdown): this panel is normal page content, not an overlay.
 */
export default function WindowPanel({
  title,
  icon,
  right,
  children,
}: {
  title: string;
  /** Defaults to a small gold accent dot when omitted. */
  icon?: ReactNode;
  /** Optional right-aligned slot in the header, e.g. a count or summary. */
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-charcoal/10 bg-white shadow-card">
      <div className="flex items-center justify-between gap-2 border-b border-charcoal/10 bg-parchment/40 px-4 py-3">
        <div className="flex items-center gap-2">
          {icon ?? <span className="h-2 w-2 rounded-full bg-gold" />}
          <span className="font-serif text-lg text-charcoal">{title}</span>
        </div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
