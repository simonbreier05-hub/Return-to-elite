"use client";

import type { ReactNode } from "react";

/**
 * A titled panel that sits in-flow inside an existing hub page — a "window"
 * onto a focused slice of that hub's data (e.g. "Meine Zimmer", "Zimmerstatus"),
 * additive to whatever the hub already renders. `` rather than the
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
    <div className="mb-4 overflow-hidden rounded-(--glass-radius-lg) border border-border-subtle bg-surface-card-raised">
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle bg-surface-card-raised px-4 py-3">
        <div className="flex items-center gap-2">
          {icon ?? <span className="h-2 w-2 rounded-full bg-champagne" />}
          <span className="text-body-18 text-text-primary">{title}</span>
        </div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
